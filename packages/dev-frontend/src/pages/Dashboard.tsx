import { Container } from "theme-ui";

import { Trove } from "../components/Trove/Trove";
import { Stability } from "../components/Stability/Stability";
import { SystemStats } from "../components/SystemStats";
import { Staking } from "../components/Staking/Staking";
// import { StakingLP } from "../components/StakingLP/StakingLP";
import { BondsTable } from "../components/Bonds/BondsTable";
import { MineViewProvider } from "../components/Mine/context/MineViewProvider";
import { Mine } from "../components/Mine/Mine";

export const Dashboard: React.FC = () => (
  <Container variant="columns">
    <Container variant="left">
      <Trove />
      <Stability />
      <Staking />
      {/* <StakingLP /> */}
      <MineViewProvider>
          <Mine />
      </MineViewProvider>
    </Container>

    <Container variant="right">
      <SystemStats />
    </Container>
  </Container>
);
