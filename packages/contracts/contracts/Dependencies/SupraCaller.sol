// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "../Interfaces/ISupraCaller.sol";
import "./ISupra.sol";
import "./SafeMath.sol";
/*
* This contract has a single external function that calls Supra: getSupraCurrentValue().
*
* The function is called by the Liquity contract PriceFeed.sol. If any of its inner calls to Supra revert,
* this function will revert, and PriceFeed will catch the failure and handle it accordingly.
*
*/
contract SupraCaller is ISupraCaller {
    using SafeMath for uint256;

    ISupra public supra;

    constructor (address _supraMasterAddress) public {
        supra = ISupra(_supraMasterAddress);
    }

    /*
    *
    * @dev Allows the user to get the latest value for the marketPair specified
    * @param _marketPair is the requestId to look up the value for
    * @return ifRetrieve bool true if it is able to retrieve a value, the value, and the value's timestamp
    * @return value the value retrieved
    * @return _timestampRetrieved the value's timestamp
    */
    function getSupraCurrentValue(string memory _marketPair)
    external
    view
    override
    returns (
        bool ifRetrieve,
        uint256 value,
        uint256 _timestampRetrieved
    )
    {
        //Obtain the latest price value from the SupraOracles S-Value Price Feed (feed returns 8 decimals).
        (int256 _value, uint256 _time ) = supra.checkPrice(_marketPair);
        if (_value > 0) {
            uint256 positiveValue = uint256(_value);
            return (true, positiveValue, _time);
        }
        return (false, 0, _time);
    }
}
