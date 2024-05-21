import React from "react";
import { Button, Flex } from "theme-ui";

import {
  Decimal,
  Decimalish,
  LiquityStoreState,
  LPTStake,
  LPTStakeChange
} from "@liquity/lib-base";

import { LiquityStoreUpdate, useLiquityReducer, useLiquitySelector } from "@liquity/lib-react";

import { GT, COIN, COLLATERAL_COIN } from "../../strings";

import { useStakingView } from "./context/StakingViewContext";
import { StakingEditor } from "./StakingEditor";
import { StakingManagerAction } from "./StakingManagerAction";
import { ActionDescription, Amount } from "../ActionDescription";
import { ErrorDescription } from "../ErrorDescription";
import { useLiquity } from "../../hooks/LiquityContext";
import { useHedera } from "../../hedera/hedera_context";
import { useLoadingState } from "../../loading_state";
import { BigNumber } from "ethers";
import { Step } from "../Steps";
import { LoadingButton } from "../LoadingButton";
import { useDeployment } from "../../configuration/deployments";

const init = ({ liquidityMiningStake }: LiquityStoreState) => ({
  originalStake: lptStake,
  editedLQTY: liquidityMiningStake.stakedLPT
});

type StakeManagerState = ReturnType<typeof init>;
type StakeManagerAction =
  | LiquityStoreUpdate
  | { type: "revert" }
  | { type: "setStake"; newValue: Decimalish };

const reduce = (state: StakeManagerState, action: StakeManagerAction): StakeManagerState => {
  // console.log(state);
  // console.log(action);

  const { originalStake, editedLQTY } = state;

  switch (action.type) {
    case "setStake":
      return { ...state, editedLQTY: Decimal.from(action.newValue) };

    case "revert":
      return { ...state, editedLQTY: originalStake.stakedLPT };

    case "updateStore": {
      const {
        stateChange: { lptStake: updatedStake }
      } = action;

      if (updatedStake) {
        return {
          originalStake: updatedStake,
          editedLQTY: updatedStake.apply(originalStake.whatChanged(editedLQTY))
        };
      }
    }
  }

  return state;
};

const selectLPTBalance = ({ uniTokenBalance }: LiquityStoreState) => uniTokenBalance;

type StakingManagerActionDescriptionProps = {
  originalStake: LPTStake;
  change: LPTStakeChange<Decimal>;
};

const StakingManagerActionDescription: React.FC<StakingManagerActionDescriptionProps> = ({
  originalStake,
  change
}) => {
  const stakeLPT = change.stakeLPT?.prettify().concat(" ", GT);
  const unstakeLPT = change.unstakeLPT?.prettify().concat(" ", GT);
  const collateralGain = originalStake.collateralGain.nonZero
    ?.prettify(4)
    .concat(` ${COLLATERAL_COIN}`);
  const hchfGain = originalStake.hchfGain.nonZero?.prettify().concat(" ", COIN);

  if (originalStake.isEmpty && stakeLPT) {
    return (
      <ActionDescription>
        You are staking <Amount>{stakeLPT}</Amount>.
      </ActionDescription>
    );
  }

  return (
    <ActionDescription>
      {stakeLPT && (
        <>
          You are adding <Amount>{stakeLPT}</Amount> to your stake
        </>
      )}
      {unstakeLPT && (
        <>
          You are withdrawing <Amount>{unstakeLPT}</Amount> to your wallet
        </>
      )}
      {(collateralGain || hchfGain) && (
        <>
          {" "}
          and claiming{" "}
          {collateralGain && hchfGain ? (
            <>
              <Amount>{collateralGain}</Amount> and <Amount>{hchfGain}</Amount>
            </>
          ) : (
            <>
              <Amount>{collateralGain ?? hchfGain}</Amount>
            </>
          )}
        </>
      )}
      .
    </ActionDescription>
  );
};

