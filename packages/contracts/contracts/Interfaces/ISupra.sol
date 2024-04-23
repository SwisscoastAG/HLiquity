// SPDX-License-Identifier: MIT
pragma solidity 0.6.11;

interface ISupra {
    /**
     * @dev Returns the components of the price feed for a given price index.
     * @param _priceIndex The index for which the price feed is being queried.
     * @return round The round of the price feed.
     * @return decimals The number of decimals for the price.
     * @return time The timestamp of the last price update.
     * @return price The price of the market pair.
     */
    function getSvalue(uint256 _priceIndex) external view returns (uint256 round, uint256 decimals, uint256 time, uint256 price);
}