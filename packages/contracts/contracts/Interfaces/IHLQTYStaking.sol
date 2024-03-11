// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

interface IHLQTYStaking {

    // --- Events --
    
    event HLQTYTokenAddressSet(address _hlqtyTokenAddress);
    event DCHFTokenAddressSet(address _DCHFTokenAddress);
    event TroveManagerAddressSet(address _troveManager);
    event BorrowerOperationsAddressSet(address _borrowerOperationsAddress);
    event ActivePoolAddressSet(address _activePoolAddress);

    event StakeChanged(address indexed staker, uint newStake);
    event StakingGainsWithdrawn(address indexed staker, uint DCHFGain, uint ETHGain);
    event F_ETHUpdated(uint _F_ETH);
    event F_DCHFUpdated(uint _F_DCHF);
    event TotalHLQTYStakedUpdated(uint _totalHLQTYStaked);
    event EtherSent(address _account, uint _amount);
    event StakerSnapshotsUpdated(address _staker, uint _F_ETH, uint _F_DCHF);

    // --- Functions ---

    function setAddresses
    (
        address _hlqtyTokenAddress,
        address _DCHFTokenAddress,
        address _troveManagerAddress, 
        address _borrowerOperationsAddress,
        address _activePoolAddress
    )  external;

    function stake(uint _HLQTYamount) external;

    function unstake(uint _HLQTYamount) external;

    function increaseF_ETH(uint _ETHFee) external; 

    function increaseF_DCHF(uint _HLQTYFee) external;

    function getPendingETHGain(address _user) external view returns (uint);

    function getPendingDCHFGain(address _user) external view returns (uint);
}
