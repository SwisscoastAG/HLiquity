pragma solidity 0.6.11;

import "./Interfaces/IDCHFToken.sol";
import "./Dependencies/ExpiryHelper.sol";
import "./Dependencies/KeyHelper.sol";


contract DCHFToken is IDCHFToken, ExpiryHelper, KeyHelper
{
    address internal constant _PRECOMPILED_ADDRESS = address(0x167);
    address public tokenAddress;


    event ResponseCode(int responseCode);
    event MintedToken(int64 newTotalSupply, int64[] serialNumbers);
    event TroveManagerAddressChanged(address _troveManagerAddress);
    event StabilityPoolAddressChanged(address _newStabilityPoolAddress);
    event BorrowerOperationsAddressChanged(address _newBorrowerOperationsAddress);


    string constant internal _NAME = "DCHF Stablecoin";
    string constant internal _SYMBOL = "DCHF";
    string constant internal _VERSION = "1";
    int32 constant internal _DECIMALS = 8;

    constructor    (
        address _troveManagerAddress,
        address _stabilityPoolAddress,
        address _borrowerOperationsAddress
    )  payable  {
        checkContract(_troveManagerAddress);
        checkContract(_stabilityPoolAddress);
        checkContract(_borrowerOperationsAddress);

        IHederaTokenService.HederaToken memory token;
        token.name = _NAME;
        token.symbol = _SYMBOL;
        token.treasury = address(this);

        token.expiry = createAutoRenewExpiry(address(this), 8000000);

        IHederaTokenService.TokenKey[] memory keys = new IHederaTokenService.TokenKey[](1);
        keys[0] = getSingleKey(KeyType.SUPPLY, KeyValueType.INHERIT_ACCOUNT_KEY, bytes(""));

        token.tokenKeys = keys;

        (int responseCode, address createdTokenAddress) =
                                IHederaTokenService(_PRECOMPILED_ADDRESS).createFungibleToken{value: msg.value}(token, 0, _DECIMALS);

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

    function sendToPool(address _sender,  address _poolAddress, uint256 _amount) external override {
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
    function name() external view returns (string memory) {
        return IERC20Metadata(_getTokenAddress()).name();
    }

    /**
     * @dev Returns the symbol of the token
     *
     * @return string The the symbol of the token
     */
    function symbol() external view returns (string memory) {
        return IERC20Metadata(_getTokenAddress()).symbol();
    }

    /**
     * @dev Returns the number of decimals of the token
     *
     * @return uint8 The number of decimals of the token
     */
    function decimals() external view returns (uint8) {
        return _decimals();
    }

    /**
     * @dev Returns the total number of tokens that exits
     *
     * @return uint256 The total number of tokens that exists
     */
    function totalSupply() external view returns (uint256) {
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

    // --- Internal operations ---
    // Warning: sanity checks (for sender and recipient) should have been done before calling these internal functions


    function _mint(
        address account,
        int64 amount
    )
    external
    returns (bool)
    {
        address currentTokenAddress = _getTokenAddress();

        uint256 balance = _balanceOf(address(this));

        (int64 responseCode, ,) = IHederaTokenService(_PRECOMPILED_ADDRESS)
            .mintToken(currentTokenAddress, amount, new bytes[](0));

        bool success = _checkResponse(responseCode);

        if (
            !((_balanceOf(address(this)) - balance) ==
            SafeCast.toUint256(amount))
        ) revert('The smart contract is not the treasury account');

        _transfer(account, amount);

        emit TokensMinted(msg.sender, currentTokenAddress, amount, account);

        return success;
    }

    function _burn(
        address account,
        int64 amount
    )
    external
    returns (bool)
    {
        address currentTokenAddress = _getTokenAddress();

        _transfer(account, address(this), amount);

        (int64 responseCode,) = IHederaTokenService(_PRECOMPILED_ADDRESS)
            .burnToken(currentTokenAddress, amount, new int64[](0));

        bool success = _checkResponse(responseCode);

        emit TokensBurned(msg.sender, currentTokenAddress, amount);

        return success;
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

    /**
     * @dev Transfers an amount of tokens from and account to another account
     *
     * @param to The address the tokens are transferred to
     */
    function _transfer(
        address sender,
        address recipient,
        int64 amount
    )
    internal
    {
        assert(sender != address(0));
        assert(recipient != address(0));

        address currentTokenAddress = _getTokenAddress();

        int64 responseCode = IHederaTokenService(_PRECOMPILED_ADDRESS)
            .transferToken(currentTokenAddress, sender, recipient, amount);

        _checkResponse(responseCode);

        emit TokenTransfer(currentTokenAddress, address(this), to, amount);
    }

    /**
     * @dev Is required because of an Hedera's bug, when keys are updated for a token, the memo gets removed.
     *
     *
     * @return string The memo of the token
     */
    function _getTokenInfo() private returns (string memory) {
        (
            int64 responseCode,
            IHederaTokenService.TokenInfo memory info
        ) = IHederaTokenService(_PRECOMPILED_ADDRESS).getTokenInfo(
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
        return IERC20Metadata(tokenAddress).decimals();
    }

    /**
 * @dev Returns the total number of tokens that exits
     *
     */
    function _totalSupply() internal view returns (uint256) {
        return IERC20(tokenAddress).totalSupply();
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