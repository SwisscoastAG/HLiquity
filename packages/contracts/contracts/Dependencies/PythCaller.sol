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

    IPyth public immutable pyth;

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
    function getPythCurrentValue(bytes32 HBARUSD, bytes32 USHCHF)
    external
    view
    override
    returns (
        bool ifRetrieve,
        uint256 value,
        uint256 _timestampRetrieved
    )
    {
        (int64 priceHBARUSD, , int32 expoHBARUSD, uint publishTimeHBARUSD) = pyth.getPriceUnsafe(HBARUSD);
        (int64 priceUSHCHF, , int32 expoUSHCHF, uint publishTimeUSHCHF ) = pyth.getPriceUnsafe(USHCHF);

        (uint256 basePriceHBARUSD, bool successHBARUSD) = convertToUint(priceHBARUSD, expoHBARUSD, 8);
        (uint256 basePriceUSHCHF, bool successUSHCHF) = convertToUint(priceUSHCHF, expoUSHCHF, 8);

        if (!successHBARUSD || !successUSHCHF) {
            return (false, 0, block.timestamp);
        }

        uint256 hbarChfPrice = (basePriceHBARUSD * basePriceUSHCHF) / 1e8;

        // Using the smaller of the two timestamps as reference
        uint256 publishTime = publishTimeHBARUSD < publishTimeUSHCHF ? publishTimeHBARUSD : publishTimeUSHCHF;

        return (hbarChfPrice > 0, hbarChfPrice, publishTime);
    }

    function convertToUint(
        int64 price,
        int32 expo,
        uint8 targetDecimals
    ) private pure returns (uint256, bool) {
        if (price < 0 || expo > 0 || expo < -255) {
            return (0, false);
        }

        uint8 priceDecimals = uint8(uint32(-1 * expo));
        uint256 result;

        if (targetDecimals >= priceDecimals) {
            result = uint(uint64(price)) * 10 ** uint32(targetDecimals - priceDecimals);
        } else {
            result = uint(uint64(price)) / 10 ** uint32(priceDecimals - targetDecimals);
        }
        return (result, true);
    }
}
