<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@liquity/lib-base](./lib-base.md) &gt; [PopulatableLiquity](./lib-base.populatableliquity.md) &gt; [openTrove](./lib-base.populatableliquity.opentrove.md)

## PopulatableLiquity.openTrove() method

Open a new Trove by depositing collateral and borrowing HCHF.

<b>Signature:</b>

```typescript
openTrove(params: TroveCreationParams<Decimalish>, maxBorrowingRate?: Decimalish): Promise<PopulatedLiquityTransaction<P, SentLiquityTransaction<S, LiquityReceipt<R, TroveCreationDetails>>>>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  params | [TroveCreationParams](./lib-base.trovecreationparams.md)<!-- -->&lt;[Decimalish](./lib-base.decimalish.md)<!-- -->&gt; | How much to deposit and borrow. |
|  maxBorrowingRate | [Decimalish](./lib-base.decimalish.md) | Maximum acceptable [borrowing rate](./lib-base.fees.borrowingrate.md)<!-- -->. |

<b>Returns:</b>

Promise&lt;[PopulatedLiquityTransaction](./lib-base.populatedliquitytransaction.md)<!-- -->&lt;P, [SentLiquityTransaction](./lib-base.sentliquitytransaction.md)<!-- -->&lt;S, [LiquityReceipt](./lib-base.liquityreceipt.md)<!-- -->&lt;R, [TroveCreationDetails](./lib-base.trovecreationdetails.md)<!-- -->&gt;&gt;&gt;&gt;

## Remarks

If `maxBorrowingRate` is omitted, the current borrowing rate plus 0.5% is used as maximum acceptable rate.

