// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

interface ISupraCaller {
    function getSupraCurrentValue(uint256 _priceIndexHBARUSD, uint256 _priceIndexUSHCHF) external view returns (bool, uint256, uint256);
}
