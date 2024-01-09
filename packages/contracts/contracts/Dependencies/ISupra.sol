// SPDX-License-Identifier: MIT
pragma solidity 0.6.11;

interface ISupra {
    /**
     * @dev Returns the price and the time of the last update.
     * @param _marketPair The market pair string for which the price is being queried.
     * @return _price The price of the market pair.
     * @return _timestamp The timestamp of the last price update.
     */
    function checkPrice(string memory _marketPair) external view returns (int256 _price, uint256 _timestamp);
}