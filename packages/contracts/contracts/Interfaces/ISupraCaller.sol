// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

interface ISupraCaller {
    function getSupraCurrentValue(string memory marketPair) external view returns (bool, uint256, uint256);
}
