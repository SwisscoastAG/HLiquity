import React, { useCallback } from "react";
import { Card, Heading, Box, Flex, Button } from "theme-ui";
import { useMineView } from "../../context/MineViewContext";
import { StaticRow } from "../../../Trove/Editor";
import { useLiquitySelector } from "@liquity/lib-react";
import { LiquityStoreState } from "@liquity/lib-base";

const select = ({ lpBalance, lpEarnings, lpReward, liquidityMiningStake }: LiquityStoreState) => ({
  lpBalance,
  lpEarnings,
  lpReward,
  liquidityMiningStake,
});

export const Inactive: React.FC = () => {
  const { dispatchEvent } = useMineView();

  const handleStakePressed = useCallback(() => {
    dispatchEvent("STAKE_PRESSED");
  }, [dispatchEvent]);

  const { lpBalance, lpEarnings, lpReward, liquidityMiningStake } = useLiquitySelector(select);

  // console.log('lp stats', lpBalance.prettify(), lpEarnings.prettify(), lpReward.prettify());

  return (
    <Card>
      <Heading>
        SaucerSwap LP Staking
      </Heading>
      <Box sx={{ p: [2, 3] }}>
      <StaticRow
        label="Staked"
        inputId="deposit-share"
        amount={liquidityMiningStake.prettify()}
        unit="LP"
      />
      <StaticRow
        label="Reward Per Token"
        inputId="deposit-share"
        amount={lpReward.prettify()}
        unit=""
      />
        <Flex variant="layout.actions">
          <Button onClick={handleStakePressed}>Stake</Button>
        </Flex>
      </Box>
    </Card>
  );
};
