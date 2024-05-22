import React, { useCallback, useState } from "react";
import { Heading, Box, Flex, Card, Button } from "theme-ui";
import { Decimal } from "@liquity/lib-base";
import { LP } from "../../../../strings";
import { Icon } from "../../../Icon";
import { EditableRow } from "../../../Trove/Editor";
import { LoadingOverlay } from "../../../LoadingOverlay";
import { useMineView } from "../../context/MineViewContext";
import { useMyTransactionState } from "../../../Transaction";
import { Confirm } from "../Confirm";
import { Description } from "../Description";
import { Approve } from "../Approve";
import { Validation } from "../Validation";
import { useValidationState } from "../../context/useValidationState";
// import { useHedera } from "../../../../hedera/hedera_context";
// import { useDeployment } from "../../../../configuration/deployments";
// import { useLoadingState } from "../../../../loading_state";
// import { LoadingButton } from "../../../LoadingButton";
import { useHedera } from "../../../../hedera/hedera_context";
import { useLoadingState } from "../../../../loading_state";

const transactionId = "mine-stake";

export const Staking: React.FC = () => {
  const { dispatchEvent } = useMineView();
  const [amount, setAmount] = useState<Decimal>(Decimal.from(0));
  const editingState = useState<string>();
  const isDirty = !amount.isZero;
  // const deployment = useDeployment();
  const { approveSpender } = useHedera();

  const { maximumStake, hasSetMaximumStake } = useValidationState(amount);

  // const { hasAssociatedWithHlqt, associateWithToken } = useHedera();
  // // LP token association
  // const { call: associateWithLP, state: LPAssociationLoadingState } = useLoadingState(
  //   async () => {
  //     if (!deployment) {
  //       const errorMessage = `i cannot get the hchf token id if there is no deployment. please connect to a chain first.`;
  //       console.error(errorMessage, "context:", { deployment });
  //       throw new Error(errorMessage);
  //     }

  //     console.log(deployment);

  //     await associateWithToken({ tokenAddress: deployment.hchfTokenAddress });
  //   }
  // );

  const transactionState = useMyTransactionState(transactionId);
  const isTransactionPending =
    transactionState.type === "waitingForApproval" ||
    transactionState.type === "waitingForConfirmation";

  const handleCancelPressed = useCallback(() => {
    dispatchEvent("CANCEL_PRESSED");
  }, [dispatchEvent]);

  return (
    <Card>
      <Heading>
        SaucerSwap LP Staking
        {isDirty && (
          <Button
            variant="titleIcon"
            sx={{ ":enabled:hover": { color: "danger" } }}
            onClick={() => setAmount(Decimal.from(0))}
          >
            <Icon name="history" size="lg" />
          </Button>
        )}
      </Heading>

      <Box sx={{ p: [2, 3] }}>
        <EditableRow
          label="Stake"
          inputId="amount-lp"
          amount={amount.prettify()}
          unit={LP}
          editingState={editingState}
          editedAmount={amount.toString()}
          setEditedAmount={amount => setAmount(Decimal.from(amount))}
          maxAmount={maximumStake.toString()}
          maxedOut={hasSetMaximumStake}
        ></EditableRow>

        {isDirty && <Validation amount={amount} />}
        <Description amount={amount} />

        <Flex variant="layout.actions">
          <Button variant="cancel" onClick={handleCancelPressed}>
            Cancel
          </Button>
          <Approve amount={amount} />
          <Confirm amount={amount} />
        </Flex>
      </Box>
      {isTransactionPending && <LoadingOverlay />}
    </Card>
  );
};
