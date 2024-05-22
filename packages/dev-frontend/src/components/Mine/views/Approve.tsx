import React, { useEffect } from "react";
import { Button } from "theme-ui";
import { Decimal } from "@liquity/lib-base";
import { useLiquity } from "../../../hooks/LiquityContext";
import { Transaction, useMyTransactionState } from "../../Transaction";
import { useMineView } from "../context/MineViewContext";
import { useValidationState } from "../context/useValidationState";
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
    liquity: { send: liquity }
  } = useLiquity();

  const { hasApproved } = useValidationState(amount);
  const transactionState = useMyTransactionState(transactionId);
  // const { approveSpender } = useHedera();

  useEffect(() => {
    if (transactionState.type === "confirmedOneShot") {
      dispatchEvent("STAKE_APPROVED");
    }
  }, [transactionState.type, dispatchEvent]);

  console.log(amount, hasApproved);

  // const { call: approveLPSpender, state: LPApprovalLoadingState } = useLoadingState(async () => {
  //   if (!amount) {
  //     throw "cannot approve a withdrawal (negative spending/negative deposit) or deposit of 0";
  //   }

  //   // if (!deployment) {
  //   //   const errorMessage = `i cannot get the hlqt token id if there is no deployment. please connect to a chain first.`;
  //   //   console.error(errorMessage, "context:", { deployment });
  //   //   throw new Error(errorMessage);
  //   // }

  //   const contractAddress = "0x0000000000000000000000000000000000428968" as `0x${string}`;
  //   const tokenAddress = "0x0000000000000000000000000000000000428959";
  //   const amnt = BigNumber.from(amount.hex);

  //   await approveSpender({
  //     contractAddress,
  //     tokenAddress,
  //     amount: amnt
  //   });
  // });

  if (hasApproved) {
    return null;
  }
  console.log('approve')

  return (
    // <LoadingButton
    //         disabled={!amount}
    //         loading={LPApprovalLoadingState === "pending"}
    //         onClick={approveLPSpender}
    //       >
    //         Consent to spending {amount.prettify()} LP
    //       </LoadingButton>
    <Transaction
      id={transactionId}
      send={liquity.approveUniTokens.bind(liquity, undefined)}
      showFailure="asTooltip"
      tooltipPlacement="bottom"
    >
      <Button sx={{ width: "60%" }}>Approve LP</Button>
    </Transaction>
  );
};
