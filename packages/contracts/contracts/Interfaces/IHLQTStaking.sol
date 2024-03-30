// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

interface IHLQTStaking {

    // --- Events --
    
    event HLQTTokenAddressSet(address _hlqtTokenAddress);
    event HCHFTokenAddressSet(address _HCHFTokenAddress);
    event TroveManagerAddressSet(address _troveManager);
    event BorrowerOperationsAddressSet(address _borrowerOperationsAddress);
    event ActivePoolAddressSet(address _activePoolAddress);

    event StakeChanged(address indexed staker, uint newStake);
    event StakingGainsWithdrawn(address indexed staker, uint HCHFGain, uint ETHGain);
    event F_ETHUpdated(uint _F_ETH);
    event F_HCHFUpdated(uint _F_HCHF);
    event TotalHLQTStakedUpdated(uint _totalHLQTStaked);
    event EtherSent(address _account, uint _amount);
    event StakerSnapshotsUpdated(address _staker, uint _F_ETH, uint _F_HCHF);

    // --- Functions ---

    function setAddresses
    (
        address _hlqtTokenAddress,
        address _HCHFTokenAddress,
        address _troveManagerAddress, 
        address _borrowerOperationsAddress,
        address _activePoolAddress
    )  external;

    function stake(uint _HLQTamount) external;

    function unstake(uint _HLQTamount) external;

    function increaseF_ETH(uint _ETHFee) external; 

    function increaseF_HCHF(uint _HLQTFee) external;

    function getPendingETHGain(address _user) external view returns (uint);

    function getPendingHCHFGain(address _user) external view returns (uint);
}
