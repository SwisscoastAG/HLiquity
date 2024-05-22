import {
  CollateralGainTransferDetails,
  Decimalish,
  LiquidationDetails,
  RedemptionDetails,
  SendableLiquity,
  StabilityDepositChangeDetails,
  StabilityPoolGainsWithdrawalDetails,
  TroveAdjustmentDetails,
  TroveAdjustmentParams,
  TroveClosureDetails,
  TroveCreationDetails,
  TroveCreationParams,
  HLiquityStore
} from "@liquity/lib-base";

import {
  EthersTransactionOverrides,
  EthersTransactionReceipt,
  EthersTransactionResponse
} from "./types";

import {
  PopulatableEthersLiquity,
  PopulatedEthersLiquityTransaction,
  SentEthersLiquityTransaction
} from "./PopulatableEthersLiquity";

/**
 * Ethers-based implementation of {@link @liquity/lib-base#SendableLiquity}.
 *
 * @public
 */
export class SendableEthersLiquity
  implements SendableLiquity<EthersTransactionReceipt, EthersTransactionResponse> {
  private _populate: PopulatableEthersLiquity;
  private _store: HLiquityStore | undefined;

  constructor(populatable: PopulatableEthersLiquity, store?: HLiquityStore) {
    this._populate = populatable;
    this._store = store;
  }

  sendTransaction = async <T>(tx: PopulatedEthersLiquityTransaction<T>) => {
    console.log('send transaction');
    const response = await tx.send();
  
    if (this._store) {
      this._store.refresh();
    }
  
    return response;
  }

  /** {@inheritDoc @liquity/lib-base#SendableLiquity.openTrove} */
  openTrove(
    params: TroveCreationParams<Decimalish>,
    maxBorrowingRate?: Decimalish,
    overrides?: EthersTransactionOverrides
  ): Promise<SentEthersLiquityTransaction<TroveCreationDetails>> {
    return this._populate.openTrove(params, maxBorrowingRate, overrides).then(this.sendTransaction);
  }

  /** {@inheritDoc @liquity/lib-base#SendableLiquity.closeTrove} */
  closeTrove(
    overrides?: EthersTransactionOverrides
  ): Promise<SentEthersLiquityTransaction<TroveClosureDetails>> {
    return this._populate.closeTrove(overrides).then(this.sendTransaction);
  }

  /** {@inheritDoc @liquity/lib-base#SendableLiquity.adjustTrove} */
  adjustTrove(
    params: TroveAdjustmentParams<Decimalish>,
    maxBorrowingRate?: Decimalish,
    overrides?: EthersTransactionOverrides
  ): Promise<SentEthersLiquityTransaction<TroveAdjustmentDetails>> {
    return this._populate.adjustTrove(params, maxBorrowingRate, overrides).then(this.sendTransaction);
  }

  /** {@inheritDoc @liquity/lib-base#SendableLiquity.depositCollateral} */
  depositCollateral(
    amount: Decimalish,
    overrides?: EthersTransactionOverrides
  ): Promise<SentEthersLiquityTransaction<TroveAdjustmentDetails>> {
    return this._populate.depositCollateral(amount, overrides).then(this.sendTransaction);
  }

  /** {@inheritDoc @liquity/lib-base#SendableLiquity.withdrawCollateral} */
  withdrawCollateral(
    amount: Decimalish,
    overrides?: EthersTransactionOverrides
  ): Promise<SentEthersLiquityTransaction<TroveAdjustmentDetails>> {
    return this._populate.withdrawCollateral(amount, overrides).then(this.sendTransaction);
  }

  /** {@inheritDoc @liquity/lib-base#SendableLiquity.borrowHCHF} */
  borrowHCHF(
    amount: Decimalish,
    maxBorrowingRate?: Decimalish,
    overrides?: EthersTransactionOverrides
  ): Promise<SentEthersLiquityTransaction<TroveAdjustmentDetails>> {
    return this._populate.borrowHCHF(amount, maxBorrowingRate, overrides).then(this.sendTransaction);
  }

  /** {@inheritDoc @liquity/lib-base#SendableLiquity.repayHCHF} */
  repayHCHF(
    amount: Decimalish,
    overrides?: EthersTransactionOverrides
  ): Promise<SentEthersLiquityTransaction<TroveAdjustmentDetails>> {
    return this._populate.repayHCHF(amount, overrides).then(this.sendTransaction);
  }

  /** @internal */
  setPrice(
    price: Decimalish,
    overrides?: EthersTransactionOverrides
  ): Promise<SentEthersLiquityTransaction<void>> {
    return this._populate.setPrice(price, overrides).then(this.sendTransaction);
  }

  /** {@inheritDoc @liquity/lib-base#SendableLiquity.liquidate} */
  liquidate(
    address: string | string[],
    overrides?: EthersTransactionOverrides
  ): Promise<SentEthersLiquityTransaction<LiquidationDetails>> {
    return this._populate.liquidate(address, overrides).then(this.sendTransaction);
  }

  /** {@inheritDoc @liquity/lib-base#SendableLiquity.liquidateUpTo} */
  liquidateUpTo(
    maximumNumberOfTrovesToLiquidate: number,
    overrides?: EthersTransactionOverrides
  ): Promise<SentEthersLiquityTransaction<LiquidationDetails>> {
    return this._populate
      .liquidateUpTo(maximumNumberOfTrovesToLiquidate, overrides)
      .then(this.sendTransaction);
  }

  /** {@inheritDoc @liquity/lib-base#SendableLiquity.depositHCHFInStabilityPool} */
  depositHCHFInStabilityPool(
    amount: Decimalish,
    frontendTag?: string,
    overrides?: EthersTransactionOverrides
  ): Promise<SentEthersLiquityTransaction<StabilityDepositChangeDetails>> {
    return this._populate
      .depositHCHFInStabilityPool(amount, frontendTag, overrides)
      .then(this.sendTransaction);
  }

  /** {@inheritDoc @liquity/lib-base#SendableLiquity.withdrawHCHFFromStabilityPool} */
  withdrawHCHFFromStabilityPool(
    amount: Decimalish,
    overrides?: EthersTransactionOverrides
  ): Promise<SentEthersLiquityTransaction<StabilityDepositChangeDetails>> {
    return this._populate.withdrawHCHFFromStabilityPool(amount, overrides).then(this.sendTransaction);
  }

  /** {@inheritDoc @liquity/lib-base#SendableLiquity.withdrawGainsFromStabilityPool} */
  withdrawGainsFromStabilityPool(
    overrides?: EthersTransactionOverrides
  ): Promise<SentEthersLiquityTransaction<StabilityPoolGainsWithdrawalDetails>> {
    return this._populate.withdrawGainsFromStabilityPool(overrides).then(this.sendTransaction);
  }

  /** {@inheritDoc @liquity/lib-base#SendableLiquity.transferCollateralGainToTrove} */
  transferCollateralGainToTrove(
    overrides?: EthersTransactionOverrides
  ): Promise<SentEthersLiquityTransaction<CollateralGainTransferDetails>> {
    return this._populate.transferCollateralGainToTrove(overrides).then(this.sendTransaction);
  }

  /** {@inheritDoc @liquity/lib-base#SendableLiquity.redeemHCHF} */
  redeemHCHF(
    amount: Decimalish,
    maxRedemptionRate?: Decimalish,
    overrides?: EthersTransactionOverrides
  ): Promise<SentEthersLiquityTransaction<RedemptionDetails>> {
    return this._populate.redeemHCHF(amount, maxRedemptionRate, overrides).then(this.sendTransaction);
  }

  /** {@inheritDoc @liquity/lib-base#SendableLiquity.claimCollateralSurplus} */
  claimCollateralSurplus(
    overrides?: EthersTransactionOverrides
  ): Promise<SentEthersLiquityTransaction<void>> {
    return this._populate.claimCollateralSurplus(overrides).then(this.sendTransaction);
  }

  /** {@inheritDoc @liquity/lib-base#SendableLiquity.stakeHLQT} */
  stakeHLQT(
    amount: Decimalish,
    overrides?: EthersTransactionOverrides
  ): Promise<SentEthersLiquityTransaction<void>> {
    return this._populate.stakeHLQT(amount, overrides).then(this.sendTransaction);
  }

  /** {@inheritDoc @liquity/lib-base#SendableLiquity.unstakeHLQT} */
  unstakeHLQT(
    amount: Decimalish,
    overrides?: EthersTransactionOverrides
  ): Promise<SentEthersLiquityTransaction<void>> {
    return this._populate.unstakeHLQT(amount, overrides).then(this.sendTransaction);
  }

  /** {@inheritDoc @liquity/lib-base#SendableLiquity.withdrawGainsFromStaking} */
  withdrawGainsFromStaking(
    overrides?: EthersTransactionOverrides
  ): Promise<SentEthersLiquityTransaction<void>> {
    return this._populate.withdrawGainsFromStaking(overrides).then(this.sendTransaction);
  }

  /** {@inheritDoc @liquity/lib-base#SendableLiquity.registerFrontend} */
  registerFrontend(
    kickbackRate: Decimalish,
    overrides?: EthersTransactionOverrides
  ): Promise<SentEthersLiquityTransaction<void>> {
    return this._populate.registerFrontend(kickbackRate, overrides).then(this.sendTransaction);
  }

  /** @internal */
  _mintUniToken(
    amount: Decimalish,
    address?: string,
    overrides?: EthersTransactionOverrides
  ): Promise<SentEthersLiquityTransaction<void>> {
    return this._populate._mintUniToken(amount, address, overrides).then(this.sendTransaction);
  }

  /** {@inheritDoc @liquity/lib-base#SendableLiquity.approveUniTokens} */
  approveUniTokens(
    allowance?: Decimalish,
    overrides?: EthersTransactionOverrides
  ): Promise<SentEthersLiquityTransaction<void>> {
    console.log('stage 1', allowance)
    return this._populate.approveUniTokens(allowance, overrides).then(this.sendTransaction);
  }

  /** {@inheritDoc @liquity/lib-base#SendableLiquity.stakeUniTokens} */
  stakeUniTokens(
    amount: Decimalish,
    overrides?: EthersTransactionOverrides
  ): Promise<SentEthersLiquityTransaction<void>> {
    console.log('stakeUniTokens', amount, overrides);
    return this._populate.stakeUniTokens(amount, overrides).then(this.sendTransaction);
  }

  /** {@inheritDoc @liquity/lib-base#SendableLiquity.unstakeUniTokens} */
  unstakeUniTokens(
    amount: Decimalish,
    overrides?: EthersTransactionOverrides
  ): Promise<SentEthersLiquityTransaction<void>> {
    return this._populate.unstakeUniTokens(amount, overrides).then(this.sendTransaction);
  }

  /** {@inheritDoc @liquity/lib-base#SendableLiquity.withdrawHLQTRewardFromLiquidityMining} */
  withdrawHLQTRewardFromLiquidityMining(
    overrides?: EthersTransactionOverrides
  ): Promise<SentEthersLiquityTransaction<void>> {
    return this._populate.withdrawHLQTRewardFromLiquidityMining(overrides).then(this.sendTransaction);
  }

  /** {@inheritDoc @liquity/lib-base#SendableLiquity.exitLiquidityMining} */
  exitLiquidityMining(
    overrides?: EthersTransactionOverrides
  ): Promise<SentEthersLiquityTransaction<void>> {
    return this._populate.exitLiquidityMining(overrides).then(this.sendTransaction);
  }
}
