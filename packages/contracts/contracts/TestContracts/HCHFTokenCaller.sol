// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "../Interfaces/IHCHFToken.sol";

contract HCHFTokenCaller {
    IHCHFToken HCHF;

    function setHCHF(IHCHFToken _HCHF) external {
        HCHF = _HCHF;
    }

    function hchfMint(address _account, uint _amount) external {
        HCHF.mint(_account, _amount);
    }

    function hchfBurn(address _account, uint _amount) external {
        HCHF.burn(_account, _amount);
    }

    function hchfSendToPool(address _sender,  address _poolAddress, uint256 _amount) external {
        HCHF.sendToPool(_sender, _poolAddress, _amount);
    }

    function hchfReturnFromPool(address _poolAddress, address _receiver, uint256 _amount ) external {
        HCHF.returnFromPool(_poolAddress, _receiver, _amount);
    }
}
