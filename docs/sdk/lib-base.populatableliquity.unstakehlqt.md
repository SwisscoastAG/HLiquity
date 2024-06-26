<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@liquity/lib-base](./lib-base.md) &gt; [PopulatableLiquity](./lib-base.populatableliquity.md) &gt; [unstakeHLQT](./lib-base.populatableliquity.unstakehlqt.md)

## PopulatableLiquity.unstakeHLQT() method

Withdraw HLQT from staking.

<b>Signature:</b>

```typescript
unstakeHLQT(amount: Decimalish): Promise<PopulatedLiquityTransaction<P, SentLiquityTransaction<S, LiquityReceipt<R, void>>>>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  amount | [Decimalish](./lib-base.decimalish.md) | Amount of HLQT to withdraw. |

<b>Returns:</b>

Promise&lt;[PopulatedLiquityTransaction](./lib-base.populatedliquitytransaction.md)<!-- -->&lt;P, [SentLiquityTransaction](./lib-base.sentliquitytransaction.md)<!-- -->&lt;S, [LiquityReceipt](./lib-base.liquityreceipt.md)<!-- -->&lt;R, void&gt;&gt;&gt;&gt;

## Remarks

As a side-effect, the transaction will also pay out the HLQT stake's [collateral gain](./lib-base.hlqtstake.collateralgain.md) and [HCHF gain](./lib-base.hlqtstake.hchfgain.md)<!-- -->.

