import React from "react";
import { Card, Heading, Box } from "theme-ui";
import { LiquityStoreState } from "@liquity/lib-base";
import { useLiquitySelector } from "@liquity/lib-react";
import { UnstakeAndClaim } from "../UnstakeAndClaim";
import { StaticRow } from "../../../Trove/Editor";
import { GT, LP } from "../../../../strings";

const selector = ({ liquidityMiningStake, liquidityMiningHLQTReward }: LiquityStoreState) => ({
  liquidityMiningStake,
  liquidityMiningHLQTReward
});

export const Disabled: React.FC = () => {
  const { liquidityMiningStake, liquidityMiningHLQTReward } = useLiquitySelector(selector);
  const hasStake = !liquidityMiningStake.isZero;

  return (
    <Card>
      <Heading>
        SaucerSwap LP Staking
      </Heading>
      <Box sx={{ p: [2, 3] }}>
        {hasStake && (
          <>
            <Box sx={{ border: 1, pt: 3, borderRadius: 3 }}>
              <StaticRow
                label="Stake"
                inputId="mine-deposit"
                amount={liquidityMiningStake.prettify(4)}
                unit={LP}
              />
              <StaticRow
                label="Reward"
                inputId="mine-reward"
                amount={liquidityMiningHLQTReward.prettify(4)}
                color={liquidityMiningHLQTReward.nonZero && "success"}
                unit={GT}
              />
            </Box>
            <UnstakeAndClaim />
          </>
        )}
      </Box>
    </Card>
  );
};
