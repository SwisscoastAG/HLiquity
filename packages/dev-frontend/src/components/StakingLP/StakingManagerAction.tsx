import { Decimal, HLQTStakeChange } from "@liquity/lib-base";

import { useLiquity } from "../../hooks/LiquityContext";
import { useTransactionFunction } from "../Transaction";
import { LoadingButton, LoadingButtonProps } from "../LoadingButton";

type StakingActionProps = {
  change: HLQTStakeChange<Decimal>;
} & LoadingButtonProps;

export const StakingManagerAction: React.FC<StakingActionProps> = ({
  change,
  children,
  ...loadingButtonProps
}) => {
  const { liquity } = useLiquity();

  const [sendTransaction] = useTransactionFunction(
    "stake",
    change.stakeHLQT
      ? liquity.send.stakeUniTokens.bind(liquity.send, change.stakeHLQT)
      : liquity.send.unstakeUniTokens.bind(liquity.send, change.unstakeHLQT)
  );

  return (
    <LoadingButton {...loadingButtonProps} onClick={sendTransaction}>
      {children}
    </LoadingButton>
  );
};
