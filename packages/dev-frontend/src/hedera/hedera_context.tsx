import { createContext, useContext, useState } from "react";
import { BigNumber } from "ethers";
import { TokenId } from "@hashgraph/sdk";
import { useDeployment } from "../hooks/deployments";

interface HederaContext {
  /** @deprecated use liquity methods instead */
  approveSpender: (options: {
    contractAddress: `0x${string}`;
    tokenAddress: `0x${string}`;
    amount: BigNumber;
  }) => Promise<void>;
  /** @deprecated use liquity methods instead */
  associateWithToken: (options: { tokenAddress: `0x${string}` }) => Promise<void>;
  /** @deprecated use liquity methods instead */
  dissociateFromToken: (options: { tokenAddress: `0x${string}` }) => Promise<void>;
  /** @deprecated use liquity store state instead */
  hasAssociatedWithHchf: boolean;
  /** @deprecated use liquity store state instead */
  hasAssociatedWithHlqt: boolean;
}

const noOp = async () => undefined;
const hederaContext = createContext<HederaContext>({
  approveSpender: noOp,
  associateWithToken: noOp,
  dissociateFromToken: noOp,
  hasAssociatedWithHchf: false,
  hasAssociatedWithHlqt: false,
});

export const useHedera = () => {
  return useContext(hederaContext);
};

interface HederaToken {
  id: `0.0.${string}`;
}

export const HederaTokensProvider: React.FC = ({ children }) => {
  const deployment = useDeployment();
  const [tokens] = useState<HederaToken[]>([]);

  const hchfTokenId = deployment
    ? TokenId.fromSolidityAddress(deployment.hchfTokenAddress).toString()
    : undefined;
  const hasAssociatedWithHchf = tokens.some(token => {
    const isHchf = token.id === hchfTokenId;
    return isHchf;
  });
  const hlqtTokenId = deployment
    ? TokenId.fromSolidityAddress(deployment.hlqtTokenAddress).toString()
    : undefined;
  const hasAssociatedWithHlqt = tokens.some(token => {
    const isHlqt = token.id === hlqtTokenId;
    return isHlqt;
  });

  const associateWithTokenWithContext: HederaContext["associateWithToken"] = async options => {
    options;
    throw new Error("deprecated. use liquity methods instead");
  };

  const dissociateFromTokenWithContext: HederaContext["dissociateFromToken"] = async options => {
    options;
    throw new Error("deprecated. use liquity methods instead");
  };

  const approveSpenderWithContext: HederaContext["approveSpender"] = async options => {
    options;
    throw new Error("deprecated. use liquity methods instead");
  };

  return (
    <hederaContext.Provider
      value={{
        associateWithToken: associateWithTokenWithContext,
        dissociateFromToken: dissociateFromTokenWithContext,
        approveSpender: approveSpenderWithContext,
        hasAssociatedWithHchf,
        hasAssociatedWithHlqt,
      }}
    >
      {children}
    </hederaContext.Provider>
  );
};