export const StakingManager: React.FC = () => {
  const { dispatch: dispatchStakingViewAction, changePending } = useStakingView();
  const [{ originalStake, editedLQTY }, dispatch] = useLiquityReducer(reduce, init);
  const LPTBalance = useLiquitySelector(selectLPTBalance);

  const change = originalStake.whatChanged(editedLQTY);
  console.log(change, 'change')
  const [validChange, description] = !change
    ? [undefined, undefined]
    : change.stakeLPT?.gt(LPTBalance)
    ? [
        undefined,
        <ErrorDescription>
          The amount you're trying to stake exceeds your balance by{" "}
          <Amount>
            {change.stakeLPT.sub(LPTBalance).prettify()} {GT}
          </Amount>
          .
        </ErrorDescription>
      ]
    : [change, <StakingManagerActionDescription originalStake={originalStake} change={change} />];

  const makingNewStake = originalStake.isEmpty;

  // consent & approval
  const {
    liquity: {
      connection: { addresses }
    }
  } = useLiquity();
  console.log('addresses', addresses);
  const deployment = useDeployment();
  const { hasAssociatedWithHchf, associateWithToken, approveSpender } = useHedera();
  // hlqt token association
  const { call: associateWithHchf, state: hchfAssociationLoadingState } = useLoadingState(
    async () => {
      if (!deployment) {
        const errorMessage = `i cannot get the hchf token id if there is no deployment. please connect to a chain first.`;
        console.error(errorMessage, "context:", { deployment });
        throw new Error(errorMessage);
      }

      await associateWithToken({ tokenAddress: deployment.hchfTokenAddress });
    }
  );
  // hchf spender approval
  const needsSpenderApproval = !validChange || validChange?.stakeLPT;
  const { call: approveHlqtSpender, state: hlqtApprovalLoadingState } = useLoadingState(async () => {
    if (!validChange?.stakeLPT) {
      throw "cannot approve a withdrawal (negative spending/negative deposit) or deposit of 0";
    }

    if (!deployment) {
      const errorMessage = `i cannot get the hlqt token id if there is no deployment. please connect to a chain first.`;
      console.error(errorMessage, "context:", { deployment });
      throw new Error(errorMessage);
    }

    const contractAddress = addresses.unipool as `0x${string}`; // TODO change to SaucerSwapPool when ready
    const tokenAddress = deployment.hlqtTokenAddress;
    const amount = BigNumber.from(validChange.stakeLPT.bigNumber);

    await approveSpender({
      contractAddress,
      tokenAddress,
      amount
    });
  });

  const transactionSteps: Step[] = [
    {
      title: "Associate with HCHF",
      status: hasAssociatedWithHchf
        ? "success"
        : hchfAssociationLoadingState === "error"
        ? "danger"
        : hchfAssociationLoadingState,
      description: hasAssociatedWithHchf
        ? "You've already consented to receiving HCHF."
        : "You have to consent to receiving HCHF tokens before you can use HLiquity."
    }
  ];
  if (needsSpenderApproval) {
    transactionSteps.push({
      title: "Approve HLQT spender",
      status: hlqtApprovalLoadingState === "error" ? "danger" : hlqtApprovalLoadingState,
      description: "You have to consent to the HLQT contract spending your HLQT tokens."
    });
  }
  transactionSteps.push({
    title: !validChange || validChange?.stakeLPT ? "Stake HLQT" : "Unstake HLQT",
    status: changePending ? "pending" : "idle"
  });

  return (
    <StakingEditor
      title={"SaucerSwap LP Staking"}
      {...{ originalStake, editedLQTY, dispatch }}
      transactionSteps={transactionSteps}
    >
      {description ??
        (makingNewStake ? (
          <ActionDescription>Enter the amount of {GT} you'd like to stake.</ActionDescription>
        ) : (
          <ActionDescription>Adjust the {GT} amount to stake or withdraw.</ActionDescription>
        ))}

      <Flex variant="layout.actions">
        <Button
          variant="cancel"
          onClick={() => dispatchStakingViewAction({ type: "cancelAdjusting" })}
        >
          Cancel
        </Button>

        {!hasAssociatedWithHchf ? (
          <LoadingButton
            disabled={!validChange}
            loading={hchfAssociationLoadingState === "pending"}
            onClick={associateWithHchf}
          >
            Consent to receiving HCHF
          </LoadingButton>
        ) : needsSpenderApproval && hlqtApprovalLoadingState !== "success" ? (
          <LoadingButton
            disabled={!validChange}
            loading={hlqtApprovalLoadingState === "pending"}
            onClick={approveHlqtSpender}
          >
            Consent to spending {validChange?.stakeHLQT?.toString(2)} HLQT
          </LoadingButton>
        ) : validChange ? (
          <StakingManagerAction change={validChange} loading={changePending}>
            {validChange?.stakeHLQT
              ? `Stake ${validChange?.stakeHLQT?.toString(2)} HLQT`
              : `Unstake ${validChange?.unstakeHLQT?.toString(2)} HLQT`}
          </StakingManagerAction>
        ) : (
          <Button disabled>Confirm</Button>
        )}
      </Flex>
    </StakingEditor>
  );
};
