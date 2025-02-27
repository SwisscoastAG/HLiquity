<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@liquity/lib-ethers](./lib-ethers.md) &gt; [PopulatableEthersLiquity](./lib-ethers.populatableethersliquity.md) &gt; [stakeHLQT](./lib-ethers.populatableethersliquity.stakehlqt.md)

## PopulatableEthersLiquity.stakeHLQT() method

Stake HLQT to start earning fee revenue or increase existing stake.

<b>Signature:</b>

```typescript
stakeHLQT(amount: Decimalish, overrides?: EthersTransactionOverrides): Promise<PopulatedEthersLiquityTransaction<void>>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  amount | [Decimalish](./lib-base.decimalish.md) | Amount of HLQT to add to new or existing stake. |
|  overrides | [EthersTransactionOverrides](./lib-ethers.etherstransactionoverrides.md) |  |

<b>Returns:</b>

Promise&lt;[PopulatedEthersLiquityTransaction](./lib-ethers.populatedethersliquitytransaction.md)<!-- -->&lt;void&gt;&gt;

## Remarks

As a side-effect, the transaction will also pay out an existing HLQT stake's [collateral gain](./lib-base.hlqtstake.collateralgain.md) and [HCHF gain](./lib-base.hlqtstake.hchfgain.md)<!-- -->.

