<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@liquity/lib-base](./lib-base.md) &gt; [HLQTStake](./lib-base.hlqtstake.md)

## HLQTStake class

Represents a user's HLQT stake and accrued gains.

<b>Signature:</b>

```typescript
export declare class HLQTStake 
```

## Remarks

Returned by the [getHLQTStake()](./lib-base.readableliquity.gethlqtstake.md) function.

The constructor for this class is marked as internal. Third-party code should not call the constructor directly or create subclasses that extend the `HLQTStake` class.

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [collateralGain](./lib-base.hlqtstake.collateralgain.md) |  | [Decimal](./lib-base.decimal.md) | Collateral gain available to withdraw. |
|  [hchfGain](./lib-base.hlqtstake.hchfgain.md) |  | [Decimal](./lib-base.decimal.md) | HCHF gain available to withdraw. |
|  [isEmpty](./lib-base.hlqtstake.isempty.md) |  | boolean |  |
|  [stakedHLQT](./lib-base.hlqtstake.stakedhlqt.md) |  | [Decimal](./lib-base.decimal.md) | The amount of HLQT that's staked. |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [apply(change)](./lib-base.hlqtstake.apply.md) |  | Apply a [HLQTStakeChange](./lib-base.hlqtstakechange.md) to this <code>HLQTStake</code>. |
|  [equals(that)](./lib-base.hlqtstake.equals.md) |  | Compare to another instance of <code>HLQTStake</code>. |
|  [whatChanged(thatStakedHLQT)](./lib-base.hlqtstake.whatchanged.md) |  | Calculate the difference between this <code>HLQTStake</code> and <code>thatStakedHLQT</code>. |

