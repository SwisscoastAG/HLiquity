import { Decimal, Decimalish } from "./Decimal";

/**
 * Represents the change between two states of an HLQT Stake.
 *
 * @public
 */
export type HLQTStakeChange<T> =
  | { stakeHLQT: T; unstakeHLQT?: undefined }
  | { stakeHLQT?: undefined; unstakeHLQT: T; unstakeAllHLQT: boolean };

/** 
 * Represents a user's HLQT stake and accrued gains.
 * 
 * @remarks
 * Returned by the {@link ReadableLiquity.getHLQTStake | getHLQTStake()} function.

 * @public
 */
export class HLQTStake {
  /** The amount of HLQT that's staked. */
  readonly stakedHLQT: Decimal;

  /** Collateral gain available to withdraw. */
  readonly collateralGain: Decimal;

  /** HCHF gain available to withdraw. */
  readonly hchfGain: Decimal;

  /** @internal */
  constructor(stakedHLQT = Decimal.ZERO, collateralGain = Decimal.ZERO, hchfGain = Decimal.ZERO) {
    this.stakedHLQT = stakedHLQT;
    this.collateralGain = collateralGain;
    this.hchfGain = hchfGain;
  }

  get isEmpty(): boolean {
    return this.stakedHLQT.isZero && this.collateralGain.isZero && this.hchfGain.isZero;
  }

  /** @internal */
  toString(): string {
    return (
      `{ stakedHLQT: ${this.stakedHLQT}` +
      `, collateralGain: ${this.collateralGain}` +
      `, hchfGain: ${this.hchfGain} }`
    );
  }

  /**
   * Compare to another instance of `HLQTStake`.
   */
  equals(that: HLQTStake): boolean {
    return (
      this.stakedHLQT.eq(that.stakedHLQT) &&
      this.collateralGain.eq(that.collateralGain) &&
      this.hchfGain.eq(that.hchfGain)
    );
  }

  /**
   * Calculate the difference between this `HLQTStake` and `thatStakedHLQT`.
   *
   * @returns An object representing the change, or `undefined` if the staked amounts are equal.
   */
  whatChanged(thatStakedHLQT: Decimalish): HLQTStakeChange<Decimal> | undefined {
    thatStakedHLQT = Decimal.from(thatStakedHLQT);

    if (thatStakedHLQT.lt(this.stakedHLQT)) {
      return {
        unstakeHLQT: this.stakedHLQT.sub(thatStakedHLQT),
        unstakeAllHLQT: thatStakedHLQT.isZero
      };
    }

    if (thatStakedHLQT.gt(this.stakedHLQT)) {
      return { stakeHLQT: thatStakedHLQT.sub(this.stakedHLQT) };
    }
  }

  /**
   * Apply a {@link HLQTStakeChange} to this `HLQTStake`.
   *
   * @returns The new staked HLQT amount.
   */
  apply(change: HLQTStakeChange<Decimalish> | undefined): Decimal {
    if (!change) {
      return this.stakedHLQT;
    }

    if (change.unstakeHLQT !== undefined) {
      return change.unstakeAllHLQT || this.stakedHLQT.lte(change.unstakeHLQT)
        ? Decimal.ZERO
        : this.stakedHLQT.sub(change.unstakeHLQT);
    } else {
      return this.stakedHLQT.add(change.stakeHLQT);
    }
  }
}
