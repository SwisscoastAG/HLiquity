// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

interface ICommunityIssuance { 
    
    // --- Events ---
    
    event HLQTTokenAddressSet(address _hlqtTokenAddress);
    event StabilityPoolAddressSet(address _stabilityPoolAddress);
    event TotalHLQTIssuedUpdated(uint _totalHLQTIssued);

    // --- Functions ---

    function setAddresses(address _hlqtTokenAddress, address _stabilityPoolAddress) external;

    function issueHLQT() external returns (uint);

    function sendHLQT(address _account, uint _HLQTamount) external;
}
