import { Decimal, Decimalish } from "./Decimal";

/**
 * Represents the change between two states of an HLQTY Stake.
 *
 * @public
 */
export type HLQTYStakeChange<T> =
  | { stakeHLQTY: T; unstakeHLQTY?: undefined }
  | { stakeHLQTY?: undefined; unstakeHLQTY: T; unstakeAllHLQTY: boolean };

/** 
 * Represents a user's HLQTY stake and accrued gains.
 * 
 * @remarks
 * Returned by the {@link ReadableLiquity.getHLQTYStake | getHLQTYStake()} function.

 * @public
 */
export class HLQTYStake {
  /** The amount of HLQTY that's staked. */
  readonly stakedHLQTY: Decimal;

  /** Collateral gain available to withdraw. */
  readonly collateralGain: Decimal;

  /** HCHF gain available to withdraw. */
  readonly hchfGain: Decimal;

  /** @internal */
  constructor(stakedHLQTY = Decimal.ZERO, collateralGain = Decimal.ZERO, hchfGain = Decimal.ZERO) {
    this.stakedHLQTY = stakedHLQTY;
    this.collateralGain = collateralGain;
    this.hchfGain = hchfGain;
  }

  get isEmpty(): boolean {
    return this.stakedHLQTY.isZero && this.collateralGain.isZero && this.hchfGain.isZero;
  }

  /** @internal */
  toString(): string {
    return (
      `{ stakedHLQTY: ${this.stakedHLQTY}` +
      `, collateralGain: ${this.collateralGain}` +
      `, hchfGain: ${this.hchfGain} }`
    );
  }

  /**
   * Compare to another instance of `HLQTYStake`.
   */
  equals(that: HLQTYStake): boolean {
    return (
      this.stakedHLQTY.eq(that.stakedHLQTY) &&
      this.collateralGain.eq(that.collateralGain) &&
      this.hchfGain.eq(that.hchfGain)
    );
  }

  /**
   * Calculate the difference between this `HLQTYStake` and `thatStakedHLQTY`.
   *
   * @returns An object representing the change, or `undefined` if the staked amounts are equal.
   */
  whatChanged(thatStakedHLQTY: Decimalish): HLQTYStakeChange<Decimal> | undefined {
    thatStakedHLQTY = Decimal.from(thatStakedHLQTY);

    if (thatStakedHLQTY.lt(this.stakedHLQTY)) {
      return {
        unstakeHLQTY: this.stakedHLQTY.sub(thatStakedHLQTY),
        unstakeAllHLQTY: thatStakedHLQTY.isZero
      };
    }

    if (thatStakedHLQTY.gt(this.stakedHLQTY)) {
      return { stakeHLQTY: thatStakedHLQTY.sub(this.stakedHLQTY) };
    }
  }

  /**
   * Apply a {@link HLQTYStakeChange} to this `HLQTYStake`.
   *
   * @returns The new staked HLQTY amount.
   */
  apply(change: HLQTYStakeChange<Decimalish> | undefined): Decimal {
    if (!change) {
      return this.stakedHLQTY;
    }

    if (change.unstakeHLQTY !== undefined) {
      return change.unstakeAllHLQTY || this.stakedHLQTY.lte(change.unstakeHLQTY)
        ? Decimal.ZERO
        : this.stakedHLQTY.sub(change.unstakeHLQTY);
    } else {
      return this.stakedHLQTY.add(change.stakeHLQTY);
    }
  }
}
