// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

interface IPythCaller {
    function getPythCurrentValue() external view returns (bool, uint256, uint256);
}
