// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "./Dependencies/HederaResponseCodes.sol";
import "./Interfaces/IHederaTokenService.sol";
import "./Dependencies/HederaTokenService.sol";
import "./Interfaces/IDCHFToken.sol";
/**
 * The purpose of this contract is to hold LUSD tokens for gas compensation:
 * https://github.com/liquity/dev#gas-compensation
 * When a borrower opens a trove, an additional 50 LUSD debt is issued,
 * and 50 LUSD is minted and sent to this contract.
 * When a borrower closes their active trove, this gas compensation is refunded:
 * 50 LUSD is burned from the this contract's balance, and the corresponding
 * 50 LUSD debt on the trove is cancelled.
 * See this issue for more context: https://github.com/liquity/dev/issues/186
 */
contract GasPool is HederaTokenService {
    IDCHFToken public lusdToken;

    address troveManagerAddress;
    address borrowerOperationsAddress;

    constructor(address _lusdTokenAddress, address _troveManagerAddress, address _borrowerOperationsAddress) public {
        troveManagerAddress = _troveManagerAddress;
        borrowerOperationsAddress = _borrowerOperationsAddress;
        lusdToken = IDCHFToken(_lusdTokenAddress);
        int responseCode = HederaTokenService.associateToken(address(this), lusdToken.getTokenAddress());

        if (responseCode != HederaResponseCodes.SUCCESS) {
            revert ();
        }
    }

    function approveToken(address token, address spender, uint256 amount) external returns (int responseCode) {
        _requireCallerIsBorrowerOperationsOrTroveManager();
        responseCode = HederaTokenService.approve(token, spender, amount);

        if (responseCode != HederaResponseCodes.SUCCESS) {
            revert ();
        }
    }

    function _requireCallerIsBorrowerOperationsOrTroveManager() internal view {
        require(
            msg.sender == borrowerOperationsAddress ||
            msg.sender == troveManagerAddress,
            "GasPool: Caller is neither BO nor TroveManager");
    }
}
