// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "../HLQT/CommunityIssuance.sol";
import "../Interfaces/IHederaTokenService.sol";
import "../Dependencies/HederaResponseCodes.sol";

contract CommunityIssuanceTester is CommunityIssuance {
    function obtainHLQT(uint _amount) external {
        require(_amount <= uint256(type(int64).max), "HCHFGain exceeds int64 limits");
        int64 safeAmount = int64(_amount);
        int responseCode = HederaTokenService.transferToken(hlqtToken.getTokenAddress(), address(this),msg.sender, safeAmount);
        _checkResponse(responseCode);
    }

    function getCumulativeIssuanceFraction() external view returns (uint) {
       return _getCumulativeIssuanceFraction();
    }

    function unprotectedIssueHLQT() external returns (uint) {
        // No checks on caller address
       
        uint latestTotalHLQTIssued = HLQTSupplyCap.mul(_getCumulativeIssuanceFraction()).div(DECIMAL_PRECISION);
        uint issuance = latestTotalHLQTIssued.sub(totalHLQTIssued);
      
        totalHLQTIssued = latestTotalHLQTIssued;
        return issuance;
    }
}
