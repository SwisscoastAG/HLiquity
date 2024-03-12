// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "../Dependencies/BaseMath.sol";
import "../Dependencies/SafeMath.sol";
import "../Dependencies/Ownable.sol";
import "../Dependencies/CheckContract.sol";
import "../Dependencies/console.sol";
import "../Interfaces/IHLQTYToken.sol";
import "../Interfaces/IHLQTYStaking.sol";
import "../Dependencies/LiquityMath.sol";
import "../Interfaces/IHCHFToken.sol";
import "../Dependencies/BaseHST.sol";

contract HLQTYStaking is IHLQTYStaking, Ownable, CheckContract, BaseMath, BaseHST {
    using SafeMath for uint;

    // --- Data ---
    string constant public NAME = "HLQTStaking";

    mapping(address => uint) public stakes;
    uint public totalHLQTYStaked;

    uint public F_ETH;  // Running sum of HBAR fees per-HLQTY-staked
    uint public F_HCHF; // Running sum of HLQTY fees per-HLQTY-staked

    // User snapshots of F_ETH and F_HCHF, taken at the point at which their latest deposit was made
    mapping(address => Snapshot) public snapshots;

    struct Snapshot {
        uint F_ETH_Snapshot;
        uint F_HCHF_Snapshot;
    }

    IHLQTYToken public hlqtyToken;
    IHCHFToken public hchfToken;

    address public troveManagerAddress;
    address public borrowerOperationsAddress;
    address public activePoolAddress;

    // --- Events ---

    event HLQTYTokenAddressSet(address _hlqtyTokenAddress);
    event HCHFTokenAddressSet(address _hchfTokenAddress);
    event TroveManagerAddressSet(address _troveManager);
    event BorrowerOperationsAddressSet(address _borrowerOperationsAddress);
    event ActivePoolAddressSet(address _activePoolAddress);

    event StakeChanged(address indexed staker, uint newStake);
    event StakingGainsWithdrawn(address indexed staker, uint HCHFGain, uint ETHGain);
    event F_ETHUpdated(uint _F_ETH);
    event F_HCHFUpdated(uint _F_HCHF);
    event TotalHLQTYStakedUpdated(uint _totalHLQTYStaked);
    event EtherSent(address _account, uint _amount);
    event StakerSnapshotsUpdated(address _staker, uint _F_ETH, uint _F_HCHF);

    // --- Functions ---

    function setAddresses
    (
        address _hlqtyTokenAddress,
        address _hchfTokenAddress,
        address _troveManagerAddress,
        address _borrowerOperationsAddress,
        address _activePoolAddress
    )
    external
    onlyOwner
    override
    {
        checkContract(_hlqtyTokenAddress);
        checkContract(_hchfTokenAddress);
        checkContract(_troveManagerAddress);
        checkContract(_borrowerOperationsAddress);
        checkContract(_activePoolAddress);

        hlqtyToken = IHLQTYToken(_hlqtyTokenAddress);
        hchfToken = IHCHFToken(_hchfTokenAddress);
        troveManagerAddress = _troveManagerAddress;
        borrowerOperationsAddress = _borrowerOperationsAddress;
        activePoolAddress = _activePoolAddress;

        _associateToken(address(this), hchfToken.getTokenAddress());
        _associateToken(address(this), hlqtyToken.getTokenAddress());

        emit HLQTYTokenAddressSet(_hlqtyTokenAddress);
        emit HLQTYTokenAddressSet(_hchfTokenAddress);
        emit TroveManagerAddressSet(_troveManagerAddress);
        emit BorrowerOperationsAddressSet(_borrowerOperationsAddress);
        emit ActivePoolAddressSet(_activePoolAddress);

        _renounceOwnership();
    }

    // If caller has a pre-existing stake, send any accumulated ETH and HCHF gains to them.
    function stake(uint _HLQTYamount) external override {
        _requireNonZeroAmount(_HLQTYamount);

        uint currentStake = stakes[msg.sender];

        uint ETHGain;
        uint HCHFGain;
        // Grab any accumulated ETH and HCHF gains from the current stake
        if (currentStake != 0) {
            ETHGain = _getPendingETHGain(msg.sender);
            HCHFGain = _getPendingHCHFGain(msg.sender);
        }

        _updateUserSnapshots(msg.sender);

        uint newStake = currentStake.add(_HLQTYamount);

        // Increase user’s stake and total HLQTY staked
        stakes[msg.sender] = newStake;
        totalHLQTYStaked = totalHLQTYStaked.add(_HLQTYamount);
        emit TotalHLQTYStakedUpdated(totalHLQTYStaked);

        // Transfer HLQTY from caller to this contract
        hlqtyToken.sendToHLQTYStaking(msg.sender, _HLQTYamount);

        emit StakeChanged(msg.sender, newStake);
        emit StakingGainsWithdrawn(msg.sender, HCHFGain, ETHGain);

        // Send accumulated HCHF and ETH gains to the caller
        if (currentStake != 0) {
            _transfer(hchfToken.getTokenAddress(), address(this), msg.sender, HCHFGain);

            _sendETHGainToUser(ETHGain);
        }
    }

    // Unstake the HLQTY and send the it back to the caller, along with their accumulated HCHF & ETH gains.
    // If requested amount > stake, send their entire stake.
    function unstake(uint _HLQTYamount) external override {
        uint currentStake = stakes[msg.sender];
        _requireUserHasStake(currentStake);

        // Grab any accumulated ETH and HCHF gains from the current stake
        uint ETHGain = _getPendingETHGain(msg.sender);
        uint HCHFGain = _getPendingHCHFGain(msg.sender);

        _updateUserSnapshots(msg.sender);

        if (_HLQTYamount > 0) {
            uint HLQTYToWithdraw = LiquityMath._min(_HLQTYamount, currentStake);

            uint newStake = currentStake.sub(HLQTYToWithdraw);

            // Decrease user's stake and total HLQTY staked
            stakes[msg.sender] = newStake;
            totalHLQTYStaked = totalHLQTYStaked.sub(HLQTYToWithdraw);
            emit TotalHLQTYStakedUpdated(totalHLQTYStaked);

            // Transfer unstaked HLQTY to user
            _transfer(hlqtyToken.getTokenAddress(), address(this), msg.sender, HLQTYToWithdraw);

            emit StakeChanged(msg.sender, newStake);
        }

        emit StakingGainsWithdrawn(msg.sender, HCHFGain, ETHGain);

        // Send accumulated HCHF and ETH gains to the caller
        _transfer(hchfToken.getTokenAddress(), address(this), msg.sender, HCHFGain);
        _sendETHGainToUser(ETHGain);
    }

    // --- Reward-per-unit-staked increase functions. Called by Liquity core contracts ---

    function increaseF_ETH(uint _ETHFee) external override {
        _requireCallerIsTroveManager();
        uint ETHFeePerHLQTYStaked;

        if (totalHLQTYStaked > 0) {ETHFeePerHLQTYStaked = _ETHFee.mul(DECIMAL_PRECISION).div(totalHLQTYStaked);}

        F_ETH = F_ETH.add(ETHFeePerHLQTYStaked);
        emit F_ETHUpdated(F_ETH);
    }

    function increaseF_HCHF(uint _HCHFFee) external override {
        _requireCallerIsBorrowerOperations();
        uint HCHFFeePerHLQTYStaked;

        if (totalHLQTYStaked > 0) {HCHFFeePerHLQTYStaked = _HCHFFee.mul(DECIMAL_PRECISION).div(totalHLQTYStaked);}

        F_HCHF = F_HCHF.add(HCHFFeePerHLQTYStaked);
        emit F_HCHFUpdated(F_HCHF);
    }

    // --- Pending reward functions ---

    function getPendingETHGain(address _user) external view override returns (uint) {
        return _getPendingETHGain(_user);
    }

    function _getPendingETHGain(address _user) internal view returns (uint) {
        uint F_ETH_Snapshot = snapshots[_user].F_ETH_Snapshot;
        uint ETHGain = stakes[_user].mul(F_ETH.sub(F_ETH_Snapshot)).div(DECIMAL_PRECISION);
        return ETHGain;
    }

    function getPendingHCHFGain(address _user) external view override returns (uint) {
        return _getPendingHCHFGain(_user);
    }

    function _getPendingHCHFGain(address _user) internal view returns (uint) {
        uint F_HCHF_Snapshot = snapshots[_user].F_HCHF_Snapshot;
        uint HCHFGain = stakes[_user].mul(F_HCHF.sub(F_HCHF_Snapshot)).div(DECIMAL_PRECISION);
        return HCHFGain;
    }

    // --- Internal helper functions ---

    function _updateUserSnapshots(address _user) internal {
        snapshots[_user].F_ETH_Snapshot = F_ETH;
        snapshots[_user].F_HCHF_Snapshot = F_HCHF;
        emit StakerSnapshotsUpdated(_user, F_ETH, F_HCHF);
    }

    function _sendETHGainToUser(uint ETHGain) internal {
        emit EtherSent(msg.sender, ETHGain);
        (bool success,) = msg.sender.call{value: ETHGain}("");
        require(success, "HLQTStaking: Failed to send accumulated ETHGain");
    }

    // --- 'require' functions ---

    function _requireCallerIsTroveManager() internal view {
        require(msg.sender == troveManagerAddress, "HLQTStaking: caller is not TroveM");
    }

    function _requireCallerIsBorrowerOperations() internal view {
        require(msg.sender == borrowerOperationsAddress, "HLQTStaking: caller is not BorrowerOps");
    }

    function _requireCallerIsActivePool() internal view {
        require(msg.sender == activePoolAddress, "HLQTStaking: caller is not ActivePool");
    }

    function _requireUserHasStake(uint currentStake) internal pure {
        require(currentStake > 0, 'HLQTStaking: User must have a non-zero stake');
    }

    function _requireNonZeroAmount(uint _amount) internal pure {
        require(_amount > 0, 'HLQTStaking: Amount must be non-zero');
    }

    receive() external payable {
        _requireCallerIsActivePool();
    }
}
