<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@liquity/lib-ethers](./lib-ethers.md) &gt; [EthersLiquity](./lib-ethers.ethersliquity.md) &gt; [depositHCHFInStabilityPool](./lib-ethers.ethersliquity.deposithchfinstabilitypool.md)

## EthersLiquity.depositHCHFInStabilityPool() method

Make a new Stability Deposit, or top up existing one.

<b>Signature:</b>

```typescript
depositHCHFInStabilityPool(amount: Decimalish, frontendTag?: string, overrides?: EthersTransactionOverrides): Promise<StabilityDepositChangeDetails>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  amount | [Decimalish](./lib-base.decimalish.md) | Amount of HCHF to add to new or existing deposit. |
|  frontendTag | string | Address that should receive a share of this deposit's HLQTY rewards. |
|  overrides | [EthersTransactionOverrides](./lib-ethers.etherstransactionoverrides.md) |  |

<b>Returns:</b>

Promise&lt;[StabilityDepositChangeDetails](./lib-base.stabilitydepositchangedetails.md)<!-- -->&gt;

## Exceptions

Throws [EthersTransactionFailedError](./lib-ethers.etherstransactionfailederror.md) in case of transaction failure.

## Remarks

The `frontendTag` parameter is only effective when making a new deposit.

As a side-effect, the transaction will also pay out an existing Stability Deposit's [collateral gain](./lib-base.stabilitydeposit.collateralgain.md) and [HLQTY reward](./lib-base.stabilitydeposit.hlqtyreward.md)<!-- -->.
