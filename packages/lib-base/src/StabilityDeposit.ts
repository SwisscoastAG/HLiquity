import { Decimal, Decimalish } from "./Decimal";

/**
 * Represents the change between two Stability Deposit states.
 *
 * @public
 */
export type StabilityDepositChange<T> =
  | { depositDCHF: T; withdrawDCHF?: undefined }
  | { depositDCHF?: undefined; withdrawDCHF: T; withdrawAllDCHF: boolean };

/**
 * A Stability Deposit and its accrued gains.
 *
 * @public
 */
export class StabilityDeposit {
  /** Amount of DCHF in the Stability Deposit at the time of the last direct modification. */
  readonly initialDCHF: Decimal;

  /** Amount of DCHF left in the Stability Deposit. */
  readonly currentDCHF: Decimal;

  /** Amount of native currency (e.g. Ether) received in exchange for the used-up DCHF. */
  readonly collateralGain: Decimal;

  /** Amount of HLQTY rewarded since the last modification of the Stability Deposit. */
  readonly hlqtyReward: Decimal;

  /**
   * Address of frontend through which this Stability Deposit was made.
   *
   * @remarks
   * If the Stability Deposit was made through a frontend that doesn't tag deposits, this will be
   * the zero-address.
   */
  readonly frontendTag: string;

  /** @internal */
  constructor(
    initialDCHF: Decimal,
    currentDCHF: Decimal,
    collateralGain: Decimal,
    hlqtyReward: Decimal,
    frontendTag: string
  ) {
    this.initialDCHF = initialDCHF;
    this.currentDCHF = currentDCHF;
    this.collateralGain = collateralGain;
    this.hlqtyReward = hlqtyReward;
    this.frontendTag = frontendTag;

    if (this.currentDCHF.gt(this.initialDCHF)) {
      throw new Error("currentDCHF can't be greater than initialDCHF");
    }
  }

  get isEmpty(): boolean {
    return (
      this.initialDCHF.isZero &&
      this.currentDCHF.isZero &&
      this.collateralGain.isZero &&
      this.hlqtyReward.isZero
    );
  }

  /** @internal */
  toString(): string {
    return (
      `{ initialDCHF: ${this.initialDCHF}` +
      `, currentDCHF: ${this.currentDCHF}` +
      `, collateralGain: ${this.collateralGain}` +
      `, hlqtyReward: ${this.hlqtyReward}` +
      `, frontendTag: "${this.frontendTag}" }`
    );
  }

  /**
   * Compare to another instance of `StabilityDeposit`.
   */
  equals(that: StabilityDeposit): boolean {
    return (
      this.initialDCHF.eq(that.initialDCHF) &&
      this.currentDCHF.eq(that.currentDCHF) &&
      this.collateralGain.eq(that.collateralGain) &&
      this.hlqtyReward.eq(that.hlqtyReward) &&
      this.frontendTag === that.frontendTag
    );
  }

  /**
   * Calculate the difference between the `currentDCHF` in this Stability Deposit and `thatDCHF`.
   *
   * @returns An object representing the change, or `undefined` if the deposited amounts are equal.
   */
  whatChanged(thatDCHF: Decimalish): StabilityDepositChange<Decimal> | undefined {
    thatDCHF = Decimal.from(thatDCHF);

    if (thatDCHF.lt(this.currentDCHF)) {
      return { withdrawDCHF: this.currentDCHF.sub(thatDCHF), withdrawAllDCHF: thatDCHF.isZero };
    }

    if (thatDCHF.gt(this.currentDCHF)) {
      return { depositDCHF: thatDCHF.sub(this.currentDCHF) };
    }
  }

  /**
   * Apply a {@link StabilityDepositChange} to this Stability Deposit.
   *
   * @returns The new deposited DCHF amount.
   */
  apply(change: StabilityDepositChange<Decimalish> | undefined): Decimal {
    if (!change) {
      return this.currentDCHF;
    }

    if (change.withdrawDCHF !== undefined) {
      return change.withdrawAllDCHF || this.currentDCHF.lte(change.withdrawDCHF)
        ? Decimal.ZERO
        : this.currentDCHF.sub(change.withdrawDCHF);
    } else {
      return this.currentDCHF.add(change.depositDCHF);
    }
  }
}
