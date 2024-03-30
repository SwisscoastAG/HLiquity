// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "../Interfaces/IHLQTToken.sol";
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
    * The community HLQT supply cap is the starting balance of the Community Issuance contract.
    * It should be minted to this contract by HLQTToken, when the token is deployed.
    * 
    * Set to 32M (slightly less than 1/3) of total HLQT supply.
    */
    uint constant public HLQTSupplyCap = 32e14; // 32 million

    IHLQTToken public hlqtToken;

    address public stabilityPoolAddress;

    uint public totalHLQTIssued;
    uint public immutable deploymentTime;

    // --- Events ---

    event HLQTTokenAddressSet(address _hlqtTokenAddress);
    event StabilityPoolAddressSet(address _stabilityPoolAddress);
    event TotalHLQTIssuedUpdated(uint _totalHLQTIssued);

    // --- Functions ---

    constructor() public {
        deploymentTime = block.timestamp;
    }

    function setAddresses
    (
        address _hlqtTokenAddress,
        address _stabilityPoolAddress
    )
    external
    onlyOwner
    override
    {
        checkContract(_hlqtTokenAddress);
        checkContract(_stabilityPoolAddress);

        hlqtToken = IHLQTToken(_hlqtTokenAddress);
        stabilityPoolAddress = _stabilityPoolAddress;

        // associate hst token with contract account
        _associateToken(address(this), hlqtToken.getTokenAddress());

        // When HLQTToken deployed, it should have transferred CommunityIssuance's HLQT entitlement.
        // HEDERA: We can't checkt this here as we need to mint first, after the association.
        //uint HLQTBalance = hlqtToken.balanceOf(address(this));
        //assert(HLQTBalance >= HLQTSupplyCap);

        emit HLQTTokenAddressSet(_hlqtTokenAddress);
        emit StabilityPoolAddressSet(_stabilityPoolAddress);

        _renounceOwnership();
    }

    function issueHLQT() external override returns (uint) {
        _requireCallerIsStabilityPool();

        uint latestTotalHLQTIssued = HLQTSupplyCap.mul(_getCumulativeIssuanceFraction()).div(DECIMAL_PRECISION);
        uint issuance = latestTotalHLQTIssued.sub(totalHLQTIssued);

        totalHLQTIssued = latestTotalHLQTIssued;
        emit TotalHLQTIssuedUpdated(latestTotalHLQTIssued);

        return issuance;
    }

    /* Gets 1-f^t    where: f < 1

    f: issuance factor that determines the shape of the curve
    t:  time passed since last HLQT issuance event  */
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

    function sendHLQT(address _account, uint _HLQTamount) external override {
        _requireCallerIsStabilityPool();

        _transfer(hlqtToken.getTokenAddress(), address(this), _account, _HLQTamount);
    }

    // --- 'require' functions ---

    function _requireCallerIsStabilityPool() internal view {
        require(msg.sender == stabilityPoolAddress, "CommunityIssuance: caller is not SP");
    }
}
