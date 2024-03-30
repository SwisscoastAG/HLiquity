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
import "../Interfaces/IHLQTStaking.sol";
import "./BorrowerOperationsScript.sol";
import "./ETHTransferScript.sol";
import "./HLQTStakingScript.sol";
import "../Dependencies/console.sol";


contract BorrowerWrappersScript is BorrowerOperationsScript, ETHTransferScript, HLQTStakingScript {
    using SafeMath for uint;

    string constant public NAME = "BorrowerWrappersScript";

    ITroveManager immutable troveManager;
    IStabilityPool immutable stabilityPool;
    IPriceFeed immutable priceFeed;
    IERC20 immutable hchfToken;
    IERC20 immutable hlqtToken;
    IHLQTStaking immutable hlqtStaking;

    constructor(
        address _borrowerOperationsAddress,
        address _troveManagerAddress,
        address _hlqtStakingAddress
    )
        BorrowerOperationsScript(IBorrowerOperations(_borrowerOperationsAddress))
        HLQTStakingScript(_hlqtStakingAddress)
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

        address hchfTokenCached = address(troveManagerCached.hchfToken());
        checkContract(hchfTokenCached);
        hchfToken = IERC20(hchfTokenCached);

        address hlqtTokenCached = address(troveManagerCached.hlqtToken());
        checkContract(hlqtTokenCached);
        hlqtToken = IERC20(hlqtTokenCached);

        IHLQTStaking hlqtStakingCached = troveManagerCached.hlqtStaking();
        require(_hlqtStakingAddress == address(hlqtStakingCached), "BorrowerWrappersScript: Wrong HLQTStaking address");
        hlqtStaking = hlqtStakingCached;
    }

    function claimCollateralAndOpenTrove(uint _maxFee, uint _HCHFAmount, address _upperHint, address _lowerHint) external payable {
        uint balanceBefore = address(this).balance;

        // Claim collateral
        borrowerOperations.claimCollateral();

        uint balanceAfter = address(this).balance;

        // already checked in CollSurplusPool
        assert(balanceAfter > balanceBefore);

        uint totalCollateral = balanceAfter.sub(balanceBefore).add(msg.value);

        // Open trove with obtained collateral, plus collateral sent by user
        borrowerOperations.openTrove{ value: totalCollateral }(_maxFee, _HCHFAmount, _upperHint, _lowerHint);
    }

    function claimSPRewardsAndRecycle(uint _maxFee, address _upperHint, address _lowerHint) external {
        uint collBalanceBefore = address(this).balance;
        uint hlqtBalanceBefore = hlqtToken.balanceOf(address(this));

        // Claim rewards
        stabilityPool.withdrawFromSP(0);

        uint collBalanceAfter = address(this).balance;
        uint hlqtBalanceAfter = hlqtToken.balanceOf(address(this));
        uint claimedCollateral = collBalanceAfter.sub(collBalanceBefore);

        // Add claimed ETH to trove, get more HCHF and stake it into the Stability Pool
        if (claimedCollateral > 0) {
            _requireUserHasTrove(address(this));
            uint HCHFAmount = _getNetHCHFAmount(claimedCollateral);
            borrowerOperations.adjustTrove{ value: claimedCollateral }(_maxFee, 0, HCHFAmount, true, _upperHint, _lowerHint);
            // Provide withdrawn HCHF to Stability Pool
            if (HCHFAmount > 0) {
                stabilityPool.provideToSP(HCHFAmount, address(0));
            }
        }

        // Stake claimed HLQT
        uint claimedHLQT = hlqtBalanceAfter.sub(hlqtBalanceBefore);
        if (claimedHLQT > 0) {
            hlqtStaking.stake(claimedHLQT);
        }
    }

    function claimStakingGainsAndRecycle(uint _maxFee, address _upperHint, address _lowerHint) external {
        uint collBalanceBefore = address(this).balance;
        uint hchfBalanceBefore = hchfToken.balanceOf(address(this));
        uint hlqtBalanceBefore = hlqtToken.balanceOf(address(this));

        // Claim gains
        hlqtStaking.unstake(0);

        uint gainedCollateral = address(this).balance.sub(collBalanceBefore); // stack too deep issues :'(
        uint gainedHCHF = hchfToken.balanceOf(address(this)).sub(hchfBalanceBefore);

        uint netHCHFAmount;
        // Top up trove and get more HCHF, keeping ICR constant
        if (gainedCollateral > 0) {
            _requireUserHasTrove(address(this));
            netHCHFAmount = _getNetHCHFAmount(gainedCollateral);
            borrowerOperations.adjustTrove{ value: gainedCollateral }(_maxFee, 0, netHCHFAmount, true, _upperHint, _lowerHint);
        }

        uint totalHCHF = gainedHCHF.add(netHCHFAmount);
        if (totalHCHF > 0) {
            stabilityPool.provideToSP(totalHCHF, address(0));

            // Providing to Stability Pool also triggers HLQT claim, so stake it if any
            uint hlqtBalanceAfter = hlqtToken.balanceOf(address(this));
            uint claimedHLQT = hlqtBalanceAfter.sub(hlqtBalanceBefore);
            if (claimedHLQT > 0) {
                hlqtStaking.stake(claimedHLQT);
            }
        }

    }

    function _getNetHCHFAmount(uint _collateral) internal returns (uint) {
        uint price = priceFeed.fetchPrice();
        uint ICR = troveManager.getCurrentICR(address(this), price);

        uint HCHFAmount = _collateral.mul(price).div(ICR);
        uint borrowingRate = troveManager.getBorrowingRateWithDecay();
        uint netDebt = HCHFAmount.mul(LiquityMath.DECIMAL_PRECISION).div(LiquityMath.DECIMAL_PRECISION.add(borrowingRate));

        return netDebt;
    }

    function _requireUserHasTrove(address _depositor) internal view {
        require(troveManager.getTroveStatus(_depositor) == 1, "BorrowerWrappersScript: caller must have an active trove");
    }
}
