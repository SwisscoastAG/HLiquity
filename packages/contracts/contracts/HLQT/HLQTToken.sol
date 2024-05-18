// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "../Dependencies/CheckContract.sol";
import "../Dependencies/SafeMath.sol";
import "../Interfaces/IHLQTToken.sol";
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
*  --- Functionality added specific to the HLQTToken ---
*
* 1) sendToHLQTStaking(): callable only by Liquity core contracts, which move HLQT tokens from user -> HLQTStaking contract.
*
*    - 18.7 million tokens are minted to the Community Issuance address.
*    - Tokens for LP rewards are minted to the specified LP rewards address.
*    - 2 million tokens are minted to the Advisor Multisig.
*    - 30 million tokens are minted to the Investor Multisig.
*    - 5 million tokens are minted to the Community Reserve Multisig.
*    - 3.8 million tokens are minted to the Service Providers Multisig.
*    - 19.2 million tokens are evenly distributed among four team members.
*
* 8) Until one year from deployment:
* -sendToHLQTStaking() reverts when the multisig is the sender, blocking the multisig from staking its HLQT.
* 
* After one year has passed since deployment of the HLQTToken, the restrictions on multisig operations are lifted
* and the multisig has the same rights as any other address.
*/

contract HLQTToken is CheckContract, IHLQTToken, ExpiryHelper, KeyHelper, HederaTokenService, Ownable {
    using SafeMath for uint256;
    address public immutable tokenAddress;

    string constant internal _NAME = "HLQT";
    string constant internal _SYMBOL = "HLQT";
    uint8 constant internal  _DECIMALS = 8;

    // --- HLQTToken specific data ---

    uint public constant ONE_YEAR_IN_SECONDS = 31536000;  // 60 * 60 * 24 * 365

    // uint for use with SafeMath
    uint internal _1_MILLION = 1e14;    // 1e6 * 1e8 = 1e14

    uint internal immutable deploymentStartTime;

    address public immutable crMultisigAddress;
    address public immutable advisorMultisigAddress;
    address public immutable investorMultisigAddress;
    address public immutable cresMultisigAddress;
    address public immutable spMultisigAddress;

    address public immutable communityIssuanceAddress;
    address public immutable hlqtStakingAddress;

    uint internal immutable lpRewardsEntitlement;

    bool private initialized = false;

    ILockupContractFactory public immutable lockupContractFactory;

    // --- Events ---

    event CommunityIssuanceAddressSet(address _communityIssuanceAddress);
    event HLQTStakingAddressSet(address _hlqtStakingAddress);
    event LockupContractFactoryAddressSet(address _lockupContractFactoryAddress);

    // --- Functions ---

    constructor
    (
        address _communityIssuanceAddress,
        address _hlqtStakingAddress,
        address _lockupFactoryAddress,
        address _crMultisigAddress,
        address _advisorMultisigAddress,
        address _investorMultisigAddress,
        address _cresMultisigAddress,
        address _spMultisigAddress
    )
    payable public
    {
        checkContract(_communityIssuanceAddress);
        checkContract(_hlqtStakingAddress);
        checkContract(_lockupFactoryAddress);

        crMultisigAddress = _crMultisigAddress;
        advisorMultisigAddress = _advisorMultisigAddress;
        investorMultisigAddress = _investorMultisigAddress;
        cresMultisigAddress = _cresMultisigAddress;
        spMultisigAddress = _spMultisigAddress;

        deploymentStartTime = block.timestamp;

        communityIssuanceAddress = _communityIssuanceAddress;
        hlqtStakingAddress = _hlqtStakingAddress;
        lockupContractFactory = ILockupContractFactory(_lockupFactoryAddress);

        // --- Deploy Hedera HTS ---

        IHederaTokenService.HederaToken memory token;
        token.name = _NAME;
        token.symbol = _SYMBOL;
        token.treasury = address(this);
        token.maxSupply = int64(_1_MILLION.mul(100));
        token.tokenSupplyType = true;

        token.expiry = createAutoRenewExpiry(address(this), 7_776_000);

        IHederaTokenService.TokenKey[] memory keys = new IHederaTokenService.TokenKey[](1);
        keys[0] = getSingleKey(KeyType.SUPPLY, KeyValueType.INHERIT_ACCOUNT_KEY, bytes(""));

        token.tokenKeys = keys;

        (int responseCode, address createdTokenAddress) =
                            HederaTokenService.createFungibleToken(token, 0, _DECIMALS);

        _checkResponse(responseCode);
        tokenAddress = createdTokenAddress;

        uint _lpRewardsEntitlement = _1_MILLION.mul(13).div(10);  // Allocate 1.3 million for LP rewards
        lpRewardsEntitlement = _lpRewardsEntitlement;
    }

    // Hedera: We have to do the minting here because we need time to associate the beneficiaries with the token
    function initialize(address _teamMemberOne, address _teamMemberTwo, address _teamMemberThree, address _teamMemberFour, address _lpRewardsAddress) external onlyOwner {
        require(!initialized, "initialize: already initialized");

        // Community Issuance StabilityPool
        uint depositorsAndFrontEndsEntitlement = _1_MILLION.mul(187).div(10);
        _mint(communityIssuanceAddress, depositorsAndFrontEndsEntitlement);

        // LP Token Staking
        _mint(_lpRewardsAddress, lpRewardsEntitlement);

        // Community Reward Multisig
        uint crMultiSigEntitlement = _1_MILLION.mul(20);
        _mint(crMultisigAddress, crMultiSigEntitlement);

        // Advisors Multisig
        uint advisorMultiSigEntitlement = _1_MILLION.mul(2);
        _mint(advisorMultisigAddress, advisorMultiSigEntitlement);

        // Investors Multisig
        uint investorMultiSigEntitlement = _1_MILLION.mul(30);
        _mint(investorMultisigAddress, investorMultiSigEntitlement);

        // Community Reserve Multisig
        uint cresMultiSigEntitlement = _1_MILLION.mul(5);
        _mint(cresMultisigAddress, cresMultiSigEntitlement);

        // Service Providers Multisig
        uint spMultiSigEntitlement = _1_MILLION.mul(38).div(10);
        _mint(spMultisigAddress, spMultiSigEntitlement);

        // Team members
        uint teamMemberEntitlement = _1_MILLION.mul(192).div(10).div(4);
        _mint(_teamMemberOne, teamMemberEntitlement);
        _mint(_teamMemberTwo, teamMemberEntitlement);
        _mint(_teamMemberThree, teamMemberEntitlement);
        _mint(_teamMemberFour, teamMemberEntitlement);

        initialized = true;
        _renounceOwnership();
    }

    // --- External functions ---

    function balanceOf(
        address account
    ) external view override(IHLQTToken) returns (uint256) {
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

    function sendToHLQTStaking(address _sender, uint256 _amount) external override {
        _requireCallerIsHLQTStaking();
        if (_isFirstYear()) {_requireSenderIsNotMultisig(_sender);}  // Prevent the multisig from staking HLQT
        _transfer(_sender, hlqtStakingAddress, _amount);
    }

    function _totalSupply() internal view returns (uint256) {
        return IERC20(tokenAddress).totalSupply();
    }

    function _transfer(address sender, address recipient, uint256 amount) internal {
        require(sender != address(0), "ERC20: transfer from the zero address");
        require(recipient != address(0), "ERC20: transfer to the zero address");

        require(amount <= uint256(type(int64).max), "Amount exceeds int64 limits");

        int64 safeAmount = int64(amount);

        int responseCode = HederaTokenService.transferToken(tokenAddress, sender, recipient, safeAmount);

        _checkResponse(responseCode);

        emit TokenTransfer(tokenAddress, sender, recipient, safeAmount);
    }

    function _balanceOf(
        address account
    ) internal view returns (uint256) {
        return IERC20(tokenAddress).balanceOf(account);
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

        uint256 balance = _balanceOf(address(this));

        (int responseCode, ,) = HederaTokenService.mintToken(tokenAddress, safeAmount, new bytes[](0));

        _checkResponse(responseCode);

        uint256 contractBalance = _balanceOf(address(this));
        require(contractBalance.sub(balance) == amount, 'The smart contract is not the treasury account');

        _transfer(address(this), account, amount);

        emit TokensMinted(msg.sender, tokenAddress, safeAmount, account);

        return true;
    }

    function _checkResponse(int responseCode) internal pure {
        // Using require to check the condition, and provide a custom error message if it fails.
        require(responseCode == HederaResponseCodes.SUCCESS, "ResponseCodeInvalid: provided code is not success");
    }

    // --- Helper functions ---

    function _isFirstYear() internal view returns (bool) {
        return (block.timestamp.sub(deploymentStartTime) < ONE_YEAR_IN_SECONDS);
    }

    // --- 'require' functions ---

    function _requireSenderIsNotMultisig(address _sender) internal view {
        require(
            _sender != crMultisigAddress &&
            _sender != advisorMultisigAddress &&
            _sender != investorMultisigAddress &&
            _sender != cresMultisigAddress,
            "HLQTToken: sender must not be multisig"
        );
    }

    function _requireCallerIsHLQTStaking() internal view {
        require(msg.sender == hlqtStakingAddress, "HLQTToken: caller must be the HLQTStaking contract");
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
