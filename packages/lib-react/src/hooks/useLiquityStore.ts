import { useContext } from "react";

import { HLiquityStore } from "@liquity/lib-base";

import { LiquityStoreContext } from "../components/LiquityStoreProvider";

export const useLiquityStore = <T>(): HLiquityStore<T> => {
  const store = useContext(LiquityStoreContext);

  if (!store) {
    throw new Error("You must provide a LiquityStore via LiquityStoreProvider");
  }

  return store as HLiquityStore<T>;
};
