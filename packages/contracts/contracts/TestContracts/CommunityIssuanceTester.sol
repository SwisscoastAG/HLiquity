// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "../LQTY/CommunityIssuance.sol";
import "../Interfaces/IHederaTokenService.sol";
import "../Dependencies/HederaResponseCodes.sol";

contract CommunityIssuanceTester is CommunityIssuance {
    function obtainLQTY(uint _amount) external {
        require(_amount <= uint256(type(int64).max), "LUSDGain exceeds int64 limits");
        int64 safeAmount = int64(_amount);
        int responseCode = HederaTokenService.transferToken(lqtyToken.getTokenAddress(), address(this),msg.sender, safeAmount);
        _checkResponse(responseCode);
    }

    function getCumulativeIssuanceFraction() external view returns (uint) {
       return _getCumulativeIssuanceFraction();
    }

    function unprotectedIssueLQTY() external returns (uint) {
        // No checks on caller address
       
        uint latestTotalLQTYIssued = LQTYSupplyCap.mul(_getCumulativeIssuanceFraction()).div(DECIMAL_PRECISION);
        uint issuance = latestTotalLQTYIssued.sub(totalLQTYIssued);
      
        totalLQTYIssued = latestTotalLQTYIssued;
        return issuance;
    }
}
