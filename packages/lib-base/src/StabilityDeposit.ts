import { Decimal, Decimalish } from "./Decimal";

/**
 * Represents the change between two Stability Deposit states.
 *
 * @public
 */
export type StabilityDepositChange<T> =
  | { depositHCHF: T; withdrawHCHF?: undefined }
  | { depositHCHF?: undefined; withdrawHCHF: T; withdrawAllHCHF: boolean };

/**
 * A Stability Deposit and its accrued gains.
 *
 * @public
 */
export class StabilityDeposit {
  /** Amount of HCHF in the Stability Deposit at the time of the last direct modification. */
  readonly initialHCHF: Decimal;

  /** Amount of HCHF left in the Stability Deposit. */
  readonly currentHCHF: Decimal;

  /** Amount of native currency (e.g. Ether) received in exchange for the used-up HCHF. */
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
    initialHCHF: Decimal,
    currentHCHF: Decimal,
    collateralGain: Decimal,
    hlqtyReward: Decimal,
    frontendTag: string
  ) {
    this.initialHCHF = initialHCHF;
    this.currentHCHF = currentHCHF;
    this.collateralGain = collateralGain;
    this.hlqtyReward = hlqtyReward;
    this.frontendTag = frontendTag;

    if (this.currentHCHF.gt(this.initialHCHF)) {
      throw new Error("currentHCHF can't be greater than initialHCHF");
    }
  }

  get isEmpty(): boolean {
    return (
      this.initialHCHF.isZero &&
      this.currentHCHF.isZero &&
      this.collateralGain.isZero &&
      this.hlqtyReward.isZero
    );
  }

  /** @internal */
  toString(): string {
    return (
      `{ initialHCHF: ${this.initialHCHF}` +
      `, currentHCHF: ${this.currentHCHF}` +
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
      this.initialHCHF.eq(that.initialHCHF) &&
      this.currentHCHF.eq(that.currentHCHF) &&
      this.collateralGain.eq(that.collateralGain) &&
      this.hlqtyReward.eq(that.hlqtyReward) &&
      this.frontendTag === that.frontendTag
    );
  }

  /**
   * Calculate the difference between the `currentHCHF` in this Stability Deposit and `thatHCHF`.
   *
   * @returns An object representing the change, or `undefined` if the deposited amounts are equal.
   */
  whatChanged(thatHCHF: Decimalish): StabilityDepositChange<Decimal> | undefined {
    thatHCHF = Decimal.from(thatHCHF);

    if (thatHCHF.lt(this.currentHCHF)) {
      return { withdrawHCHF: this.currentHCHF.sub(thatHCHF), withdrawAllHCHF: thatHCHF.isZero };
    }

    if (thatHCHF.gt(this.currentHCHF)) {
      return { depositHCHF: thatHCHF.sub(this.currentHCHF) };
    }
  }

  /**
   * Apply a {@link StabilityDepositChange} to this Stability Deposit.
   *
   * @returns The new deposited HCHF amount.
   */
  apply(change: StabilityDepositChange<Decimalish> | undefined): Decimal {
    if (!change) {
      return this.currentHCHF;
    }

    if (change.withdrawHCHF !== undefined) {
      return change.withdrawAllHCHF || this.currentHCHF.lte(change.withdrawHCHF)
        ? Decimal.ZERO
        : this.currentHCHF.sub(change.withdrawHCHF);
    } else {
      return this.currentHCHF.add(change.depositHCHF);
    }
  }
}
