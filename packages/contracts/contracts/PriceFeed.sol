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
* PriceFeed for mainnet deployment, to be connected to Pyths's live HBAR:USD and USD/CHF aggregator reference 
* contract, and a wrapper contract SupraCaller, which connects to SupraMaster contract.
*
* The PriceFeed uses Pyth as primary oracle, and Supra as fallback. It contains logic for
* switching oracles based on oracle failures, timeouts, and conditions for returning to the primary
* Pyth oracle.
*/
contract PriceFeed is Ownable, CheckContract, BaseMath, IPriceFeed {
    using SafeMath for uint256;

    string constant public NAME = "PriceFeed";

    IPythCaller public pythCaller;
    ISupraCaller public supraCaller;

    // Core Liquity contracts
    address borrowerOperationsAddress;
    address troveManagerAddress;

    bytes32 constant public HBAR_USD_PYTH = 0x3728e591097635310e6341af53db8b7ee42da9b3a8d918f9463ce9cca886dfbd;
    bytes32 constant public USD_CHF_PYTH = 0x0b1e3297e69f162877b577b0d6a47a0d63b2392bc8499e6540da4187a63e28f8;
    uint256 constant public HBAR_USD_SUPRA = 75;
    uint256 constant public USD_CHF_SUPRA = 5012;

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

    struct PythResponse {
        bool ifRetrieve;
        uint256 value;
        uint256 timestamp;
        bool success;
    }

    struct SupraResponse {
        bool ifRetrieve;
        uint256 value;
        uint256 timestamp;
        bool success;
    }

    enum Status {
        pythWorking,
        usingSupraPythUntrusted,
        bothOraclesUntrusted,
        usingSupraPythFrozen,
        usingPythSupraUntrusted
    }

    // The current status of the PricFeed, which determines the conditions for the next price fetch attempt
    Status public status;

    event LastGoodPriceUpdated(uint _lastGoodPrice);
    event PriceFeedStatusChanged(Status newStatus);

    // --- Dependency setters ---

    function setAddresses(
        address _pythCallerAddress,
        address _supraCallerAddress
    )
    external
    onlyOwner
    {
        checkContract(_pythCallerAddress);
        checkContract(_supraCallerAddress);

        pythCaller = IPythCaller(_pythCallerAddress);
        supraCaller = ISupraCaller(_supraCallerAddress);

        // Explicitly set initial system status
        status = Status.pythWorking;

        PythResponse memory pythResponse = _getCurrentPythResponse();

        require(!_pythIsBroken(pythResponse) && !_pythIsFrozen(pythResponse),
            "PriceFeed: Pyth must be working and current");

        _storePythPrice(pythResponse);

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
    * Uses a main oracle (Pyth) and a fallback oracle (Supra) in case Pyth fails. If both fail,
    * it uses the last good price seen by Liquity.
    *
    */
    function fetchPrice() external override returns (uint) {
        // Get current price data from Pyth, and current price data from Supra
        PythResponse memory pythResponse = _getCurrentPythResponse();
        SupraResponse memory supraResponse = _getCurrentSupraResponse();

        // --- CASE 1: System fetched last price from pyth  ---
        if (status == Status.pythWorking) {
            // If pyth is broken, try Supra
            if (_pythIsBroken(pythResponse)) {
                // If Supra is broken then both oracles are untrusted, so return the last good price
                if (_supraIsBroken(supraResponse)) {
                    _changeStatus(Status.bothOraclesUntrusted);
                    return lastGoodPrice;
                }
                /*
                * If Supra is only frozen but otherwise returning valid data, return the last good price.
                * Supra may need to be tipped to return current data.
                */
                if (_supraIsFrozen(supraResponse)) {
                    _changeStatus(Status.usingSupraPythUntrusted);
                    return lastGoodPrice;
                }

                // If pyth is broken and Supra is working, switch to Supra and return current Supra price
                _changeStatus(Status.usingSupraPythUntrusted);
                return _storeSupraPrice(supraResponse);
            }

            // If pyth is frozen, try Supra
            if (_pythIsFrozen(pythResponse)) {
                // If Supra is broken too, remember Supra broke, and return last good price
                if (_supraIsBroken(supraResponse)) {
                    _changeStatus(Status.usingPythSupraUntrusted);
                    return lastGoodPrice;
                }

                // If Supra is frozen or working, remember pyth froze, and switch to Supra
                _changeStatus(Status.usingSupraPythFrozen);

                if (_supraIsFrozen(supraResponse)) {return lastGoodPrice;}

                // If Supra is working, use it
                return _storeSupraPrice(supraResponse);
            }

            // If pyth price has changed by > 50% between two consecutive rounds, compare it to Supra's price
            if (_pythPriceChangeAboveMax(pythResponse)) {
                // If Supra is broken, both oracles are untrusted, and return last good price
                if (_supraIsBroken(supraResponse)) {
                    _changeStatus(Status.bothOraclesUntrusted);
                    return lastGoodPrice;
                }

                // If Supra is frozen, switch to Supra and return last good price
                if (_supraIsFrozen(supraResponse)) {
                    _changeStatus(Status.usingSupraPythUntrusted);
                    return lastGoodPrice;
                }

                /*
                * If Supra is live and both oracles have a similar price, conclude that pyth's large price deviation between
                * two consecutive rounds was likely a legitmate market price movement, and so continue using pyth
                */
                if (_bothOraclesSimilarPrice(pythResponse, supraResponse)) {
                    return _storePythPrice(pythResponse);
                }

                // If Supra is live but the oracles differ too much in price, conclude that pyth's initial price deviation was
                // an oracle failure. Switch to Supra, and use Supra price
                _changeStatus(Status.usingSupraPythUntrusted);
                return _storeSupraPrice(supraResponse);
            }

            // If pyth is working and Supra is broken, remember Supra is broken
            if (_supraIsBroken(supraResponse)) {
                _changeStatus(Status.usingPythSupraUntrusted);
            }

            // If pyth is working, return pyth current price (no status change)
            return _storePythPrice(pythResponse);
        }

        // --- CASE 2: The system fetched last price from Supra ---
        if (status == Status.usingSupraPythUntrusted) {
            // If both Supra and pyth are live, unbroken, and reporting similar prices, switch back to pyth
            if (_bothOraclesLiveAndUnbrokenAndSimilarPrice(pythResponse, supraResponse)) {
                _changeStatus(Status.pythWorking);
                return _storePythPrice(pythResponse);
            }

            if (_supraIsBroken(supraResponse)) {
                _changeStatus(Status.bothOraclesUntrusted);
                return lastGoodPrice;
            }

            /*
            * If Supra is only frozen but otherwise returning valid data, just return the last good price.
            * Supra may need to be tipped to return current data.
            */
            if (_supraIsFrozen(supraResponse)) {return lastGoodPrice;}

            // Otherwise, use Supra price
            return _storeSupraPrice(supraResponse);
        }

        // --- CASE 3: Both oracles were untrusted at the last price fetch ---
        if (status == Status.bothOraclesUntrusted) {
            /*
            * If both oracles are now live, unbroken and similar price, we assume that they are reporting
            * accurately, and so we switch back to pyth.
            */
            if (_bothOraclesLiveAndUnbrokenAndSimilarPrice(pythResponse, supraResponse)) {
                _changeStatus(Status.pythWorking);
                return _storePythPrice(pythResponse);
            }

            // Otherwise, return the last good price - both oracles are still untrusted (no status change)
            return lastGoodPrice;
        }

        // --- CASE 4: Using Supra, and pyth is frozen ---
        if (status == Status.usingSupraPythFrozen) {
            if (_pythIsBroken(pythResponse)) {
                // If both Oracles are broken, return last good price
                if (_supraIsBroken(supraResponse)) {
                    _changeStatus(Status.bothOraclesUntrusted);
                    return lastGoodPrice;
                }

                // If pyth is broken, remember it and switch to using Supra
                _changeStatus(Status.usingSupraPythUntrusted);

                if (_supraIsFrozen(supraResponse)) {return lastGoodPrice;}

                // If Supra is working, return Supra current price
                return _storeSupraPrice(supraResponse);
            }

            if (_pythIsFrozen(pythResponse)) {
                // if pyth is frozen and Supra is broken, remember Supra broke, and return last good price
                if (_supraIsBroken(supraResponse)) {
                    _changeStatus(Status.usingPythSupraUntrusted);
                    return lastGoodPrice;
                }

                // If both are frozen, just use lastGoodPrice
                if (_supraIsFrozen(supraResponse)) {return lastGoodPrice;}

                // if pyth is frozen and Supra is working, keep using Supra (no status change)
                return _storeSupraPrice(supraResponse);
            }

            // if pyth is live and Supra is broken, remember Supra broke, and return pyth price
            if (_supraIsBroken(supraResponse)) {
                _changeStatus(Status.usingPythSupraUntrusted);
                return _storePythPrice(pythResponse);
            }

            // If pyth is live and Supra is frozen, just use last good price (no status change) since we have no basis for comparison
            if (_supraIsFrozen(supraResponse)) {return lastGoodPrice;}

            // If pyth is live and Supra is working, compare prices. Switch to pyth
            // if prices are within 5%, and return pyth price.
            if (_bothOraclesSimilarPrice(pythResponse, supraResponse)) {
                _changeStatus(Status.pythWorking);
                return _storePythPrice(pythResponse);
            }

            // Otherwise if pyth is live but price not within 5% of Supra, distrust pyth, and return Supra price
            _changeStatus(Status.usingSupraPythUntrusted);
            return _storeSupraPrice(supraResponse);
        }

        // --- CASE 5: Using pyth, Supra is untrusted ---
        if (status == Status.usingPythSupraUntrusted) {
            // If pyth breaks, now both oracles are untrusted
            if (_pythIsBroken(pythResponse)) {
                _changeStatus(Status.bothOraclesUntrusted);
                return lastGoodPrice;
            }

            // If pyth is frozen, return last good price (no status change)
            if (_pythIsFrozen(pythResponse)) {
                return lastGoodPrice;
            }

            // If pyth and Supra are both live, unbroken and similar price, switch back to pythWorking and return pyth price
            if (_bothOraclesLiveAndUnbrokenAndSimilarPrice(pythResponse, supraResponse)) {
                _changeStatus(Status.pythWorking);
                return _storePythPrice(pythResponse);
            }

            // If pyth is live but deviated >50% from it's previous price and Supra is still untrusted, switch
            // to bothOraclesUntrusted and return last good price
            if (_pythPriceChangeAboveMax(pythResponse)) {
                _changeStatus(Status.bothOraclesUntrusted);
                return lastGoodPrice;
            }

            // Otherwise if pyth is live and deviated <50% from it's previous price and Supra is still untrusted,
            // return pyth price (no status change)
            return _storePythPrice(pythResponse);
        }
    }

    // --- Helper functions ---

    function _pythPriceChangeAboveMax(PythResponse memory _currentResponse) internal view returns (bool) {
        uint currentScaledPrice = _currentResponse.value;

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

    function _bothOraclesLiveAndUnbrokenAndSimilarPrice
    (
        PythResponse memory _pythResponse,
        SupraResponse memory _supraResponse
    )
    internal
    view
    returns (bool)
    {
        // Return false if either oracle is broken or frozen
        if
        (
            _supraIsBroken(_supraResponse) ||
            _supraIsFrozen(_supraResponse) ||
            _pythIsBroken(_pythResponse) ||
            _pythIsFrozen(_pythResponse)
        )
        {
            return false;
        }

        return _bothOraclesSimilarPrice(_pythResponse, _supraResponse);
    }

    function _bothOraclesSimilarPrice(PythResponse memory _pythResponse, SupraResponse memory _supraResponse) internal pure returns (bool) {
        uint scaledPythPrice = _pythResponse.value;
        uint scaledSupraPrice = _supraResponse.value;

        // Get the relative price difference between the oracles. Use the lower price as the denominator, i.e. the reference for the calculation.
        uint minPrice = LiquityMath._min(scaledSupraPrice, scaledPythPrice);
        uint maxPrice = LiquityMath._max(scaledSupraPrice, scaledPythPrice);
        uint percentPriceDifference = maxPrice.sub(minPrice).mul(DECIMAL_PRECISION).div(minPrice);

        /*
        * Return true if the relative price difference is <= 3%: if so, we assume both oracles are probably reporting
        * the honest market price, as it is unlikely that both have been broken/hacked and are still in-sync.
        */
        return percentPriceDifference <= MAX_PRICE_DIFFERENCE_BETWEEN_ORACLES;
    }

    function _changeStatus(Status _status) internal {
        status = _status;
        emit PriceFeedStatusChanged(_status);
    }

    function _storePrice(uint _currentPrice) internal {
        lastGoodPrice = _currentPrice;
        emit LastGoodPriceUpdated(_currentPrice);
    }

    function _storePythPrice(PythResponse memory _pythResponse) internal returns (uint) {
        uint scaledPythPrice = _pythResponse.value;
        _storePrice(scaledPythPrice);

        return scaledPythPrice;
    }

    function _storeSupraPrice(SupraResponse memory _supraResponse) internal returns (uint) {
        uint scaledSupraPrice = _supraResponse.value;
        _storePrice(scaledSupraPrice);

        return scaledSupraPrice;
    }

    // --- Oracle response wrapper functions ---

    function _getCurrentSupraResponse() internal view returns (SupraResponse memory supraResponse){
        try supraCaller.getSupraCurrentValue(HBAR_USD_SUPRA, USD_CHF_SUPRA) returns
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

    function _getCurrentPythResponse() internal view returns (PythResponse memory pythResponse) {
        try pythCaller.getPythCurrentValue(HBAR_USD_PYTH, USD_CHF_PYTH) returns
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
}

