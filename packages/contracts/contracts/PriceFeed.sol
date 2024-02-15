// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "./Interfaces/IPriceFeed.sol";
import "./Interfaces/ISupraCaller.sol";
import "./Dependencies/AggregatorV3Interface.sol";
import "./Dependencies/SafeMath.sol";
import "./Dependencies/Ownable.sol";
import "./Dependencies/CheckContract.sol";
import "./Dependencies/BaseMath.sol";
import "./Dependencies/LiquityMath.sol";
import "./Dependencies/console.sol";
import "./Interfaces/IPythCaller.sol";

/*
* PriceFeed for mainnet deployment, to be connected to Chainlink's live ETH:USD aggregator reference 
* contract, and a wrapper contract PythCaller, which connects to PythMaster contract.
*
* The PriceFeed uses Chainlink as primary oracle, and Pyth as fallback. It contains logic for
* switching oracles based on oracle failures, timeouts, and conditions for returning to the primary
* Chainlink oracle.
*/
contract PriceFeed is Ownable, CheckContract, BaseMath, IPriceFeed {
    using SafeMath for uint256;

    string constant public NAME = "PriceFeed";

    ISupraCaller public supraCaller;
    IPythCaller public pythCaller;

    // Core Liquity contracts
    address borrowerOperationsAddress;
    address troveManagerAddress;

    uint256 constant public HBAR_USD_ID = 75;

    // Use to convert a price answer to an 8-digit precision uint
    uint constant public TARGET_DIGITS = 8;
    uint constant public SUPRA_DIGITS = 18;
    uint constant public PYTH_DIGITS = 8;

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

    struct PythResponse {
        bool ifRetrieve;
        uint256 value;
        uint256 timestamp;
        bool success;
    }

    enum Status {
        supraWorking,
        usingPythSupraUntrusted,
        bothOraclesUntrusted,
        usingPythSupraFrozen,
        usingSupraPythUntrusted
    }

    // The current status of the PricFeed, which determines the conditions for the next price fetch attempt
    Status public status;

    event LastGoodPriceUpdated(uint _lastGoodPrice);
    event PriceFeedStatusChanged(Status newStatus);

    // --- Dependency setters ---

    function setAddresses(
        address _supraCallerAddress,
        address _pythCallerAddress
    )
    external
    onlyOwner
    {
        checkContract(_supraCallerAddress);
        checkContract(_pythCallerAddress);

        supraCaller = ISupraCaller(_supraCallerAddress);
        pythCaller = IPythCaller(_pythCallerAddress);

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
    * Uses a main oracle (Supra) and a fallback oracle (Pyth) in case Supra fails. If both fail,
    * it uses the last good price seen by Liquity.
    *
    */
    function fetchPrice() external override returns (uint) {
        // Get current price data from Supra, and current price data from Pyth
        SupraResponse memory supraResponse = _getCurrentSupraResponse();
        PythResponse memory pythResponse = _getCurrentPythResponse();

        // --- CASE 1: System fetched last price from supra  ---
        if (status == Status.supraWorking) {
            // If supra is broken, try Pyth
            if (_supraIsBroken(supraResponse)) {
                // If Pyth is broken then both oracles are untrusted, so return the last good price
                if (_pythIsBroken(pythResponse)) {
                    _changeStatus(Status.bothOraclesUntrusted);
                    return lastGoodPrice;
                }
                /*
                * If Pyth is only frozen but otherwise returning valid data, return the last good price.
                * Pyth may need to be tipped to return current data.
                */
                if (_pythIsFrozen(pythResponse)) {
                    _changeStatus(Status.usingPythSupraUntrusted);
                    return lastGoodPrice;
                }

                // If supra is broken and Pyth is working, switch to Pyth and return current Pyth price
                _changeStatus(Status.usingPythSupraUntrusted);
                return _storePythPrice(pythResponse);
            }

            // If supra is frozen, try Pyth
            if (_supraIsFrozen(supraResponse)) {
                // If Pyth is broken too, remember Pyth broke, and return last good price
                if (_pythIsBroken(pythResponse)) {
                    _changeStatus(Status.usingSupraPythUntrusted);
                    return lastGoodPrice;
                }

                // If Pyth is frozen or working, remember supra froze, and switch to Pyth
                _changeStatus(Status.usingPythSupraFrozen);

                if (_pythIsFrozen(pythResponse)) {return lastGoodPrice;}

                // If Pyth is working, use it
                return _storePythPrice(pythResponse);
            }

            // If supra price has changed by > 50% between two consecutive rounds, compare it to Pyth's price
            if (_supraPriceChangeAboveMax(supraResponse)) {
                // If Pyth is broken, both oracles are untrusted, and return last good price
                if (_pythIsBroken(pythResponse)) {
                    _changeStatus(Status.bothOraclesUntrusted);
                    return lastGoodPrice;
                }

                // If Pyth is frozen, switch to Pyth and return last good price
                if (_pythIsFrozen(pythResponse)) {
                    _changeStatus(Status.usingPythSupraUntrusted);
                    return lastGoodPrice;
                }

                /*
                * If Pyth is live and both oracles have a similar price, conclude that supra's large price deviation between
                * two consecutive rounds was likely a legitmate market price movement, and so continue using supra
                */
                if (_bothOraclesSimilarPrice(supraResponse, pythResponse)) {
                    return _storeSupraPrice(supraResponse);
                }

                // If Pyth is live but the oracles differ too much in price, conclude that supra's initial price deviation was
                // an oracle failure. Switch to Pyth, and use Pyth price
                _changeStatus(Status.usingPythSupraUntrusted);
                return _storePythPrice(pythResponse);
            }

            // If supra is working and Pyth is broken, remember Pyth is broken
            if (_pythIsBroken(pythResponse)) {
                _changeStatus(Status.usingSupraPythUntrusted);
            }

            // If supra is working, return supra current price (no status change)
            return _storeSupraPrice(supraResponse);
        }

        // --- CASE 2: The system fetched last price from Pyth ---
        if (status == Status.usingPythSupraUntrusted) {
            // If both Pyth and supra are live, unbroken, and reporting similar prices, switch back to supra
            if (_bothOraclesLiveAndUnbrokenAndSimilarPrice(supraResponse, pythResponse)) {
                _changeStatus(Status.supraWorking);
                return _storeSupraPrice(supraResponse);
            }

            if (_pythIsBroken(pythResponse)) {
                _changeStatus(Status.bothOraclesUntrusted);
                return lastGoodPrice;
            }

            /*
            * If Pyth is only frozen but otherwise returning valid data, just return the last good price.
            * Pyth may need to be tipped to return current data.
            */
            if (_pythIsFrozen(pythResponse)) {return lastGoodPrice;}

            // Otherwise, use Pyth price
            return _storePythPrice(pythResponse);
        }

        // --- CASE 3: Both oracles were untrusted at the last price fetch ---
        if (status == Status.bothOraclesUntrusted) {
            /*
            * If both oracles are now live, unbroken and similar price, we assume that they are reporting
            * accurately, and so we switch back to supra.
            */
            if (_bothOraclesLiveAndUnbrokenAndSimilarPrice(supraResponse, pythResponse)) {
                _changeStatus(Status.supraWorking);
                return _storeSupraPrice(supraResponse);
            }

            // Otherwise, return the last good price - both oracles are still untrusted (no status change)
            return lastGoodPrice;
        }

        // --- CASE 4: Using Pyth, and supra is frozen ---
        if (status == Status.usingPythSupraFrozen) {
            if (_supraIsBroken(supraResponse)) {
                // If both Oracles are broken, return last good price
                if (_pythIsBroken(pythResponse)) {
                    _changeStatus(Status.bothOraclesUntrusted);
                    return lastGoodPrice;
                }

                // If supra is broken, remember it and switch to using Pyth
                _changeStatus(Status.usingPythSupraUntrusted);

                if (_pythIsFrozen(pythResponse)) {return lastGoodPrice;}

                // If Pyth is working, return Pyth current price
                return _storePythPrice(pythResponse);
            }

            if (_supraIsFrozen(supraResponse)) {
                // if supra is frozen and Pyth is broken, remember Pyth broke, and return last good price
                if (_pythIsBroken(pythResponse)) {
                    _changeStatus(Status.usingSupraPythUntrusted);
                    return lastGoodPrice;
                }

                // If both are frozen, just use lastGoodPrice
                if (_pythIsFrozen(pythResponse)) {return lastGoodPrice;}

                // if supra is frozen and Pyth is working, keep using Pyth (no status change)
                return _storePythPrice(pythResponse);
            }

            // if supra is live and Pyth is broken, remember Pyth broke, and return supra price
            if (_pythIsBroken(pythResponse)) {
                _changeStatus(Status.usingSupraPythUntrusted);
                return _storeSupraPrice(supraResponse);
            }

            // If supra is live and Pyth is frozen, just use last good price (no status change) since we have no basis for comparison
            if (_pythIsFrozen(pythResponse)) {return lastGoodPrice;}

            // If supra is live and Pyth is working, compare prices. Switch to supra
            // if prices are within 5%, and return supra price.
            if (_bothOraclesSimilarPrice(supraResponse, pythResponse)) {
                _changeStatus(Status.supraWorking);
                return _storeSupraPrice(supraResponse);
            }

            // Otherwise if supra is live but price not within 5% of Pyth, distrust supra, and return Pyth price
            _changeStatus(Status.usingPythSupraUntrusted);
            return _storePythPrice(pythResponse);
        }

        // --- CASE 5: Using supra, Pyth is untrusted ---
        if (status == Status.usingSupraPythUntrusted) {
            // If supra breaks, now both oracles are untrusted
            if (_supraIsBroken(supraResponse)) {
                _changeStatus(Status.bothOraclesUntrusted);
                return lastGoodPrice;
            }

            // If supra is frozen, return last good price (no status change)
            if (_supraIsFrozen(supraResponse)) {
                return lastGoodPrice;
            }

            // If supra and Pyth are both live, unbroken and similar price, switch back to supraWorking and return supra price
            if (_bothOraclesLiveAndUnbrokenAndSimilarPrice(supraResponse, pythResponse)) {
                _changeStatus(Status.supraWorking);
                return _storeSupraPrice(supraResponse);
            }

            // If supra is live but deviated >50% from it's previous price and Pyth is still untrusted, switch
            // to bothOraclesUntrusted and return last good price
            if (_supraPriceChangeAboveMax(supraResponse)) {
                _changeStatus(Status.bothOraclesUntrusted);
                return lastGoodPrice;
            }

            // Otherwise if supra is live and deviated <50% from it's previous price and Pyth is still untrusted,
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

    function _pythIsBroken(PythResponse memory _response) internal view returns (bool) {
        // Check for response call reverted
        if (!_response.success) {return true;}
        // Check for an invalid timeStamp that is 0, or in the future
        if (_response.timestamp == 0 || _response.timestamp > block.timestamp) {return true;}
        // Check for zero price
        if (_response.value == 0) {return true;}

        return false;
    }

    function _pythIsFrozen(PythResponse  memory _pythResponse) internal view returns (bool) {
        return block.timestamp.sub(_pythResponse.timestamp) > TIMEOUT;
    }

    function _bothOraclesLiveAndUnbrokenAndSimilarPrice
    (
        SupraResponse memory _supraResponse,
        PythResponse memory _pythResponse
    )
    internal
    view
    returns (bool)
    {
        // Return false if either oracle is broken or frozen
        if
        (
            _pythIsBroken(_pythResponse) ||
            _pythIsFrozen(_pythResponse) ||
            _supraIsBroken(_supraResponse) ||
            _supraIsFrozen(_supraResponse)
        )
        {
            return false;
        }

        return _bothOraclesSimilarPrice(_supraResponse, _pythResponse);
    }

    function _bothOraclesSimilarPrice(SupraResponse memory _supraResponse, PythResponse memory _pythResponse) internal pure returns (bool) {
        uint scaledSupraPrice = _scaleSupraPriceByDigits(_supraResponse.value);
        uint scaledPythPrice = _scalePythPriceByDigits(_pythResponse.value);

        // Get the relative price difference between the oracles. Use the lower price as the denominator, i.e. the reference for the calculation.
        uint minPrice = LiquityMath._min(scaledPythPrice, scaledSupraPrice);
        uint maxPrice = LiquityMath._max(scaledPythPrice, scaledSupraPrice);
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

    function _scalePythPriceByDigits(uint _price) internal pure returns (uint) {
        return _price.mul(10 ** (TARGET_DIGITS - PYTH_DIGITS));
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

    function _storePythPrice(PythResponse memory _pythResponse) internal returns (uint) {
        uint scaledPythPrice = _scalePythPriceByDigits(_pythResponse.value);
        _storePrice(scaledPythPrice);

        return scaledPythPrice;
    }

    // --- Oracle response wrapper functions ---

    function _getCurrentPythResponse() internal view returns (PythResponse memory pythResponse){
        try pythCaller.getPythCurrentValue() returns
        (
            bool ifRetrieve,
            uint256 value,
            uint256 _timestampRetrieved
        )
        {
            // If call to Pyth succeeds, return the response and success = true
            pythResponse.ifRetrieve = ifRetrieve;
            pythResponse.value = value;
            pythResponse.timestamp = _timestampRetrieved;
            pythResponse.success = true;

            return (pythResponse);
        }catch {
            // If call to Pyth reverts, return a zero response with success = false
            return (pythResponse);
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

