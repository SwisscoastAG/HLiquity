// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "../Dependencies/CheckContract.sol";
import "../Dependencies/SafeMath.sol";
import "../Interfaces/IHLQTYToken.sol";
import "../Interfaces/ILockupContractFactory.sol";
import "../Dependencies/console.sol";
import "../Interfaces/IHederaTokenService.sol";
import "../Dependencies/ExpiryHelper.sol";
import "../Dependencies/KeyHelper.sol";
import "../Dependencies/IERC20.sol";
import "../Dependencies/HederaResponseCodes.sol";
import "../Dependencies/Ownable.sol";
import "../Dependencies/HederaTokenService.sol";

/*
*  --- Functionality added specific to the HLQTYToken ---
*
* 1) sendToHLQTYStaking(): callable only by Liquity core contracts, which move HLQTY tokens from user -> HLQTYStaking contract.
*
* 2) Supply hard-capped at 100 million
*
* 3) CommunityIssuance and LockupContractFactory addresses are set at deployment
*
* 4) The bug bounties / hackathons allocation of 2 million tokens is minted at deployment to an EOA

* 5) 32 million tokens are minted at deployment to the CommunityIssuance contract
*
* 6) The LP rewards allocation of (1 + 1/3) million tokens is minted at deployment to a Staking contract
*
* 7) (64 + 2/3) million tokens are minted at deployment to the Liquity multisig
*
* 8) Until one year from deployment:
* -Liquity multisig may only transfer() tokens to LockupContracts that have been deployed via & registered in the 
*  LockupContractFactory 
* -approve(), increaseAllowance(), decreaseAllowance() revert when called by the multisig
* -transferFrom() reverts when the multisig is the sender
* -sendToHLQTYStaking() reverts when the multisig is the sender, blocking the multisig from staking its HLQTY.
* 
* After one year has passed since deployment of the HLQTYToken, the restrictions on multisig operations are lifted
* and the multisig has the same rights as any other address.
*/

