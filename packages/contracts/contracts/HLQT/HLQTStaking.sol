// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "../Dependencies/BaseMath.sol";
import "../Dependencies/SafeMath.sol";
import "../Dependencies/Ownable.sol";
import "../Dependencies/CheckContract.sol";
import "../Dependencies/console.sol";
import "../Interfaces/IHLQTToken.sol";
import "../Interfaces/IHLQTStaking.sol";
import "../Dependencies/LiquityMath.sol";
import "../Interfaces/IHCHFToken.sol";
import "../Dependencies/BaseHST.sol";

contract HLQTStaking is IHLQTStaking, Ownable, CheckContract, BaseMath, BaseHST {
    using SafeMath for uint;

    // --- Data ---
    string constant public NAME = "HLQTStaking";

    mapping(address => uint) public stakes;
    uint public totalHLQTStaked;

    uint public F_ETH;  // Running sum of HBAR fees per-HLQT-staked
    uint public F_HCHF; // Running sum of HLQT fees per-HLQT-staked

    // User snapshots of F_ETH and F_HCHF, taken at the point at which their latest deposit was made
    mapping(address => Snapshot) public snapshots;

    struct Snapshot {
        uint F_ETH_Snapshot;
        uint F_HCHF_Snapshot;
    }

    IHLQTToken public hlqtToken;
    IHCHFToken public hchfToken;

    address public troveManagerAddress;
    address public borrowerOperationsAddress;
    address public activePoolAddress;

    // --- Events ---

    event HLQTTokenAddressSet(address _hlqtTokenAddress);
    event HCHFTokenAddressSet(address _hchfTokenAddress);
    event TroveManagerAddressSet(address _troveManager);
    event BorrowerOperationsAddressSet(address _borrowerOperationsAddress);
    event ActivePoolAddressSet(address _activePoolAddress);

    event StakeChanged(address indexed staker, uint newStake);
    event StakingGainsWithdrawn(address indexed staker, uint HCHFGain, uint ETHGain);
    event F_ETHUpdated(uint _F_ETH);
    event F_HCHFUpdated(uint _F_HCHF);
    event TotalHLQTStakedUpdated(uint _totalHLQTStaked);
    event EtherSent(address _account, uint _amount);
    event StakerSnapshotsUpdated(address _staker, uint _F_ETH, uint _F_HCHF);

    // --- Functions ---

    function setAddresses
    (
        address _hlqtTokenAddress,
        address _hchfTokenAddress,
        address _troveManagerAddress,
        address _borrowerOperationsAddress,
        address _activePoolAddress
    )
    external
    onlyOwner
    override
    {
        checkContract(_hlqtTokenAddress);
        checkContract(_hchfTokenAddress);
        checkContract(_troveManagerAddress);
        checkContract(_borrowerOperationsAddress);
        checkContract(_activePoolAddress);

        hlqtToken = IHLQTToken(_hlqtTokenAddress);
        hchfToken = IHCHFToken(_hchfTokenAddress);
        troveManagerAddress = _troveManagerAddress;
        borrowerOperationsAddress = _borrowerOperationsAddress;
        activePoolAddress = _activePoolAddress;

        _associateToken(address(this), hchfToken.getTokenAddress());
        _associateToken(address(this), hlqtToken.getTokenAddress());

        emit HLQTTokenAddressSet(_hlqtTokenAddress);
        emit HLQTTokenAddressSet(_hchfTokenAddress);
        emit TroveManagerAddressSet(_troveManagerAddress);
        emit BorrowerOperationsAddressSet(_borrowerOperationsAddress);
        emit ActivePoolAddressSet(_activePoolAddress);

        _renounceOwnership();
    }

    // If caller has a pre-existing stake, send any accumulated ETH and HCHF gains to them.
    function stake(uint _HLQTamount) external override {
        _requireNonZeroAmount(_HLQTamount);

        uint currentStake = stakes[msg.sender];

        uint ETHGain;
        uint HCHFGain;
        // Grab any accumulated ETH and HCHF gains from the current stake
        if (currentStake != 0) {
            ETHGain = _getPendingETHGain(msg.sender);
            HCHFGain = _getPendingHCHFGain(msg.sender);
        }

        _updateUserSnapshots(msg.sender);

        uint newStake = currentStake.add(_HLQTamount);

        // Increase user’s stake and total HLQT staked
        stakes[msg.sender] = newStake;
        totalHLQTStaked = totalHLQTStaked.add(_HLQTamount);
        emit TotalHLQTStakedUpdated(totalHLQTStaked);

        // Transfer HLQT from caller to this contract
        hlqtToken.sendToHLQTStaking(msg.sender, _HLQTamount);

        emit StakeChanged(msg.sender, newStake);
        emit StakingGainsWithdrawn(msg.sender, HCHFGain, ETHGain);

        // Send accumulated HCHF and ETH gains to the caller
        if (currentStake != 0) {
            _transfer(hchfToken.getTokenAddress(), address(this), msg.sender, HCHFGain);

            _sendETHGainToUser(ETHGain);
        }
    }

    // Unstake the HLQT and send the it back to the caller, along with their accumulated HCHF & ETH gains.
    // If requested amount > stake, send their entire stake.
    function unstake(uint _HLQTamount) external override {
        uint currentStake = stakes[msg.sender];
        _requireUserHasStake(currentStake);

        // Grab any accumulated ETH and HCHF gains from the current stake
        uint ETHGain = _getPendingETHGain(msg.sender);
        uint HCHFGain = _getPendingHCHFGain(msg.sender);

        _updateUserSnapshots(msg.sender);

        if (_HLQTamount > 0) {
            uint HLQTToWithdraw = LiquityMath._min(_HLQTamount, currentStake);

            uint newStake = currentStake.sub(HLQTToWithdraw);

            // Decrease user's stake and total HLQT staked
            stakes[msg.sender] = newStake;
            totalHLQTStaked = totalHLQTStaked.sub(HLQTToWithdraw);
            emit TotalHLQTStakedUpdated(totalHLQTStaked);

            // Transfer unstaked HLQT to user
            _transfer(hlqtToken.getTokenAddress(), address(this), msg.sender, HLQTToWithdraw);

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
        uint ETHFeePerHLQTStaked;

        if (totalHLQTStaked > 0) {ETHFeePerHLQTStaked = _ETHFee.mul(DECIMAL_PRECISION).div(totalHLQTStaked);}

        F_ETH = F_ETH.add(ETHFeePerHLQTStaked);
        emit F_ETHUpdated(F_ETH);
    }

    function increaseF_HCHF(uint _HCHFFee) external override {
        _requireCallerIsBorrowerOperations();
        uint HCHFFeePerHLQTStaked;

        if (totalHLQTStaked > 0) {HCHFFeePerHLQTStaked = _HCHFFee.mul(DECIMAL_PRECISION).div(totalHLQTStaked);}

        F_HCHF = F_HCHF.add(HCHFFeePerHLQTStaked);
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
