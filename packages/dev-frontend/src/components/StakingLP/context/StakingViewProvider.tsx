import { useEffect, useState } from "react";

import { LiquityStoreState, HLQTStake } from "@liquity/lib-base";
import { LiquityStoreUpdate, useLiquityReducer } from "@liquity/lib-react";

import { useMyTransactionState } from "../../Transaction";

import { StakingViewAction, StakingViewContext, StakingView} from "./StakingViewContext";

import { useLiquity } from "../../../hooks/LiquityContext";

type StakingViewProviderAction =
  | LiquityStoreUpdate
  | StakingViewAction
  | { type: "startChange" | "abortChange" };

type StakingViewProviderState = {
  hlqtStake: HLQTStake;
  changePending: boolean;
  adjusting: boolean;
};

const init = ({ hlqtStake }: LiquityStoreState): StakingViewProviderState => ({
  hlqtStake,
  changePending: false,
  adjusting: false
});

const reduce = (
  state: StakingViewProviderState,
  action: StakingViewProviderAction
): StakingViewProviderState => {
  // console.log(state);
  // console.log(action);

  switch (action.type) {
    case "startAdjusting":
      return { ...state, adjusting: true };

    case "cancelAdjusting":
      return { ...state, adjusting: false };

    case "startChange":
      return { ...state, changePending: true };

    case "abortChange":
      return { ...state, changePending: false };

    case "updateStore": {
      const {
        oldState: { hlqtStake: oldStake },
        stateChange: { hlqtStake: updatedStake }
      } = action;

      if (updatedStake) {
        const changeCommitted =
          !updatedStake.stakedHLQT.eq(oldStake.stakedHLQT) ||
          updatedStake.collateralGain.lt(oldStake.collateralGain) ||
          updatedStake.hchfGain.lt(oldStake.hchfGain);

        return {
          ...state,
          hlqtStake: updatedStake,
          adjusting: false,
          changePending: changeCommitted ? false : state.changePending
        };
      }
    }
  }

  return state;
};

export const StakingViewProvider: React.FC = ({ children }) => {
  const stakingTransactionState = useMyTransactionState("stakeLP");
  const [{ adjusting, changePending, hlqtStake }, dispatch] = useLiquityReducer(reduce, init);
  const [ viewState, setViewState ] = useState<StakingView>("NONE");
  const { liquity } = useLiquity();

  useEffect(() => {
    if (
      stakingTransactionState.type === "waitingForApproval" ||
      stakingTransactionState.type === "waitingForConfirmation"
    ) {
      dispatch({ type: "startChange" });
    } else if (
      stakingTransactionState.type === "failed" ||
      stakingTransactionState.type === "cancelled"
    ) {
      dispatch({ type: "abortChange" });
    }
  }, [stakingTransactionState.type, dispatch]);

  useEffect(() => {
    setViewState(adjusting ? "ADJUSTING" : !hlqtStake || hlqtStake.isEmpty ? "NONE" : "ACTIVE");
  }, [adjusting, hlqtStake])

  useEffect(() => {
    liquity.store.refresh();
  }, [viewState])

  return (
    <StakingViewContext.Provider
      value={{
        view: viewState,
        changePending,
        dispatch
      }}
    >
      {children}
    </StakingViewContext.Provider>
  );
};
