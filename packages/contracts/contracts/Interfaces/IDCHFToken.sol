// SPDX-License-Identifier: MIT
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;


import "./IHederaTokenService.sol";
import "../Dependencies/KeysLib.sol";

interface IDCHFToken {
    struct InitializeStruct {
        IHederaTokenService.HederaToken token;
        int64 initialTotalSupply;
        int32 tokenDecimals;
        address originalSender;
        address reserveAddress;
        RolesStruct[] roles;
        CashinRoleStruct cashinRole;
        string tokenMetadataURI;
    }

    struct RolesStruct {
        bytes32 role;
        address account;
    }

    struct CashinRoleStruct {
        address account;
        uint256 allowance;
    }

    struct UpdateTokenStruct {
        string tokenName;
        string tokenSymbol;
        KeysLib.KeysStruct[] keys;
        int64 second;
        int64 autoRenewPeriod;
        string tokenMetadataURI;
    }


    event TroveManagerAddressChanged(address _troveManagerAddress);
    event StabilityPoolAddressChanged(address _newStabilityPoolAddress);
    event BorrowerOperationsAddressChanged(address _newBorrowerOperationsAddress);

    event LUSDTokenBalanceUpdated(address _user, uint _amount);

    /**
 * @dev Emitted when the `amount` tokens have been minted to account
     *
     * @param minter The caller of the function that emitted the event
     * @param token Token address
     * @param amount The number of tokens to mint
     * @param account Account address
     */
    event TokensMinted(
        address indexed minter,
        address indexed token,
        int64 amount,
        address indexed account
    );

    /**
 * @dev Emitted when the `amount` tokens are burned from TokenOwner
     *
     * @param burner The caller of the function that emitted the event
     * @param token Token address
     * @param amount The number of tokens to burn
     */
    event TokensBurned(
        address indexed burner,
        address indexed token,
        int64 amount
    );

    /**
    * @dev Emitted when tokens have been transfered from sender to receiver
    *
    * @param token Token address
    * @param from Sender address
    * @param to Receiver address
    * @param value transfered amount

    */
    event Transfer(
        address indexed token,
        address indexed from,
        address indexed to,
        int64 value
    );


    /**
     * @dev Emitted when token updated
     *
     * @param token Token address
     * @param updateTokenStruct Struct containing updated token data
     */
    event TokenUpdated(
        address indexed token,
        UpdateTokenStruct updateTokenStruct
    );

    /**
     * @dev Emitted when a new metadata was set
     *
     * @param admin The account that set the metadata
     * @param metadata The metadata that was set
     */
    event MetadataSet(address indexed admin, string metadata);


    function mint(address _account, uint256 _amount) external;

    function burn(address _account, uint256 _amount) external;

    function sendToPool(address _sender,  address poolAddress, uint256 _amount) external;

    function returnFromPool(address poolAddress, address user, uint256 _amount ) external;

    /**
     * @dev Returns the name of the token
     *
     * @return The the name of the token
     */
    function name() external view returns (string memory);

    /**
     * @dev Returns the symbol of the token
     *
     * @return The the symbol of the token
     */
    function symbol() external view returns (string memory);

    /**
     * @dev Returns the total number of tokens that exits
     *
     * @return uint256 The total number of tokens that exists
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the number tokens that an account has
     *
     * @param account The address of the account to be consulted
     *
     * @return uint256 The number number tokens that an account has
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Returns the number of decimals of the token
     *
     * @return uint8 The number of decimals of the token
     */
    function decimals() external view returns (uint8);

    function getTokenAddress() external view returns (address);
}
