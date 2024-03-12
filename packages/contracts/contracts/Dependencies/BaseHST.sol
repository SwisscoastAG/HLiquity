pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "../Interfaces/IHCHFToken.sol";
import "../Interfaces/IHederaTokenService.sol";
import "./ExpiryHelper.sol";
import "./KeyHelper.sol";
import "./CheckContract.sol";
import "./HederaResponseCodes.sol";
import "./IERC20.sol";
import "./SafeCast.sol";
import "./HederaTokenService.sol";


contract BaseHST is HederaTokenService
{
    event Transfer(
        address indexed token,
        address indexed from,
        address indexed to,
        int64 value
    );

    function _associateToken(address account, address token) internal returns (bool success) {
        int responseCode = HederaTokenService.associateToken(account, token);
        return _checkResponse(responseCode);
    }

    function _approve(address token, address spender, uint256 amount) internal returns (bool success) {
        int responseCode = HederaTokenService.approve(token, spender, amount);
        return _checkResponse(responseCode);
    }

    function _transfer(address token, address sender, address receiver, uint256 amount) internal returns (bool success) {
        require(amount <= uint256(type(int64).max), "transfer amount exceeds int64 limits");
        int64 safeAmount = int64(amount);
        int responseCode = HederaTokenService.transferToken(token, sender, receiver, safeAmount);
        emit Transfer(token, sender, receiver, safeAmount);
        return _checkResponse(responseCode);
    }

    function _checkResponse(int responseCode) internal pure returns (bool) {
        require(responseCode == HederaResponseCodes.SUCCESS, "ResponseCodeInvalid: provided code is not success");
        return true;
    }
}