contract HLQTYToken is CheckContract, IHLQTYToken, ExpiryHelper, KeyHelper, HederaTokenService, Ownable {
    using SafeMath for uint256;
    address public tokenAddress;
    // --- ERC20 Data ---

    string constant internal _NAME = "HLQT";
    string constant internal _SYMBOL = "HLQT";
    uint8 constant internal  _DECIMALS = 8;


    // --- HLQTYToken specific data ---

    uint public constant ONE_YEAR_IN_SECONDS = 31536000;  // 60 * 60 * 24 * 365

    // uint for use with SafeMath
    uint internal _1_MILLION = 1e14;    // 1e6 * 1e8 = 1e14

    uint internal immutable deploymentStartTime;
    address public immutable multisigAddress;

    address public immutable communityIssuanceAddress;
    address public immutable hlqtyStakingAddress;

    uint internal immutable lpRewardsEntitlement;

    bool private initialized = false;

    ILockupContractFactory public immutable lockupContractFactory;

    // --- Events ---

    event CommunityIssuanceAddressSet(address _communityIssuanceAddress);
    event HLQTYStakingAddressSet(address _hlqtyStakingAddress);
    event LockupContractFactoryAddressSet(address _lockupContractFactoryAddress);

    // --- Functions ---

    constructor
    (
        address _communityIssuanceAddress,
        address _hlqtyStakingAddress,
        address _lockupFactoryAddress,
        address _multisigAddress
    ) 
        payable public
    {
        checkContract(_communityIssuanceAddress);
        checkContract(_hlqtyStakingAddress);
        checkContract(_lockupFactoryAddress);

        multisigAddress = _multisigAddress;
        deploymentStartTime  = block.timestamp;
        
        communityIssuanceAddress = _communityIssuanceAddress;
        hlqtyStakingAddress = _hlqtyStakingAddress;
        lockupContractFactory = ILockupContractFactory(_lockupFactoryAddress);

        // --- Deploy Hedera HTS ---

        IHederaTokenService.HederaToken memory token;
        token.name = _NAME;
        token.symbol = _SYMBOL;
        token.treasury = address(this);

        token.expiry = createAutoRenewExpiry(address(this), 8000000);

        IHederaTokenService.TokenKey[] memory keys = new IHederaTokenService.TokenKey[](1);
        keys[0] = getSingleKey(KeyType.SUPPLY, KeyValueType.INHERIT_ACCOUNT_KEY, bytes(""));

        token.tokenKeys = keys;

        (int responseCode, address createdTokenAddress) =
                                HederaTokenService.createFungibleToken(token, 0, _DECIMALS);

        _checkResponse(responseCode);
        tokenAddress = createdTokenAddress;

        uint _lpRewardsEntitlement = _1_MILLION.mul(4).div(3);  // Allocate 1.33 million for LP rewards
        lpRewardsEntitlement = _lpRewardsEntitlement;
    }

    // Hedera: We have to do the minting here because we need time to associate the beneficiaries with the token
    function initialize(address _bountyAddress, address _lpRewardsAddress) external onlyOwner {
        require(!initialized, "initialize: already initialized");

        // --- Initial HLQTY allocations ---
        uint bountyEntitlement = _1_MILLION.mul(2); // Allocate 2 million for bounties/hackathons
        _mint(_bountyAddress, bountyEntitlement);

        uint depositorsAndFrontEndsEntitlement = _1_MILLION.mul(32); // Allocate 32 million to the algorithmic issuance schedule
        _mint(communityIssuanceAddress, depositorsAndFrontEndsEntitlement);

        _mint(_lpRewardsAddress, lpRewardsEntitlement);

        // Allocate the remainder to the HLQTY Multisig: (100 - 2 - 32 - 1.33) million = 64.66 million
        uint multisigEntitlement = _1_MILLION.mul(100)
            .sub(bountyEntitlement)
            .sub(depositorsAndFrontEndsEntitlement)
            .sub(lpRewardsEntitlement);

        _mint(multisigAddress, multisigEntitlement);

        initialized = true;
    }

    // --- External functions ---

    function balanceOf(
        address account
    ) external view override(IHLQTYToken) returns (uint256) {
        return _balanceOf(account);
    }

    function totalSupply() external view override returns (uint256) {
        return _totalSupply();
    }

    function getTokenAddress() external view override returns (address) {
        return tokenAddress;
    }

    function getDeploymentStartTime() external view override returns (uint256) {
        return deploymentStartTime;
    }

    function getLpRewardsEntitlement() external view override returns (uint256) {
        return lpRewardsEntitlement;
    }

    function sendToHLQTYStaking(address _sender, uint256 _amount) external override {
        _requireCallerIsHLQTYStaking();
        if (_isFirstYear()) { _requireSenderIsNotMultisig(_sender); }  // Prevent the multisig from staking HLQTY
        _transfer(_sender, hlqtyStakingAddress, _amount);
    }

    function _totalSupply() internal view returns (uint256) {
        return IERC20(tokenAddress).totalSupply();
    }

    function _transfer(address sender, address recipient, uint256 amount) internal {
        require(sender != address(0), "ERC20: transfer from the zero address");
        require(recipient != address(0), "ERC20: transfer to the zero address");

        require(amount <= uint256(type(int64).max), "Amount exceeds int64 limits");

        int64 safeAmount = int64(amount);

        address currentTokenAddress = _getTokenAddress();

        int responseCode = HederaTokenService.transferToken(currentTokenAddress, sender, recipient, safeAmount);

        _checkResponse(responseCode);

        emit TokenTransfer(currentTokenAddress, sender, recipient, safeAmount);
    }

    function _balanceOf(
        address account
    ) internal view returns (uint256) {
        return IERC20(_getTokenAddress()).balanceOf(account);
    }

    function _mint(
        address account,
        uint256 amount
    )
    internal
    returns (bool)
    {
        require(account != address(0), "ERC20: mint to the zero address");
        require(amount <= uint256(type(int64).max), "Amount exceeds int64 limits");

        int64 safeAmount = int64(amount);

        address currentTokenAddress = _getTokenAddress();

        uint256 balance = _balanceOf(address(this));

        (int responseCode, ,) = HederaTokenService.mintToken(currentTokenAddress, safeAmount, new bytes[](0));

        bool success = _checkResponse(responseCode);

        if (
            !((_balanceOf(address(this)) - balance) ==
            amount)
        ) revert('The smart contract is not the treasury account');

        _transfer(address(this), account, amount);

        emit TokensMinted(msg.sender, currentTokenAddress, safeAmount, account);

        return success;
    }

    function _getTokenAddress() internal view returns (address) {
        return tokenAddress;
    }

    function _checkResponse(int responseCode) internal pure returns (bool) {
        // Using require to check the condition, and provide a custom error message if it fails.
        require(responseCode == HederaResponseCodes.SUCCESS, "ResponseCodeInvalid: provided code is not success");
        return true;
    }

    
    // --- Helper functions ---

    function _callerIsMultisig() internal view returns (bool) {
        return (msg.sender == multisigAddress);
    }

    function _isFirstYear() internal view returns (bool) {
        return (block.timestamp.sub(deploymentStartTime) < ONE_YEAR_IN_SECONDS);
    }

    // --- 'require' functions ---
    
    function _requireValidRecipient(address _recipient) internal view {
        require(
            _recipient != address(0) && 
            _recipient != address(this),
            "HLQT: Cannot transfer tokens directly to the HLQT token contract or the zero address"
        );
        require(
            _recipient != communityIssuanceAddress &&
            _recipient != hlqtyStakingAddress,
            "HLQT: Cannot transfer tokens directly to the community issuance or staking contract"
        );
    }

    function _requireRecipientIsRegisteredLC(address _recipient) internal view {
        require(lockupContractFactory.isRegisteredLockup(_recipient), 
        "HLQTToken: recipient must be a LockupContract registered in the Factory");
    }

    function _requireSenderIsNotMultisig(address _sender) internal view {
        require(_sender != multisigAddress, "HLQTToken: sender must not be the multisig");
    }

    function _requireCallerIsNotMultisig() internal view {
        require(!_callerIsMultisig(), "HLQTToken: caller must not be the multisig");
    }

    function _requireCallerIsHLQTYStaking() internal view {
         require(msg.sender == hlqtyStakingAddress, "HLQTToken: caller must be the HLQTStaking contract");
    }

    // --- Optional functions ---

    function name() external view override returns (string memory) {
        return _NAME;
    }

    function symbol() external view override returns (string memory) {
        return _SYMBOL;
    }

    function decimals() external view override returns (uint8) {
        return _DECIMALS;
    }
}
