// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "./Interfaces/IPriceFeed.sol";
import "./Interfaces/ITellorCaller.sol";
import "./Interfaces/ISupraCaller.sol";
import "./Dependencies/AggregatorV3Interface.sol";
import "./Dependencies/SafeMath.sol";
import "./Dependencies/Ownable.sol";
import "./Dependencies/CheckContract.sol";
import "./Dependencies/BaseMath.sol";
import "./Dependencies/LiquityMath.sol";
import "./Dependencies/console.sol";

/*
* PriceFeed for mainnet deployment, to be connected to Chainlink's live ETH:USD aggregator reference 
* contract, and a wrapper contract TellorCaller, which connects to TellorMaster contract.
*
* The PriceFeed uses Chainlink as primary oracle, and Tellor as fallback. It contains logic for
* switching oracles based on oracle failures, timeouts, and conditions for returning to the primary
* Chainlink oracle.
*/
contract PriceFeed is Ownable, CheckContract, BaseMath, IPriceFeed {
    using SafeMath for uint256;

    string constant public NAME = "PriceFeed";

    ISupraCaller public supraCaller;
    ITellorCaller public tellorCaller;

    // Core Liquity contracts
    address borrowerOperationsAddress;
    address troveManagerAddress;

    uint constant public ETHUSD_TELLOR_REQ_ID = 1;
    string constant public HBAR_USD_ID = "hbar_usdt";

    // Use to convert a price answer to an 8-digit precision uint
    uint constant public TARGET_DIGITS = 8;
    uint constant public TELLOR_DIGITS = 6;
    uint constant public SUPRA_DIGITS = 8;

    // Maximum time period allowed since latest round data timestamp, beyond which considered frozen.
    uint constant public TIMEOUT = 14400;  // 4 hours: 60 * 60 * 4

    // Maximum deviation allowed between two consecutive oracle prices. 8-digit precision.
    uint constant public MAX_PRICE_DEVIATION_FROM_PREVIOUS_ROUND = 5e7; // 50%

    /* 
    * The maximum relative price difference between two oracle responses allowed in order for the PriceFeed
    * to return to using the oracle. 8-digit precision.
    */
    uint constant public MAX_PRICE_DIFFERENCE_BETWEEN_ORACLES = 5e6; // 5%

    // The last good price seen from an oracle by Liquity
    uint public lastGoodPrice;

    struct SupraResponse {
        bool ifRetrieve;
        uint256 value;
        uint256 timestamp;
        bool success;
    }

    struct TellorResponse {
        bool ifRetrieve;
        uint256 value;
        uint256 timestamp;
        bool success;
    }

    enum Status {
        supraWorking,
        usingTellorSupraUntrusted,
        bothOraclesUntrusted,
        usingTellorSupraFrozen,
        usingSupraTellorUntrusted
    }

    // The current status of the PricFeed, which determines the conditions for the next price fetch attempt
    Status public status;

    event LastGoodPriceUpdated(uint _lastGoodPrice);
    event PriceFeedStatusChanged(Status newStatus);

    // --- Dependency setters ---

    function setAddresses(
        address _supraCallerAddress,
        address _tellorCallerAddress
    )
    external
    onlyOwner
    {
        checkContract(_supraCallerAddress);
        checkContract(_tellorCallerAddress);

        supraCaller = ISupraCaller(_supraCallerAddress);
        tellorCaller = ITellorCaller(_tellorCallerAddress);

        // Explicitly set initial system status
        status = Status.supraWorking;

        SupraResponse memory supraResponse = _getCurrentSupraResponse();

        require(!_supraIsBroken(supraResponse) && !_supraIsFrozen(supraResponse),
            "PriceFeed: Supra must be working and current");

        _storeSupraPrice(supraResponse);

        _renounceOwnership();
    }

    // --- Functions ---

    /*
    * fetchPrice():
    * Returns the latest price obtained from the Oracle. Called by Liquity functions that require a current price.
    *
    * Also callable by anyone externally.
    *
    * Non-view function - it stores the last good price seen by Liquity.
    *
    * Uses a main oracle (Supra) and a fallback oracle (Tellor) in case Supra fails. If both fail,
    * it uses the last good price seen by Liquity.
    *
    */
    function fetchPrice() external override returns (uint) {
        // Get current price data from Supra, and current price data from Tellor
        SupraResponse memory supraResponse = _getCurrentSupraResponse();
        TellorResponse memory tellorResponse = _getCurrentTellorResponse();

        // --- CASE 1: System fetched last price from supra  ---
        if (status == Status.supraWorking) {
            // If supra is broken, try Tellor
            if (_supraIsBroken(supraResponse)) {
                // If Tellor is broken then both oracles are untrusted, so return the last good price
                if (_tellorIsBroken(tellorResponse)) {
                    _changeStatus(Status.bothOraclesUntrusted);
                    return lastGoodPrice;
                }
                /*
                * If Tellor is only frozen but otherwise returning valid data, return the last good price.
                * Tellor may need to be tipped to return current data.
                */
                if (_tellorIsFrozen(tellorResponse)) {
                    _changeStatus(Status.usingTellorSupraUntrusted);
                    return lastGoodPrice;
                }

                // If supra is broken and Tellor is working, switch to Tellor and return current Tellor price
                _changeStatus(Status.usingTellorSupraUntrusted);
                return _storeTellorPrice(tellorResponse);
            }

            // If supra is frozen, try Tellor
            if (_supraIsFrozen(supraResponse)) {
                // If Tellor is broken too, remember Tellor broke, and return last good price
                if (_tellorIsBroken(tellorResponse)) {
                    _changeStatus(Status.usingSupraTellorUntrusted);
                    return lastGoodPrice;
                }

                // If Tellor is frozen or working, remember supra froze, and switch to Tellor
                _changeStatus(Status.usingTellorSupraFrozen);

                if (_tellorIsFrozen(tellorResponse)) {return lastGoodPrice;}

                // If Tellor is working, use it
                return _storeTellorPrice(tellorResponse);
            }

            // If supra price has changed by > 50% between two consecutive rounds, compare it to Tellor's price
            if (_supraPriceChangeAboveMax(supraResponse)) {
                // If Tellor is broken, both oracles are untrusted, and return last good price
                if (_tellorIsBroken(tellorResponse)) {
                    _changeStatus(Status.bothOraclesUntrusted);
                    return lastGoodPrice;
                }

                // If Tellor is frozen, switch to Tellor and return last good price
                if (_tellorIsFrozen(tellorResponse)) {
                    _changeStatus(Status.usingTellorSupraUntrusted);
                    return lastGoodPrice;
                }

                /*
                * If Tellor is live and both oracles have a similar price, conclude that supra's large price deviation between
                * two consecutive rounds was likely a legitmate market price movement, and so continue using supra
                */
                if (_bothOraclesSimilarPrice(supraResponse, tellorResponse)) {
                    return _storeSupraPrice(supraResponse);
                }

                // If Tellor is live but the oracles differ too much in price, conclude that supra's initial price deviation was
                // an oracle failure. Switch to Tellor, and use Tellor price
                _changeStatus(Status.usingTellorSupraUntrusted);
                return _storeTellorPrice(tellorResponse);
            }

            // If supra is working and Tellor is broken, remember Tellor is broken
            if (_tellorIsBroken(tellorResponse)) {
                _changeStatus(Status.usingSupraTellorUntrusted);
            }

            // If supra is working, return supra current price (no status change)
            return _storeSupraPrice(supraResponse);
        }

        // --- CASE 2: The system fetched last price from Tellor ---
        if (status == Status.usingTellorSupraUntrusted) {
            // If both Tellor and supra are live, unbroken, and reporting similar prices, switch back to supra
            if (_bothOraclesLiveAndUnbrokenAndSimilarPrice(supraResponse, tellorResponse)) {
                _changeStatus(Status.supraWorking);
                return _storeSupraPrice(supraResponse);
            }

            if (_tellorIsBroken(tellorResponse)) {
                _changeStatus(Status.bothOraclesUntrusted);
                return lastGoodPrice;
            }

            /*
            * If Tellor is only frozen but otherwise returning valid data, just return the last good price.
            * Tellor may need to be tipped to return current data.
            */
            if (_tellorIsFrozen(tellorResponse)) {return lastGoodPrice;}

            // Otherwise, use Tellor price
            return _storeTellorPrice(tellorResponse);
        }

        // --- CASE 3: Both oracles were untrusted at the last price fetch ---
        if (status == Status.bothOraclesUntrusted) {
            /*
            * If both oracles are now live, unbroken and similar price, we assume that they are reporting
            * accurately, and so we switch back to supra.
            */
            if (_bothOraclesLiveAndUnbrokenAndSimilarPrice(supraResponse, tellorResponse)) {
                _changeStatus(Status.supraWorking);
                return _storeSupraPrice(supraResponse);
            }

            // Otherwise, return the last good price - both oracles are still untrusted (no status change)
            return lastGoodPrice;
        }

        // --- CASE 4: Using Tellor, and supra is frozen ---
        if (status == Status.usingTellorSupraFrozen) {
            if (_supraIsBroken(supraResponse)) {
                // If both Oracles are broken, return last good price
                if (_tellorIsBroken(tellorResponse)) {
                    _changeStatus(Status.bothOraclesUntrusted);
                    return lastGoodPrice;
                }

                // If supra is broken, remember it and switch to using Tellor
                _changeStatus(Status.usingTellorSupraUntrusted);

                if (_tellorIsFrozen(tellorResponse)) {return lastGoodPrice;}

                // If Tellor is working, return Tellor current price
                return _storeTellorPrice(tellorResponse);
            }

            if (_supraIsFrozen(supraResponse)) {
                // if supra is frozen and Tellor is broken, remember Tellor broke, and return last good price
                if (_tellorIsBroken(tellorResponse)) {
                    _changeStatus(Status.usingSupraTellorUntrusted);
                    return lastGoodPrice;
                }

                // If both are frozen, just use lastGoodPrice
                if (_tellorIsFrozen(tellorResponse)) {return lastGoodPrice;}

                // if supra is frozen and Tellor is working, keep using Tellor (no status change)
                return _storeTellorPrice(tellorResponse);
            }

            // if supra is live and Tellor is broken, remember Tellor broke, and return supra price
            if (_tellorIsBroken(tellorResponse)) {
                _changeStatus(Status.usingSupraTellorUntrusted);
                return _storeSupraPrice(supraResponse);
            }

            // If supra is live and Tellor is frozen, just use last good price (no status change) since we have no basis for comparison
            if (_tellorIsFrozen(tellorResponse)) {return lastGoodPrice;}

            // If supra is live and Tellor is working, compare prices. Switch to supra
            // if prices are within 5%, and return supra price.
            if (_bothOraclesSimilarPrice(supraResponse, tellorResponse)) {
                _changeStatus(Status.supraWorking);
                return _storeSupraPrice(supraResponse);
            }

            // Otherwise if supra is live but price not within 5% of Tellor, distrust supra, and return Tellor price
            _changeStatus(Status.usingTellorSupraUntrusted);
            return _storeTellorPrice(tellorResponse);
        }

        // --- CASE 5: Using supra, Tellor is untrusted ---
        if (status == Status.usingSupraTellorUntrusted) {
            // If supra breaks, now both oracles are untrusted
            if (_supraIsBroken(supraResponse)) {
                _changeStatus(Status.bothOraclesUntrusted);
                return lastGoodPrice;
            }

            // If supra is frozen, return last good price (no status change)
            if (_supraIsFrozen(supraResponse)) {
                return lastGoodPrice;
            }

            // If supra and Tellor are both live, unbroken and similar price, switch back to supraWorking and return supra price
            if (_bothOraclesLiveAndUnbrokenAndSimilarPrice(supraResponse, tellorResponse)) {
                _changeStatus(Status.supraWorking);
                return _storeSupraPrice(supraResponse);
            }

            // If supra is live but deviated >50% from it's previous price and Tellor is still untrusted, switch
            // to bothOraclesUntrusted and return last good price
            if (_supraPriceChangeAboveMax(supraResponse)) {
                _changeStatus(Status.bothOraclesUntrusted);
                return lastGoodPrice;
            }

            // Otherwise if supra is live and deviated <50% from it's previous price and Tellor is still untrusted,
            // return supra price (no status change)
            return _storeSupraPrice(supraResponse);
        }
    }

    // --- Helper functions ---

    function _supraPriceChangeAboveMax(SupraResponse memory _currentResponse) internal view returns (bool) {
        uint currentScaledPrice = _scaleSupraPriceByDigits(_currentResponse.value);

        uint minPrice = LiquityMath._min(currentScaledPrice, lastGoodPrice);
        uint maxPrice = LiquityMath._max(currentScaledPrice, lastGoodPrice);

        /*
        * Use the larger price as the denominator:
        * - If price decreased, the percentage deviation is in relation to the the previous price.
        * - If price increased, the percentage deviation is in relation to the current price.
        */
        uint percentDeviation = maxPrice.sub(minPrice).mul(DECIMAL_PRECISION).div(maxPrice);

        // Return true if price has more than doubled, or more than halved.
        return percentDeviation > MAX_PRICE_DEVIATION_FROM_PREVIOUS_ROUND;
    }

    function _supraIsBroken(SupraResponse memory _response) internal view returns (bool) {
        // Check for response call reverted
        if (!_response.success) {return true;}
        // Check for an invalid timeStamp that is 0, or in the future
        if (_response.timestamp == 0 || _response.timestamp > block.timestamp) {return true;}
        // Check for zero price
        if (_response.value == 0) {return true;}

        return false;
    }

    function _supraIsFrozen(SupraResponse  memory _supraResponse) internal view returns (bool) {
        return block.timestamp.sub(_supraResponse.timestamp) > TIMEOUT;
    }

    function _tellorIsBroken(TellorResponse memory _response) internal view returns (bool) {
        // Check for response call reverted
        if (!_response.success) {return true;}
        // Check for an invalid timeStamp that is 0, or in the future
        if (_response.timestamp == 0 || _response.timestamp > block.timestamp) {return true;}
        // Check for zero price
        if (_response.value == 0) {return true;}

        return false;
    }

    function _tellorIsFrozen(TellorResponse  memory _tellorResponse) internal view returns (bool) {
        return block.timestamp.sub(_tellorResponse.timestamp) > TIMEOUT;
    }

    function _bothOraclesLiveAndUnbrokenAndSimilarPrice
    (
        SupraResponse memory _supraResponse,
        TellorResponse memory _tellorResponse
    )
    internal
    view
    returns (bool)
    {
        // Return false if either oracle is broken or frozen
        if
        (
            _tellorIsBroken(_tellorResponse) ||
            _tellorIsFrozen(_tellorResponse) ||
            _supraIsBroken(_supraResponse) ||
            _supraIsFrozen(_supraResponse)
        )
        {
            return false;
        }

        return _bothOraclesSimilarPrice(_supraResponse, _tellorResponse);
    }

    function _bothOraclesSimilarPrice(SupraResponse memory _supraResponse, TellorResponse memory _tellorResponse) internal pure returns (bool) {
        uint scaledSupraPrice = _scaleSupraPriceByDigits(_supraResponse.value);
        uint scaledTellorPrice = _scaleTellorPriceByDigits(_tellorResponse.value);

        // Get the relative price difference between the oracles. Use the lower price as the denominator, i.e. the reference for the calculation.
        uint minPrice = LiquityMath._min(scaledTellorPrice, scaledSupraPrice);
        uint maxPrice = LiquityMath._max(scaledTellorPrice, scaledSupraPrice);
        uint percentPriceDifference = maxPrice.sub(minPrice).mul(DECIMAL_PRECISION).div(minPrice);

        /*
        * Return true if the relative price difference is <= 3%: if so, we assume both oracles are probably reporting
        * the honest market price, as it is unlikely that both have been broken/hacked and are still in-sync.
        */
        return percentPriceDifference <= MAX_PRICE_DIFFERENCE_BETWEEN_ORACLES;
    }

    function _scaleSupraPriceByDigits(uint _price) internal pure returns (uint) {
        return _price.mul(10 ** (TARGET_DIGITS - SUPRA_DIGITS));
    }

    function _scaleTellorPriceByDigits(uint _price) internal pure returns (uint) {
        return _price.mul(10 ** (TARGET_DIGITS - TELLOR_DIGITS));
    }

    function _changeStatus(Status _status) internal {
        status = _status;
        emit PriceFeedStatusChanged(_status);
    }

    function _storePrice(uint _currentPrice) internal {
        lastGoodPrice = _currentPrice;
        emit LastGoodPriceUpdated(_currentPrice);
    }

    function _storeSupraPrice(SupraResponse memory _supraResponse) internal returns (uint) {
        uint scaledSupraPrice = _scaleSupraPriceByDigits(_supraResponse.value);
        _storePrice(scaledSupraPrice);

        return scaledSupraPrice;
    }

    function _storeTellorPrice(TellorResponse memory _tellorResponse) internal returns (uint) {
        uint scaledTellorPrice = _scaleTellorPriceByDigits(_tellorResponse.value);
        _storePrice(scaledTellorPrice);

        return scaledTellorPrice;
    }

    // --- Oracle response wrapper functions ---

    function _getCurrentTellorResponse() internal view returns (TellorResponse memory tellorResponse) {
        try tellorCaller.getTellorCurrentValue(ETHUSD_TELLOR_REQ_ID) returns
        (
            bool ifRetrieve,
            uint256 value,
            uint256 _timestampRetrieved
        )
        {
            // If call to Tellor succeeds, return the response and success = true
            tellorResponse.ifRetrieve = ifRetrieve;
            tellorResponse.value = value;
            tellorResponse.timestamp = _timestampRetrieved;
            tellorResponse.success = true;

            return (tellorResponse);
        }catch {
            // If call to Tellor reverts, return a zero response with success = false
            return (tellorResponse);
        }
    }

    function _getCurrentSupraResponse() internal view returns (SupraResponse memory supraResponse) {
        try supraCaller.getSupraCurrentValue(HBAR_USD_ID) returns
        (
            bool ifRetrieve,
            uint256 value,
            uint256 _timestampRetrieved
        )
        {
            // If call to Supra succeeds, return the response and success = true
            supraResponse.ifRetrieve = ifRetrieve;
            supraResponse.value = value;
            supraResponse.timestamp = _timestampRetrieved;
            supraResponse.success = true;

            return (supraResponse);
        }catch {
            // If call to Supra reverts, return a zero response with success = false
            return (supraResponse);
        }
    }
}

