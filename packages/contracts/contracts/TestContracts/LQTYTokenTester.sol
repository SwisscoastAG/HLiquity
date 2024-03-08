// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "../LQTY/HLQTYToken.sol";

contract LQTYTokenTester is HLQTYToken {
    constructor
    (
        address _communityIssuanceAddress, 
        address _lqtyStakingAddress,
        address _lockupFactoryAddress,
        address _multisigAddress
    ) 
        payable public
        HLQTYToken
    (
        _communityIssuanceAddress,
        _lqtyStakingAddress,
        _lockupFactoryAddress,
        _multisigAddress
    )
    {} 

    function unprotectedMint(address account, uint256 amount) external {
        // No check for the caller here

        _mint(account, amount);
    }

    function unprotectedSendToLQTYStaking(address _sender, uint256 _amount) external {
        // No check for the caller here
        
        if (_isFirstYear()) {_requireSenderIsNotMultisig(_sender);}
        _transfer(_sender, lqtyStakingAddress, _amount);
    }

    function callInternalTransfer(address sender, address recipient, uint256 amount) external returns (bool) {
        _transfer(sender, recipient, amount);
    }
}