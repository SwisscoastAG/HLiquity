import { LiquityStoreState } from "@liquity/lib-base";
import { useLiquitySelector } from "@liquity/lib-react";
import React from "react";
import { Flex } from "theme-ui";

const selector = ({ remainingLiquidityMiningHLQTReward }: LiquityStoreState) => ({
  remainingLiquidityMiningHLQTReward
});

export const RemainingLQTY: React.FC = () => {
  const { remainingLiquidityMiningHLQTReward } = useLiquitySelector(selector);

  return (
    <Flex sx={{ fontSize: 2, fontWeight: "bold" }}>
      {remainingLiquidityMiningHLQTReward.prettify(0)} LQTY remaining
    </Flex>
  );
};
