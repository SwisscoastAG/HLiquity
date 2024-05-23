import React, { useEffect } from "react";
// import { Button } from "theme-ui";
import { Decimal } from "@liquity/lib-base";
import { useLiquity } from "../../../hooks/LiquityContext";
import { useMyTransactionState } from "../../Transaction";
import { useMineView } from "../context/MineViewContext";
import { useValidationState } from "../context/useValidationState";
import { useDeployment } from "../../../configuration/deployments";
import { useHedera } from "../../../hedera/hedera_context";
import { BigNumber } from "ethers";
import { LoadingButton } from "../../LoadingButton";
import { useLoadingState } from "../../../loading_state";
// import { useLoadingState } from "../../../loading_state";
// import { useHedera } from "../../../hedera/hedera_context";
// import { LoadingButton } from "../../LoadingButton";
// import { BigNumber } from "ethers";

type ApproveProps = {
  amount: Decimal;
};

const transactionId = "mine-approve";

export const Approve: React.FC<ApproveProps> = ({ amount }) => {
  const { dispatchEvent } = useMineView();
  const {
    liquity: { 
      // send: liquity,
      connection: { addresses } ,
      store
    },
  } = useLiquity();

  const { hasApproved } = useValidationState(amount);
  const transactionState = useMyTransactionState(transactionId);
  const { approveSpender } = useHedera();
  const deployment = useDeployment();

  useEffect(() => {
    if (transactionState.type === "confirmedOneShot") {
      dispatchEvent("STAKE_APPROVED");
    }
  }, [transactionState.type, dispatchEvent]);

  // console.log(amount, hasApproved);

  const { hasAssociatedWithLP, associateWithToken } = useHedera();
  // LP token association
  const { call: associateWithLP, state: LPAssociationLoadingState } = useLoadingState(
    async () => {
      if (!deployment) {
        const errorMessage = `i cannot get the hchf token id if there is no deployment. please connect to a chain first.`;
        console.error(errorMessage, "context:", { deployment });
        throw new Error(errorMessage);
      }

      // console.log(deployment);

      await associateWithToken({ tokenAddress: addresses.uniToken as `0x${string}` }).then(() => {
        store.refresh();
      });;
    }
  );

  const { call: approveLPSpender, state: LPApprovalLoadingState } = useLoadingState(async () => {
    if (!amount) {
      throw "cannot approve a withdrawal (negative spending/negative deposit) or deposit of 0";
    }

    if (!deployment) {
      const errorMessage = `i cannot get the hlqt token id if there is no deployment. please connect to a chain first.`;
      console.error(errorMessage, "context:", { deployment });
      throw new Error(errorMessage);
    }

    const tokenAddress = deployment.addresses.uniToken as `0x${string}`;
    const contractAddress = deployment.addresses.saucerSwapPool as `0x${string}`;
    const amnt = BigNumber.from(amount.hex);

    // console.log('addresses', deployment.addresses.uniToken, tokenAddress);

    await approveSpender({
      contractAddress,
      tokenAddress: tokenAddress,
      amount: amnt
    }).then(() => {
      store.refresh();
    });
  });

  if (hasApproved) {
    return null;
  }
  // console.log('approve', amount, hasApproved, !amount || hasApproved || !hasAssociatedWithLP)

  return (
    <>
      <LoadingButton
        disabled={!amount || hasApproved}
        loading={LPAssociationLoadingState === "pending"}
        onClick={associateWithLP}
      >
        Assoc. {amount.prettify()} LP
      </LoadingButton>
      <LoadingButton
        disabled={!amount || hasApproved || !hasAssociatedWithLP}
        loading={LPApprovalLoadingState === "pending"}
        onClick={approveLPSpender}
      >
        Approve {amount.prettify()} LP
      </LoadingButton>
    </>
  );
};
