// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "../Interfaces/IHLQTYToken.sol";
import "../Interfaces/ICommunityIssuance.sol";
import "../Dependencies/BaseMath.sol";
import "../Dependencies/LiquityMath.sol";
import "../Dependencies/Ownable.sol";
import "../Dependencies/CheckContract.sol";
import "../Dependencies/SafeMath.sol";
import "../Dependencies/BaseHST.sol";


contract CommunityIssuance is ICommunityIssuance, Ownable, CheckContract, BaseMath, BaseHST {
    using SafeMath for uint;

    // --- Data ---

    string constant public NAME = "CommunityIssuance";

    uint constant public SECONDS_IN_ONE_MINUTE = 60;

    /* The issuance factor F determines the curvature of the issuance curve.
     *
     * Minutes in one year: 60*24*365 = 525600
     *
     * For 50% of remaining tokens issued each year, with minutes as time units, we have:
     *
     * F ** 525600 = 0.5
     *
     * Re-arranging:
     *
     * 525600 * ln(F) = ln(0.5)
     * F = 0.5 ** (1/525600)
     * F = 0.999998681227695000
     */
    uint constant public ISSUANCE_FACTOR = 99999868;

    /* 
    * The community HLQTY supply cap is the starting balance of the Community Issuance contract.
    * It should be minted to this contract by HLQTYToken, when the token is deployed.
    * 
    * Set to 32M (slightly less than 1/3) of total HLQTY supply.
    */
    uint constant public HLQTYSupplyCap = 32e14; // 32 million

    IHLQTYToken public hlqtyToken;

    address public stabilityPoolAddress;

    uint public totalHLQTYIssued;
    uint public immutable deploymentTime;

    // --- Events ---

    event HLQTYTokenAddressSet(address _hlqtyTokenAddress);
    event StabilityPoolAddressSet(address _stabilityPoolAddress);
    event TotalHLQTYIssuedUpdated(uint _totalHLQTYIssued);

    // --- Functions ---

    constructor() public {
        deploymentTime = block.timestamp;
    }

    function setAddresses
    (
        address _hlqtyTokenAddress,
        address _stabilityPoolAddress
    )
    external
    onlyOwner
    override
    {
        checkContract(_hlqtyTokenAddress);
        checkContract(_stabilityPoolAddress);

        hlqtyToken = IHLQTYToken(_hlqtyTokenAddress);
        stabilityPoolAddress = _stabilityPoolAddress;

        // associate hst token with contract account
        _associateToken(address(this), hlqtyToken.getTokenAddress());

        // When HLQTYToken deployed, it should have transferred CommunityIssuance's HLQTY entitlement.
        // HEDERA: We can't checkt this here as we need to mint first, after the association.
        //uint HLQTYBalance = hlqtyToken.balanceOf(address(this));
        //assert(HLQTYBalance >= HLQTYSupplyCap);

        emit HLQTYTokenAddressSet(_hlqtyTokenAddress);
        emit StabilityPoolAddressSet(_stabilityPoolAddress);

        _renounceOwnership();
    }

    function issueHLQTY() external override returns (uint) {
        _requireCallerIsStabilityPool();

        uint latestTotalHLQTYIssued = HLQTYSupplyCap.mul(_getCumulativeIssuanceFraction()).div(DECIMAL_PRECISION);
        uint issuance = latestTotalHLQTYIssued.sub(totalHLQTYIssued);

        totalHLQTYIssued = latestTotalHLQTYIssued;
        emit TotalHLQTYIssuedUpdated(latestTotalHLQTYIssued);

        return issuance;
    }

    /* Gets 1-f^t    where: f < 1

    f: issuance factor that determines the shape of the curve
    t:  time passed since last HLQTY issuance event  */
    function _getCumulativeIssuanceFraction() internal view returns (uint) {
        // Get the time passed since deployment
        uint timePassedInMinutes = block.timestamp.sub(deploymentTime).div(SECONDS_IN_ONE_MINUTE);

        // f^t
        uint power = LiquityMath._decPow(ISSUANCE_FACTOR, timePassedInMinutes);

        //  (1 - f^t)
        uint cumulativeIssuanceFraction = (uint(DECIMAL_PRECISION).sub(power));
        assert(cumulativeIssuanceFraction <= DECIMAL_PRECISION); // must be in range [0,1]

        return cumulativeIssuanceFraction;
    }

    function sendHLQTY(address _account, uint _HLQTYamount) external override {
        _requireCallerIsStabilityPool();

        _transfer(hlqtyToken.getTokenAddress(), address(this), _account, _HLQTYamount);
    }

    // --- 'require' functions ---

    function _requireCallerIsStabilityPool() internal view {
        require(msg.sender == stabilityPoolAddress, "CommunityIssuance: caller is not SP");
    }
}
