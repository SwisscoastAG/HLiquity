// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "../Interfaces/IDCHFToken.sol";

contract DCHFTokenCaller {
    IDCHFToken DCHF;

    function setDCHF(IDCHFToken _DCHF) external {
        DCHF = _DCHF;
    }

    function dchfMint(address _account, uint _amount) external {
        DCHF.mint(_account, _amount);
    }

    function dchfBurn(address _account, uint _amount) external {
        DCHF.burn(_account, _amount);
    }

    function dchfSendToPool(address _sender,  address _poolAddress, uint256 _amount) external {
        DCHF.sendToPool(_sender, _poolAddress, _amount);
    }

    function dchfReturnFromPool(address _poolAddress, address _receiver, uint256 _amount ) external {
        DCHF.returnFromPool(_poolAddress, _receiver, _amount);
    }
}
