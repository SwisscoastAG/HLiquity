// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

interface ICommunityIssuance { 
    
    // --- Events ---
    
    event HLQTYTokenAddressSet(address _hlqtyTokenAddress);
    event StabilityPoolAddressSet(address _stabilityPoolAddress);
    event TotalHLQTYIssuedUpdated(uint _totalHLQTYIssued);

    // --- Functions ---

    function setAddresses(address _hlqtyTokenAddress, address _stabilityPoolAddress) external;

    function issueHLQTY() external returns (uint);

    function sendHLQTY(address _account, uint _HLQTYamount) external;
}
