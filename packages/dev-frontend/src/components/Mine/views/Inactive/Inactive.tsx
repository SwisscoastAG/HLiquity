import React, { useCallback } from "react";
import { Card, Heading, Box, Flex, Button } from "theme-ui";
import { InfoMessage } from "../../../InfoMessage";
import { useMineView } from "../../context/MineViewContext";

export const Inactive: React.FC = () => {
  const { dispatchEvent } = useMineView();

  const handleStakePressed = useCallback(() => {
    dispatchEvent("STAKE_PRESSED");
  }, [dispatchEvent]);

  return (
    <Card>
      <Heading>
        SaucerSwap LP Staking
      </Heading>
      <Box sx={{ p: [2, 3] }}>
        <InfoMessage title="You aren't mining LQTY">
          <Flex>You can can stake your LP Tokens here</Flex>
        </InfoMessage>

        <Flex variant="layout.actions">
          <Button onClick={handleStakePressed}>Stake</Button>
        </Flex>
      </Box>
    </Card>
  );
};
