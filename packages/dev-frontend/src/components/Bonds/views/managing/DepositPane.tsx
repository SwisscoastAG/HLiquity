import { Decimal } from "@liquity/lib-base";
import React, { useEffect, useState } from "react";
import { Flex, Button, Spinner, Checkbox, Label, Card, Text } from "theme-ui";
import { Amount } from "../../../ActionDescription";
import { ErrorDescription } from "../../../ErrorDescription";
import { Icon } from "../../../Icon";
import { InfoIcon } from "../../../InfoIcon";
import { DisabledEditableRow, EditableRow } from "../../../Trove/Editor";
import { useBondView } from "../../context/BondViewContext";
import { BLusdAmmTokenIndex } from "../../context/transitions";
import { PoolDetails } from "./PoolDetails";
import type { Address, ApprovePressedPayload } from "../../context/transitions";

export const DepositPane: React.FC = () => {
  const {
    dispatchEvent,
    statuses,
    hchfBalance,
    bLusdBalance,
    isBLusdApprovedWithAmmZapper,
    isLusdApprovedWithAmmZapper,
    getExpectedLpTokens,
    addresses,
    bLusdAmmBLusdBalance,
    bLusdAmmLusdBalance
  } = useBondView();

  const editingState = useState<string>();
  const [bLusdAmount, setBLusdAmount] = useState<Decimal>(Decimal.ZERO);
  const [lusdAmount, setLusdAmount] = useState<Decimal>(Decimal.ZERO);
  const [lpTokens, setLpTokens] = useState<Decimal>(Decimal.ZERO);
  const [shouldStakeInGauge, setShouldStakeInGauge] = useState(true);
  const [shouldDepositBalanced, setShouldDepositBalanced] = useState(true);

  const coalescedBLusdBalance = bLusdBalance ?? Decimal.ZERO;
  const coalescedLusdBalance = hchfBalance ?? Decimal.ZERO;

  const isApprovePending = statuses.APPROVE_SPENDER === "PENDING";
  const isManageLiquidityPending = statuses.MANAGE_LIQUIDITY === "PENDING";
  const isBLusdBalanceInsufficient = bLusdAmount.gt(coalescedBLusdBalance);
  const isLusdBalanceInsufficient = lusdAmount.gt(coalescedLusdBalance);
  const isAnyBalanceInsufficient = isBLusdBalanceInsufficient || isLusdBalanceInsufficient;

  const isDepositingLusd = lusdAmount.gt(0);
  const isDepositingBLusd = bLusdAmount.gt(0);

  const zapperNeedsLusdApproval = isDepositingLusd && !isLusdApprovedWithAmmZapper;
  const zapperNeedsBLusdApproval = isDepositingBLusd && !isBLusdApprovedWithAmmZapper;
  const isApprovalNeeded = zapperNeedsLusdApproval || zapperNeedsBLusdApproval;

  const poolBalanceRatio =
    bLusdAmmBLusdBalance && bLusdAmmLusdBalance
      ? bLusdAmmLusdBalance.div(bLusdAmmBLusdBalance)
      : Decimal.ONE;

  const handleApprovePressed = () => {
    const tokensNeedingApproval = new Map<BLusdAmmTokenIndex, Address>();
    if (zapperNeedsLusdApproval) {
      tokensNeedingApproval.set(BLusdAmmTokenIndex.HCHF, addresses.BLUSD_LP_ZAP_ADDRESS);
    }
    if (zapperNeedsBLusdApproval) {
      tokensNeedingApproval.set(BLusdAmmTokenIndex.BLUSD, addresses.BLUSD_LP_ZAP_ADDRESS);
    }

    dispatchEvent("APPROVE_PRESSED", { tokensNeedingApproval } as ApprovePressedPayload);
  };

  const handleConfirmPressed = () => {
    dispatchEvent("CONFIRM_PRESSED", {
      action: "addLiquidity",
      bLusdAmount,
      lusdAmount,
      minLpTokens: lpTokens,
      shouldStakeInGauge
    });
  };

  const handleBackPressed = () => {
    dispatchEvent("BACK_PRESSED");
  };

  const handleToggleShouldStakeInGauge = () => {
    setShouldStakeInGauge(toggle => !toggle);
  };

  const handleToggleShouldDepositBalanced = () => {
    if (!shouldDepositBalanced) {
      setBLusdAmount(Decimal.ZERO);
      setLusdAmount(Decimal.ZERO);
    }
    setShouldDepositBalanced(toggle => !toggle);
  };

  const handleSetAmount = (token: "bHCHF" | "HCHF", amount: Decimal) => {
    if (shouldDepositBalanced) {
      if (token === "bHCHF") setLusdAmount(poolBalanceRatio.mul(amount));
      else if (token === "HCHF") setBLusdAmount(amount.div(poolBalanceRatio));
    }

    if (token === "bHCHF") setBLusdAmount(amount);
    else if (token === "HCHF") setLusdAmount(amount);
  };

  useEffect(() => {
    if (bLusdAmount.isZero && lusdAmount.isZero) {
      setLpTokens(Decimal.ZERO);
      return;
    }

    let cancelled = false;

    const timeoutId = setTimeout(async () => {
      try {
        const expectedLpTokens = await getExpectedLpTokens(bLusdAmount, lusdAmount);
        if (cancelled) return;
        setLpTokens(expectedLpTokens);
      } catch (error) {
        console.error("getExpectedLpTokens() failed");
        console.log(error);
      }
    }, 200);

    return () => {
      clearTimeout(timeoutId);
      cancelled = true;
    };
  }, [bLusdAmount, lusdAmount, getExpectedLpTokens]);

  return (
    <>
      <EditableRow
        label="bHCHF amount"
        inputId="deposit-blusd"
        amount={bLusdAmount.prettify(2)}
        unit="bHCHF"
        editingState={editingState}
        editedAmount={bLusdAmount.toString()}
        setEditedAmount={amount => handleSetAmount("bHCHF", Decimal.from(amount))}
        maxAmount={coalescedBLusdBalance.toString()}
        maxedOut={bLusdAmount.eq(coalescedBLusdBalance)}
      />

      <EditableRow
        label="HCHF amount"
        inputId="deposit-hchf"
        amount={lusdAmount.prettify(2)}
        unit="HCHF"
        editingState={editingState}
        editedAmount={lusdAmount.toString()}
        setEditedAmount={amount => handleSetAmount("HCHF", Decimal.from(amount))}
        maxAmount={coalescedLusdBalance.toString()}
        maxedOut={lusdAmount.eq(coalescedLusdBalance)}
      />

      <Flex sx={{ justifyContent: "center", mb: 3 }}>
        <Icon name="arrow-down" size="lg" />
      </Flex>

      <DisabledEditableRow
        label="Mint LP tokens"
        inputId="deposit-mint-lp-tokens"
        amount={lpTokens.prettify(2)}
      />

      <Label>
        <Flex sx={{ alignItems: "center" }}>
          <Checkbox checked={shouldDepositBalanced} onChange={handleToggleShouldDepositBalanced} />
          <Text sx={{ fontWeight: 300, fontSize: "16px" }}>Deposit tokens in a balanced ratio</Text>
          <InfoIcon
            placement="right"
            size="xs"
            tooltip={
              <Card variant="tooltip">
                Tick this box to deposit bHCHF and HCHF-3CRV in the pool's current liquidity ratio.
                Current ratio = 1 bHCHF : {poolBalanceRatio.prettify(2)} HCHF.
              </Card>
            }
          />
        </Flex>
      </Label>

      <Label mb={2}>
        <Flex sx={{ alignItems: "center" }}>
          <Checkbox checked={shouldStakeInGauge} onChange={handleToggleShouldStakeInGauge} />
          <Text sx={{ fontWeight: 300, fontSize: "16px" }}>Stake LP tokens in Curve gauge</Text>
          <InfoIcon
            placement="right"
            size="xs"
            tooltip={
              <Card variant="tooltip">
                Tick this box to have your Curve LP tokens staked in the bHCHF Curve gauge. Staked LP
                tokens will earn protocol fees and Curve rewards.
              </Card>
            }
          />
        </Flex>
      </Label>

      <PoolDetails />

      {isAnyBalanceInsufficient && (
        <ErrorDescription>
          Deposit exceeds your balance by{" "}
          {isBLusdBalanceInsufficient && (
            <>
              <Amount>{bLusdAmount.sub(coalescedBLusdBalance).prettify(2)} bHCHF</Amount>
              {isLusdBalanceInsufficient && <> and </>}
            </>
          )}
          {isLusdBalanceInsufficient && (
            <Amount>{lusdAmount.sub(coalescedLusdBalance).prettify(2)} HCHF</Amount>
          )}
        </ErrorDescription>
      )}

      <Flex variant="layout.actions">
        <Button
          variant="cancel"
          onClick={handleBackPressed}
          disabled={isApprovePending || isManageLiquidityPending}
        >
          Back
        </Button>

        {!isApprovalNeeded ? (
          <Button
            variant="primary"
            onClick={handleConfirmPressed}
            disabled={
              (bLusdAmount.isZero && lusdAmount.isZero) ||
              isAnyBalanceInsufficient ||
              isManageLiquidityPending
            }
          >
            {isManageLiquidityPending ? (
              <Spinner size="28px" sx={{ color: "white" }} />
            ) : (
              <>Confirm</>
            )}
          </Button>
        ) : (
          <Button variant="primary" onClick={handleApprovePressed} disabled={isApprovePending}>
            {isApprovePending ? <Spinner size="28px" sx={{ color: "white" }} /> : <>Approve</>}
          </Button>
        )}
      </Flex>
    </>
  );
};
