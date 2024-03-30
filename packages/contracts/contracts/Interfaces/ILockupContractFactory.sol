// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;
    
interface ILockupContractFactory {
    
    // --- Events ---

    event HLQTTokenAddressSet(address _hlqtTokenAddress);
    event LockupContractDeployedThroughFactory(address _lockupContractAddress, address _beneficiary, uint _unlockTime, address _deployer);

    // --- Functions ---

    function setHLQTTokenAddress(address _hlqtTokenAddress) external;

    function deployLockupContract(address _beneficiary, uint _unlockTime) external;

    function isRegisteredLockup(address _addr) external view returns (bool);
}
