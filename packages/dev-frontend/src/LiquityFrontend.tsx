/** @jsxImportSource theme-ui */
import React from "react";
import { Flex, Container } from "theme-ui";
import { HashRouter as Router, Switch, Route } from "react-router-dom";
import { Wallet } from "@ethersproject/wallet";

import { Decimal, Difference, Trove } from "@liquity/lib-base";
import { LiquityStoreProvider } from "@liquity/lib-react";

import { useLiquity } from "./hooks/LiquityContext";
import { TransactionMonitor } from "./components/Transaction";
import { UserAccount } from "./components/UserAccount";
import { SystemStatsPopup } from "./components/SystemStatsPopup";
import { Header } from "./components/Header";

import { PageSwitcher } from "./pages/PageSwitcher";
import { RiskyTrovesPage } from "./pages/RiskyTrovesPage";

import { TroveViewProvider } from "./components/Trove/context/TroveViewProvider";
import { StabilityViewProvider } from "./components/Stability/context/StabilityViewProvider";
import { StakingViewProvider } from "./components/Staking/context/StakingViewProvider";
import { StakingViewProvider as StakingLPViewProvider } from "./components/StakingLP/context/StakingViewProvider";
import "tippy.js/dist/tippy.css"; // Tooltip default style
import { BondsProvider } from "./components/Bonds/context/BondsProvider";

import { Imprint } from "./components/Imprint";
import { AutomaticDevelopmentDebugMenu } from "./components/DevelopmentDebugMenu";
import { Dashboard } from "./pages/Dashboard";

export const LiquityFrontend: React.FC = () => {
  const { account: accountAddress, provider, liquity } = useLiquity();

  // For console tinkering ;-)
  Object.assign(window, {
    account: accountAddress,
    provider,
    liquity,
    Trove,
    Decimal,
    Difference,
    Wallet
  });

  return (
    <>
      <Router>
        <TroveViewProvider>
          <StabilityViewProvider>
            <StakingLPViewProvider>
              <StakingViewProvider>
                <BondsProvider>
                  <Flex sx={{ flexDirection: "column", minHeight: "100%" }}>
                    <Header>
                      <UserAccount />
                      <SystemStatsPopup />
                    </Header>

                    <Container
                      variant="main"
                      sx={{
                        display: "flex",
                        flexGrow: 1,
                        flexDirection: "column",
                        alignItems: "center"
                      }}
                    >
                      <PageSwitcher>
                        <Switch>
                          <Route path="/" exact>
                            <Dashboard />
                          </Route>
                          <Route path="/risky-troves">
                            <RiskyTrovesPage />
                          </Route>
                        </Switch>
                      </PageSwitcher>
                    </Container>
                  </Flex>
                </BondsProvider>
              </StakingViewProvider>
            </StakingLPViewProvider>
          </StabilityViewProvider>
        </TroveViewProvider>
      </Router>

      <footer sx={{ marginInline: "clamp(2rem, 100%, 50% - 38rem)", paddingBottom: "2rem" }}>
        <Imprint />
      </footer>

      <TransactionMonitor />
      <AutomaticDevelopmentDebugMenu />
    </>
  );
};
