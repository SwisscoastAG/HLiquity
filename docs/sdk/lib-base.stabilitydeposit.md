<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@liquity/lib-base](./lib-base.md) &gt; [StabilityDeposit](./lib-base.stabilitydeposit.md)

## StabilityDeposit class

A Stability Deposit and its accrued gains.

<b>Signature:</b>

```typescript
export declare class StabilityDeposit 
```

## Remarks

The constructor for this class is marked as internal. Third-party code should not call the constructor directly or create subclasses that extend the `StabilityDeposit` class.

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [collateralGain](./lib-base.stabilitydeposit.collateralgain.md) |  | [Decimal](./lib-base.decimal.md) | Amount of native currency (e.g. Ether) received in exchange for the used-up HCHF. |
|  [currentHCHF](./lib-base.stabilitydeposit.currenthchf.md) |  | [Decimal](./lib-base.decimal.md) | Amount of HCHF left in the Stability Deposit. |
|  [frontendTag](./lib-base.stabilitydeposit.frontendtag.md) |  | string | Address of frontend through which this Stability Deposit was made. |
|  [hlqtReward](./lib-base.stabilitydeposit.hlqtreward.md) |  | [Decimal](./lib-base.decimal.md) | Amount of HLQT rewarded since the last modification of the Stability Deposit. |
|  [initialHCHF](./lib-base.stabilitydeposit.initialhchf.md) |  | [Decimal](./lib-base.decimal.md) | Amount of HCHF in the Stability Deposit at the time of the last direct modification. |
|  [isEmpty](./lib-base.stabilitydeposit.isempty.md) |  | boolean |  |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [apply(change)](./lib-base.stabilitydeposit.apply.md) |  | Apply a [StabilityDepositChange](./lib-base.stabilitydepositchange.md) to this Stability Deposit. |
|  [equals(that)](./lib-base.stabilitydeposit.equals.md) |  | Compare to another instance of <code>StabilityDeposit</code>. |
|  [whatChanged(thatHCHF)](./lib-base.stabilitydeposit.whatchanged.md) |  | Calculate the difference between the <code>currentHCHF</code> in this Stability Deposit and <code>thatHCHF</code>. |

