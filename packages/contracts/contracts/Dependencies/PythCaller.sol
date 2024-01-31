// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "./SafeMath.sol";
import "../Interfaces/IPythCaller.sol";
import "./PythStructs.sol";
import "../Interfaces/IPyth.sol";
/*
* This contract has a single external function that calls Pyth: getPythCurrentValue().
*
* The function is called by the Liquity contract PriceFeed.sol. If any of its inner calls to Pyth revert,
* this function will revert, and PriceFeed will catch the failure and handle it accordingly.
*
*
*/
contract PythCaller is IPythCaller {
    using SafeMath for uint256;

    bytes32 constant public HBAR_USD_PYTH = 0x3728e591097635310e6341af53db8b7ee42da9b3a8d918f9463ce9cca886dfbd;
    bytes32 constant public USD_CHF_PYTH = 0x0b1e3297e69f162877b577b0d6a47a0d63b2392bc8499e6540da4187a63e28f8;

    IPyth public pyth;

    constructor (address _pythAddress) public {
        pyth = IPyth(_pythAddress);
    }

    /*
    * getPythCurrentValue()
    *
    * @dev Allows the user to get the latest value for the requestId specified
    * @param _requestId is the requestId to look up the value for
    * @return ifRetrieve bool true if it is able to retrieve a value, the value, and the value's timestamp
    * @return value the value retrieved
    * @return _timestampRetrieved the value's timestamp
    */
    function getPythCurrentValue()
    external
    view
    override
    returns (
        bool ifRetrieve,
        uint256 value,
        uint256 _timestampRetrieved
    )
    {
        (int64 priceHBARUSD, , int32 expoHBARUSD, uint publishTimeHBARUSD) = pyth.getPrice(HBAR_USD_PYTH);
        (int64 priceUSDCHF, , int32 expoUSDCHF, ) = pyth.getPrice(USD_CHF_PYTH);

        uint256 basePriceHBARUSD = convertToUint(priceHBARUSD, expoHBARUSD, 8);
        uint256 basePriceUSDCHF = convertToUint(priceUSDCHF, expoUSDCHF, 8);

        uint256 hbarChfPrice = basePriceHBARUSD * basePriceUSDCHF;

        // Using the timestamp from the HBAR/USD price as reference
        uint256 publishTime = publishTimeHBARUSD;

        if (hbarChfPrice > 0) return (true, hbarChfPrice, publishTime);
        return (false, 0, publishTime);
    }

    function convertToUint(
        int64 price,
        int32 expo,
        uint8 targetDecimals
    ) private pure returns (uint256) {
        if (price < 0 || expo > 0 || expo < -255) {
            revert();
        }

        uint8 priceDecimals = uint8(uint32(-1 * expo));

        if (targetDecimals >= priceDecimals) {
            return
                uint(uint64(price)) *
                10 ** uint32(targetDecimals - priceDecimals);
        } else {
            return
                uint(uint64(price)) /
                10 ** uint32(priceDecimals - targetDecimals);
        }
    }
}
