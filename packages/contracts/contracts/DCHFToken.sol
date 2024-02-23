pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "./Interfaces/IDCHFToken.sol";
import "./Interfaces/IHederaTokenService.sol";
import "./Dependencies/ExpiryHelper.sol";
import "./Dependencies/KeyHelper.sol";
import "./Dependencies/CheckContract.sol";
import "./Dependencies/HederaResponseCodes.sol";
import "./Dependencies/IERC20.sol";
import "./Dependencies/SafeCast.sol";
import "./Dependencies/HederaTokenService.sol";


contract DCHFToken is IDCHFToken, HederaTokenService, ExpiryHelper, KeyHelper, CheckContract
{
    address public tokenAddress;


    address public immutable troveManagerAddress;
    address public immutable stabilityPoolAddress;
    address public immutable borrowerOperationsAddress;

    event ResponseCode(int responseCode);
    event MintedToken(int64 newTotalSupply, int64[] serialNumbers);
    event TroveManagerAddressChanged(address _troveManagerAddress);
    event StabilityPoolAddressChanged(address _newStabilityPoolAddress);
    event BorrowerOperationsAddressChanged(address _newBorrowerOperationsAddress);


    string constant internal _NAME = "DCHF Stablecoin";
    string constant internal _SYMBOL = "DCHF";
    int32 constant internal _DECIMALS = 8;

    constructor(
        address _troveManagerAddress,
        address _stabilityPoolAddress,
        address _borrowerOperationsAddress
    )  payable public {
        checkContract(_troveManagerAddress);
        checkContract(_stabilityPoolAddress);
        checkContract(_borrowerOperationsAddress);

        troveManagerAddress = _troveManagerAddress;
        emit TroveManagerAddressChanged(_troveManagerAddress);

        stabilityPoolAddress = _stabilityPoolAddress;
        emit StabilityPoolAddressChanged(_stabilityPoolAddress);

        borrowerOperationsAddress = _borrowerOperationsAddress;
        emit BorrowerOperationsAddressChanged(_borrowerOperationsAddress);

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
    }

    function mint(address _account, uint256 _amount) external override {
        _requireCallerIsBorrowerOperations();
        _mint(_account, _amount);
    }

    function burn(address _account, uint256 _amount) external override {
        _requireCallerIsBOorTroveMorSP();
        _burn(_account, _amount);
    }

    function sendToPool(address _sender, address _poolAddress, uint256 _amount) external override {
        _requireCallerIsStabilityPool();
        _transfer(_sender, _poolAddress, _amount);
    }

    function returnFromPool(address _poolAddress, address _receiver, uint256 _amount) external override {
        _requireCallerIsTroveMorSP();
        _transfer(_poolAddress, _receiver, _amount);
    }

    /**
 * @dev Returns the name of the token
     *
     * @return string The the name of the token
     */
    function name() external view override returns (string memory) {
        return IERC20(_getTokenAddress()).name();
    }

    /**
     * @dev Returns the symbol of the token
     *
     * @return string The the symbol of the token
     */
    function symbol() external view override returns (string memory) {
        return IERC20(_getTokenAddress()).symbol();
    }

    /**
     * @dev Returns the number of decimals of the token
     *
     * @return uint8 The number of decimals of the token
     */
    function decimals() external view override returns (uint8) {
        return _decimals();
    }

    /**
     * @dev Returns the total number of tokens that exits
     *
     * @return uint256 The total number of tokens that exists
     */
    function totalSupply() external view override returns (uint256) {
        return _totalSupply();
    }

    /**
     * @dev Returns the number tokens that an account has
     *
     * @param account The address of the account to be consulted
     *
     * @return uint256 The number number tokens that an account has
     */
    function balanceOf(
        address account
    ) external view override(IDCHFToken) returns (uint256) {
        return _balanceOf(account);
    }

    function getTokenAddress() external view override returns (address) {
        return tokenAddress;
    }

    // --- Internal operations ---
    // Warning: sanity checks (for sender and recipient) should have been done before calling these internal functions


    function _mint(
        address account,
        uint256 amount
    )
    internal
    returns (bool)
    {
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

    function _burn(
        address account,
        uint256 amount
    )
    internal
    returns (bool)
    {
        require(amount <= uint256(type(int64).max), "Amount exceeds int64 limits");

        int64 safeAmount = int64(amount);

        address currentTokenAddress = _getTokenAddress();

        _transfer(account, address(this), amount);

        (int responseCode,) = HederaTokenService.burnToken(currentTokenAddress, safeAmount, new int64[](0));

        bool success = _checkResponse(responseCode);

        emit TokensBurned(msg.sender, currentTokenAddress, safeAmount);

        return success;
    }

    function _getTokenAddress() internal view returns (address) {
        return tokenAddress;
    }

    /**
     * @dev Returns the number tokens that an account has
     *
     * @param account The address of the account to be consulted
     *
     * @return uint256 The number number tokens that an account has
     */
    function _balanceOf(
        address account
    ) internal view returns (uint256) {
        return IERC20(_getTokenAddress()).balanceOf(account);
    }


    function _transfer(
        address sender,
        address recipient,
        uint256 amount
    )
    internal
    {
        assert(sender != address(0));
        assert(recipient != address(0));

        require(amount <= uint256(type(int64).max), "Amount exceeds int64 limits");

        int64 safeAmount = int64(amount);

        address currentTokenAddress = _getTokenAddress();

        int responseCode = HederaTokenService.transferToken(currentTokenAddress, sender, recipient, safeAmount);

        _checkResponse(responseCode);

        emit TokenTransfer(currentTokenAddress, sender, recipient, safeAmount);
    }

    /**
     * @dev Is required because of an Hedera's bug, when keys are updated for a token, the memo gets removed.
     *
     *
     * @return string The memo of the token
     */
    function _getTokenInfo() private returns (string memory) {
        (
            int responseCode,
            IHederaTokenService.TokenInfo memory info
        ) = HederaTokenService.getTokenInfo(
            tokenAddress
        );

        _checkResponse(responseCode);

        return info.token.memo;
    }

    /**
 * @dev Returns the number of decimals of the token
     *
     */
    function _decimals() internal view returns (uint8) {
        return IERC20(tokenAddress).decimals();
    }

    /**
 * @dev Returns the total number of tokens that exits
     *
     */
    function _totalSupply() internal view returns (uint256) {
        return IERC20(tokenAddress).totalSupply();
    }

    function _checkResponse(int responseCode) internal pure returns (bool) {
        // Using require to check the condition, and provide a custom error message if it fails.
        require(responseCode == HederaResponseCodes.SUCCESS, "ResponseCodeInvalid: provided code is not success");
        return true;
    }

    // --- 'require' functions ---

    function _requireValidRecipient(address _recipient) internal view {
        require(
            _recipient != address(0) &&
            _recipient != address(this),
            "DCHF: Cannot transfer tokens directly to the DCHF token contract or the zero address"
        );
        require(
            _recipient != stabilityPoolAddress &&
            _recipient != troveManagerAddress &&
            _recipient != borrowerOperationsAddress,
            "DCHF: Cannot transfer tokens directly to the StabilityPool, TroveManager or BorrowerOps"
        );
    }

    function _requireCallerIsBorrowerOperations() internal view {
        require(msg.sender == borrowerOperationsAddress, "DCHFToken: Caller is not BorrowerOperations");
    }

    function _requireCallerIsBOorTroveMorSP() internal view {
        require(
            msg.sender == borrowerOperationsAddress ||
            msg.sender == troveManagerAddress ||
            msg.sender == stabilityPoolAddress,
            "DCHF: Caller is neither BorrowerOperations nor TroveManager nor StabilityPool"
        );
    }

    function _requireCallerIsStabilityPool() internal view {
        require(msg.sender == stabilityPoolAddress, "DCHF: Caller is not the StabilityPool");
    }

    function _requireCallerIsTroveMorSP() internal view {
        require(
            msg.sender == troveManagerAddress || msg.sender == stabilityPoolAddress,
            "DCHF: Caller is neither TroveManager nor StabilityPool");
    }
}