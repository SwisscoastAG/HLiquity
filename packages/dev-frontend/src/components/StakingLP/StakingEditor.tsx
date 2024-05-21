import React, { useState } from "react";
import { Heading, Box, Card, Button } from "theme-ui";

import { Decimal, Decimalish, Difference, LiquityStoreState, HLQTStake } from "@liquity/lib-base";
import { useLiquitySelector } from "@liquity/lib-react";

import { COIN, COLLATERAL_COIN, GT } from "../../strings";

import { Icon } from "../Icon";
import { EditableRow, StaticRow } from "../Trove/Editor";

import { useStakingView } from "./context/StakingViewContext";
import { Step, Steps } from "../Steps";

const select = ({ uniTokenBalance, totalStakedUniTokens }: LiquityStoreState) => ({
  uniTokenBalance,
  totalStakedUniTokens
});

type StakingEditorProps = {
  title: string;
  originalStake: HLQTStake;
  editedLQTY: Decimal;
  dispatch: (action: { type: "setStake"; newValue: Decimalish } | { type: "revert" }) => void;
  transactionSteps: Step[];
};

export const StakingEditor: React.FC<StakingEditorProps> = ({
  children,
  title,
  originalStake,
  editedLQTY,
  transactionSteps,
  dispatch
}) => {
  const { uniTokenBalance, totalStakedUniTokens } = useLiquitySelector(select);
  const { changePending } = useStakingView();
  const editingState = useState<string>();

  const edited = !editedLQTY.eq(originalStake.stakedHLQT);

  const maxAmount = originalStake.stakedHLQT.add(uniTokenBalance);
  const maxedOut = editedLQTY.eq(maxAmount);

  const totalStakedLQTYAfterChange = totalStakedUniTokens.sub(originalStake.stakedHLQT).add(editedLQTY);

  const originalPoolShare = originalStake.stakedHLQT.mulDiv(100, totalStakedUniTokens);
  const newPoolShare = editedLQTY.mulDiv(100, totalStakedLQTYAfterChange);
  const poolShareChange =
    originalStake.stakedHLQT.nonZero && Difference.between(newPoolShare, originalPoolShare).nonZero;

  return (
    <Card>
      <Heading
        sx={{
          display: "grid !important",
          gridAutoFlow: "column",
          gridTemplateColumns: "1fr repeat(2, auto)"
        }}
      >
        {title}
        <Steps steps={transactionSteps} />
        {edited && !changePending && (
          <Button
            variant="titleIcon"
            sx={{ ":enabled:hover": { color: "danger" }, marginLeft: "1rem" }}
            onClick={() => dispatch({ type: "revert" })}
          >
            <Icon name="history" size="lg" />
          </Button>
        )}
      </Heading>

      <Box sx={{ p: [2, 3] }}>
        <EditableRow
          label="Stake"
          inputId="stake-lqty"
          amount={editedLQTY.prettify()}
          maxAmount={maxAmount.toString()}
          maxedOut={maxedOut}
          unit={GT}
          {...{ editingState }}
          editedAmount={editedLQTY.toString(2)}
          setEditedAmount={newValue => dispatch({ type: "setStake", newValue })}
        />

        {newPoolShare.infinite ? (
          <StaticRow label="Pool share" inputId="stake-share" amount="N/A" />
        ) : (
          <StaticRow
            label="Pool share"
            inputId="stake-share"
            amount={newPoolShare.prettify(4)}
            pendingAmount={poolShareChange?.prettify(4).concat("%")}
            pendingColor={poolShareChange?.positive ? "success" : "danger"}
            unit="%"
          />
        )}

        {!originalStake.isEmpty && (
          <>
            <StaticRow
              label="Redemption gain"
              inputId="stake-gain-eth"
              amount={originalStake.collateralGain.prettify(4)}
              color={originalStake.collateralGain.nonZero && "success"}
              unit={COLLATERAL_COIN}
            />

            <StaticRow
              label="Issuance gain"
              inputId="stake-gain-lusd"
              amount={originalStake.hchfGain.prettify()}
              color={originalStake.hchfGain.nonZero && "success"}
              unit={COIN}
            />
          </>
        )}

        {children}
      </Box>
    </Card>
  );
};
