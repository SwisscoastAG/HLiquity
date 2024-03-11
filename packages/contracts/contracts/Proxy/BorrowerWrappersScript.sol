// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "../Dependencies/SafeMath.sol";
import "../Dependencies/LiquityMath.sol";
import "../Dependencies/IERC20.sol";
import "../Interfaces/IBorrowerOperations.sol";
import "../Interfaces/ITroveManager.sol";
import "../Interfaces/IStabilityPool.sol";
import "../Interfaces/IPriceFeed.sol";
import "../Interfaces/IHLQTYStaking.sol";
import "./BorrowerOperationsScript.sol";
import "./ETHTransferScript.sol";
import "./HLQTYStakingScript.sol";
import "../Dependencies/console.sol";


contract BorrowerWrappersScript is BorrowerOperationsScript, ETHTransferScript, HLQTYStakingScript {
    using SafeMath for uint;

    string constant public NAME = "BorrowerWrappersScript";

    ITroveManager immutable troveManager;
    IStabilityPool immutable stabilityPool;
    IPriceFeed immutable priceFeed;
    IERC20 immutable dchfToken;
    IERC20 immutable hlqtyToken;
    IHLQTYStaking immutable hlqtyStaking;

    constructor(
        address _borrowerOperationsAddress,
        address _troveManagerAddress,
        address _hlqtyStakingAddress
    )
        BorrowerOperationsScript(IBorrowerOperations(_borrowerOperationsAddress))
        HLQTYStakingScript(_hlqtyStakingAddress)
        public
    {
        checkContract(_troveManagerAddress);
        ITroveManager troveManagerCached = ITroveManager(_troveManagerAddress);
        troveManager = troveManagerCached;

        IStabilityPool stabilityPoolCached = troveManagerCached.stabilityPool();
        checkContract(address(stabilityPoolCached));
        stabilityPool = stabilityPoolCached;

        IPriceFeed priceFeedCached = troveManagerCached.priceFeed();
        checkContract(address(priceFeedCached));
        priceFeed = priceFeedCached;

        address dchfTokenCached = address(troveManagerCached.dchfToken());
        checkContract(dchfTokenCached);
        dchfToken = IERC20(dchfTokenCached);

        address hlqtyTokenCached = address(troveManagerCached.hlqtyToken());
        checkContract(hlqtyTokenCached);
        hlqtyToken = IERC20(hlqtyTokenCached);

        IHLQTYStaking hlqtyStakingCached = troveManagerCached.hlqtyStaking();
        require(_hlqtyStakingAddress == address(hlqtyStakingCached), "BorrowerWrappersScript: Wrong HLQTYStaking address");
        hlqtyStaking = hlqtyStakingCached;
    }

    function claimCollateralAndOpenTrove(uint _maxFee, uint _DCHFAmount, address _upperHint, address _lowerHint) external payable {
        uint balanceBefore = address(this).balance;

        // Claim collateral
        borrowerOperations.claimCollateral();

        uint balanceAfter = address(this).balance;

        // already checked in CollSurplusPool
        assert(balanceAfter > balanceBefore);

        uint totalCollateral = balanceAfter.sub(balanceBefore).add(msg.value);

        // Open trove with obtained collateral, plus collateral sent by user
        borrowerOperations.openTrove{ value: totalCollateral }(_maxFee, _DCHFAmount, _upperHint, _lowerHint);
    }

    function claimSPRewardsAndRecycle(uint _maxFee, address _upperHint, address _lowerHint) external {
        uint collBalanceBefore = address(this).balance;
        uint hlqtyBalanceBefore = hlqtyToken.balanceOf(address(this));

        // Claim rewards
        stabilityPool.withdrawFromSP(0);

        uint collBalanceAfter = address(this).balance;
        uint hlqtyBalanceAfter = hlqtyToken.balanceOf(address(this));
        uint claimedCollateral = collBalanceAfter.sub(collBalanceBefore);

        // Add claimed ETH to trove, get more DCHF and stake it into the Stability Pool
        if (claimedCollateral > 0) {
            _requireUserHasTrove(address(this));
            uint DCHFAmount = _getNetDCHFAmount(claimedCollateral);
            borrowerOperations.adjustTrove{ value: claimedCollateral }(_maxFee, 0, DCHFAmount, true, _upperHint, _lowerHint);
            // Provide withdrawn DCHF to Stability Pool
            if (DCHFAmount > 0) {
                stabilityPool.provideToSP(DCHFAmount, address(0));
            }
        }

        // Stake claimed HLQTY
        uint claimedHLQTY = hlqtyBalanceAfter.sub(hlqtyBalanceBefore);
        if (claimedHLQTY > 0) {
            hlqtyStaking.stake(claimedHLQTY);
        }
    }

    function claimStakingGainsAndRecycle(uint _maxFee, address _upperHint, address _lowerHint) external {
        uint collBalanceBefore = address(this).balance;
        uint dchfBalanceBefore = dchfToken.balanceOf(address(this));
        uint hlqtyBalanceBefore = hlqtyToken.balanceOf(address(this));

        // Claim gains
        hlqtyStaking.unstake(0);

        uint gainedCollateral = address(this).balance.sub(collBalanceBefore); // stack too deep issues :'(
        uint gainedDCHF = dchfToken.balanceOf(address(this)).sub(dchfBalanceBefore);

        uint netDCHFAmount;
        // Top up trove and get more DCHF, keeping ICR constant
        if (gainedCollateral > 0) {
            _requireUserHasTrove(address(this));
            netDCHFAmount = _getNetDCHFAmount(gainedCollateral);
            borrowerOperations.adjustTrove{ value: gainedCollateral }(_maxFee, 0, netDCHFAmount, true, _upperHint, _lowerHint);
        }

        uint totalDCHF = gainedDCHF.add(netDCHFAmount);
        if (totalDCHF > 0) {
            stabilityPool.provideToSP(totalDCHF, address(0));

            // Providing to Stability Pool also triggers HLQTY claim, so stake it if any
            uint hlqtyBalanceAfter = hlqtyToken.balanceOf(address(this));
            uint claimedHLQTY = hlqtyBalanceAfter.sub(hlqtyBalanceBefore);
            if (claimedHLQTY > 0) {
                hlqtyStaking.stake(claimedHLQTY);
            }
        }

    }

    function _getNetDCHFAmount(uint _collateral) internal returns (uint) {
        uint price = priceFeed.fetchPrice();
        uint ICR = troveManager.getCurrentICR(address(this), price);

        uint DCHFAmount = _collateral.mul(price).div(ICR);
        uint borrowingRate = troveManager.getBorrowingRateWithDecay();
        uint netDebt = DCHFAmount.mul(LiquityMath.DECIMAL_PRECISION).div(LiquityMath.DECIMAL_PRECISION.add(borrowingRate));

        return netDebt;
    }

    function _requireUserHasTrove(address _depositor) internal view {
        require(troveManager.getTroveStatus(_depositor) == 1, "BorrowerWrappersScript: caller must have an active trove");
    }
}
