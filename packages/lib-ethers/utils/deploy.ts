import { Signer } from "@ethersproject/abstract-signer";
import { ContractTransaction, ContractFactory, Overrides } from "@ethersproject/contracts";
import { Wallet } from "@ethersproject/wallet";
import { setNonce } from "@nomicfoundation/hardhat-network-helpers";

import { Decimal } from "@liquity/lib-base";

import {
  _LiquityContractAddresses,
  _LiquityContracts,
  _LiquityDeploymentJSON,
  _connectToContracts
} from "../src/contracts";

import { createUniswapV2Pair } from "./UniswapV2Factory";
import { ethers } from "ethers";
import { AccountId, Client, PrivateKey, TokenAssociateTransaction, TokenId } from "@hashgraph/sdk";
import dotenv from "dotenv";
import { fromSolidityAddress } from "@hashgraph/sdk/lib/EntityIdHelper";

let silent = false;

export const log = (...args: unknown[]): void => {
  if (!silent) {
    console.log(...args);
  }
};

export const setSilent = (s: boolean): void => {
  silent = s;
};

const deployContract = async (
  deployer: Signer,
  getContractFactory: (name: string, signer: Signer) => Promise<ContractFactory>,
  contractName: string,
  ...args: unknown[]
) => {
  log(`Deploying ${contractName} ...`);
  log(args);
  // use if nonce is not fixable
  /**
     const nonce = await deployer.provider!.getTransactionCount(await deployer.getAddress());
     if (args.length > 0 && typeof args[args.length - 1] === 'object' && args[args.length - 1] !== null) {
        // Properly cast the last element to an object to satisfy TypeScript's type system.
        const lastArg = args[args.length - 1] as { [key: string]: unknown };
        args[args.length - 1] = { ...lastArg, nonce: nonce + 1 };
    } else {
        // If the last argument is not an object, add a new object with the nonce.
        args.push({ nonce: nonce + 1 });
    }
     console.log(args)
     **/

  const contract = await (await getContractFactory(contractName, deployer)).deploy(...args);

  log(`Waiting for transaction ${contract.deployTransaction.hash} ...`);
  const receipt = await contract.deployTransaction.wait();

  log({
    contractAddress: contract.address,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toNumber()
  });

  log();

  return contract.address;
};

const deployContracts = async (
  deployer: Signer,
  getContractFactory: (name: string, signer: Signer) => Promise<ContractFactory>,
  priceFeedIsTestnet = true,
  overrides?: Overrides
): Promise<Omit<_LiquityContractAddresses, "uniToken">> => {
  const activePool = await deployContract(deployer, getContractFactory, "ActivePool", {
    ...overrides,
    gasLimit: 3000000
  });
  const borrowerOperations = await deployContract(
    deployer,
    getContractFactory,
    "BorrowerOperations",
    {
      ...overrides,
      gasLimit: 3000000
    }
  );
  const troveManager = await deployContract(deployer, getContractFactory, "TroveManager", {
    ...overrides,
    gasLimit: 3000000
  });
  const collSurplusPool = await deployContract(deployer, getContractFactory, "CollSurplusPool", {
    ...overrides,
    gasLimit: 3000000
  });
  const communityIssuance = await deployContract(deployer, getContractFactory, "CommunityIssuance", {
    ...overrides,
    gasLimit: 3000000
  });
  const defaultPool = await deployContract(deployer, getContractFactory, "DefaultPool", {
    ...overrides,
    gasLimit: 3000000
  });
  const hintHelpers = await deployContract(deployer, getContractFactory, "HintHelpers", {
    ...overrides,
    gasLimit: 3000000
  });
  const lockupContractFactory = await deployContract(
    deployer,
    getContractFactory,
    "LockupContractFactory",
    {
      ...overrides,
      gasLimit: 3000000
    }
  );
  const hlqtStaking = await deployContract(deployer, getContractFactory, "HLQTStaking", {
    ...overrides,
    gasLimit: 3000000
  });
  const priceFeed = await deployContract(
    deployer,
    getContractFactory,
    priceFeedIsTestnet ? "PriceFeedTestnet" : "PriceFeed",
    { ...overrides, gasLimit: 3000000 }
  );
  const sortedTroves = await deployContract(deployer, getContractFactory, "SortedTroves", {
    ...overrides,
    gasLimit: 3000000
  });
  const stabilityPool = await deployContract(deployer, getContractFactory, "StabilityPool", {
    ...overrides,
    gasLimit: 3000000
  });

  const hchfToken = await deployContract(
    deployer,
    getContractFactory,
    "HCHFToken",
    troveManager,
    stabilityPool,
    borrowerOperations,
    { ...overrides, gasLimit: 3000000, value: ethers.utils.parseEther("20") }
  );

  const hlqtToken = await deployContract(
    deployer,
    getContractFactory,
    "HLQTToken",
    communityIssuance,
    hlqtStaking,
    lockupContractFactory,
    await deployer.getAddress(), // _multisigAddress (TODO: parameterize this)
    { ...overrides, gasLimit: 3000000, value: ethers.utils.parseEther("20") }
  );

  const saucerSwapPool = await deployContract(deployer, getContractFactory, "saucerSwapPool", hlqtToken, {
    ...overrides,
    gasLimit: 3000000
  });

  const gasPool = await deployContract(
    deployer,
    getContractFactory,
    "GasPool",
    hchfToken,
    troveManager,
    borrowerOperations,
    { ...overrides, gasLimit: 3000000 }
  );

  const multiTroveGetter = await deployContract(
    deployer,
    getContractFactory,
    "MultiTroveGetter",
    troveManager,
    sortedTroves,
    { ...overrides, gasLimit: 3000000 }
  );
  return {
    activePool,
    borrowerOperations,
    troveManager,
    collSurplusPool,
    defaultPool,
    communityIssuance,
    hintHelpers,
    lockupContractFactory,
    hlqtStaking,
    priceFeed,
    sortedTroves,
    stabilityPool,
    saucerSwapPool,
    hchfToken,
    hlqtToken,
    uniToken,
    multiTroveGetter,
    gasPool
  };
};

export const deployTellorCaller = (
  deployer: Signer,
  getContractFactory: (name: string, signer: Signer) => Promise<ContractFactory>,
  tellorAddress: string,
  overrides?: Overrides
): Promise<string> =>
  deployContract(deployer, getContractFactory, "TellorCaller", tellorAddress, {
    ...overrides,
    gasLimit: 3000000
  });

/**
 * Send a transaction, retrying if the nonce is too high.
 *
 * This function attempts to send a blockchain transaction by connecting to a deployer.
 * If the nonce is too high, which might happen due to concurrent transactions or network issues,
 * it will retry sending the transaction up to a maximum number of retries (MAX_RETRIES).
 *
 * @param {Function} connect - A function that returns a promise resolving to a ContractTransaction object.
 * @param {Signer} deployer - The signer object representing the deployer of the contract.
 * @param {Overrides} [overrides] - Optional transaction overrides.
 * @param {number} [retryCount=0] - The current retry count (used internally for recursion).
 *
 * @returns {Promise<void>} A promise that resolves once the transaction has been sent and confirmed,
 *                          or rejects if an error occurs or the maximum number of retries is reached.
 */
const MAX_RETRIES = 10;

const sendTransaction = async (
  connect: (nonce: number) => Promise<ContractTransaction>,
  deployer: Signer,
  overrides?: Overrides,
  retryCount = 0
): Promise<void> => {
  try {
    const txCount = await deployer.provider!.getTransactionCount(await deployer.getAddress()); // The use of 'pending' takes into account the nonce of pending transactions as well as confirmed ones.
    const tx = await connect(txCount);
    await tx.wait();
  } catch (error) {
    if (error.code === "NONCE_EXPIRED" && retryCount < MAX_RETRIES) {
      console.log(`Nonce expired, retrying... (${retryCount + 1}/${MAX_RETRIES})`);
      await sendTransaction(connect, deployer, overrides, retryCount + 1);
    } else {
      throw error;
    }
  }
};

const connectContracts = async (
  {
    activePool,
    borrowerOperations,
    troveManager,
    hchfToken,
    collSurplusPool,
    communityIssuance,
    defaultPool,
    hlqtToken,
    hintHelpers,
    lockupContractFactory,
    hlqtStaking,
    priceFeed,
    sortedTroves,
    stabilityPool,
    gasPool,
    saucerSwapPool,
    uniToken
  }: _LiquityContracts,
  deployer: Signer,
  overrides?: Overrides
) => {
  if (!deployer.provider) {
    throw new Error("Signer must have a provider.");
  }

  const connections: ((nonce: number) => Promise<ContractTransaction>)[] = [
    nonce =>
      sortedTroves.setParams(1e6, troveManager.address, borrowerOperations.address, {
        ...overrides,
        gasLimit: 3000000,
        nonce
      }),

    nonce =>
      troveManager.setAddresses(
        borrowerOperations.address,
        activePool.address,
        defaultPool.address,
        stabilityPool.address,
        gasPool.address,
        collSurplusPool.address,
        priceFeed.address,
        hchfToken.address,
        sortedTroves.address,
        hlqtToken.address,
        hlqtStaking.address,
        { ...overrides, gasLimit: 3000000, nonce }
      ),

    nonce =>
      borrowerOperations.setAddresses(
        troveManager.address,
        activePool.address,
        defaultPool.address,
        stabilityPool.address,
        gasPool.address,
        collSurplusPool.address,
        priceFeed.address,
        sortedTroves.address,
        hchfToken.address,
        hlqtStaking.address,
        { ...overrides, gasLimit: 3000000, nonce }
      ),

    nonce =>
      stabilityPool.setAddresses(
        borrowerOperations.address,
        troveManager.address,
        activePool.address,
        hchfToken.address,
        sortedTroves.address,
        priceFeed.address,
        communityIssuance.address,
        { ...overrides, gasLimit: 3000000, nonce }
      ),

    nonce =>
      activePool.setAddresses(
        borrowerOperations.address,
        troveManager.address,
        stabilityPool.address,
        defaultPool.address,
        { ...overrides, gasLimit: 3000000, nonce }
      ),

    nonce =>
      defaultPool.setAddresses(troveManager.address, activePool.address, {
        ...overrides,
        gasLimit: 3000000,
        nonce
      }),

    nonce =>
      collSurplusPool.setAddresses(
        borrowerOperations.address,
        troveManager.address,
        activePool.address,
        { ...overrides, gasLimit: 3000000, nonce }
      ),

    nonce =>
      hintHelpers.setAddresses(sortedTroves.address, troveManager.address, {
        ...overrides,
        gasLimit: 3000000,
        nonce
      }),

    nonce =>
      hlqtStaking.setAddresses(
        hlqtToken.address,
        hchfToken.address,
        troveManager.address,
        borrowerOperations.address,
        activePool.address,
        { ...overrides, gasLimit: 3000000, nonce }
      ),

    nonce =>
      lockupContractFactory.setHLQTTokenAddress(hlqtToken.address, {
        ...overrides,
        gasLimit: 3000000,
        nonce
      }),

    nonce =>
      lockupContractFactory.setUniTokenAddress(uniToken.address, {
        ...overrides,
        gasLimit: 3000000,
        nonce
      }),

    nonce =>
      communityIssuance.setAddresses(hlqtToken.address, stabilityPool.address, {
        ...overrides,
        gasLimit: 3000000,
        nonce
      }),

    nonce => {
      return deployer.getAddress().then(address => {
        return hlqtToken.initialize(address, saucerSwapPool.address, {
          ...overrides,
          gasLimit: 3000000,
          nonce
        });
      });
    },

    nonce =>
      saucerSwapPool.setParams(uniToken.address, 2 * 30 * 24 * 60 * 60, {
        ...overrides,
        gasLimit: 3000000,
        nonce
      })
  ];

  dotenv.config();
  if (!process.env.ACCOUNT_ID || !process.env.ACCOUNT_PRIVATE_KEY) {
    throw new Error("Please set required keys in .env file.");
  }
  const accountId = AccountId.fromString(process.env.ACCOUNT_ID);
  const accountKey = PrivateKey.fromStringECDSA(process.env.ACCOUNT_PRIVATE_KEY);
  const client = Client.forTestnet().setOperator(accountId, accountKey);

  const tokenId = await hlqtToken.getTokenAddress();
  console.log(tokenId);
  const associateTx = await new TokenAssociateTransaction()
    .setAccountId(accountId)
    .setTokenIds([TokenId.fromSolidityAddress(tokenId)])
    .freezeWith(client)
    .sign(accountKey);
  const associateTxSubmit = await associateTx.execute(client);
  const associateRx = await associateTxSubmit.getReceipt(client);
  console.log(`Manual Association: ${associateRx.status.toString()} \n`);

  let i = 0;
  for (const connect of connections) {
    await sendTransaction(connect, deployer, overrides);
    log(`Connected ${++i}`);
  }
};

const deployMockUniToken = (
  deployer: Signer,
  getContractFactory: (name: string, signer: Signer) => Promise<ContractFactory>,
  overrides?: Overrides
) =>
  deployContract(
    deployer,
    getContractFactory,
    "ERC20Mock",
    "Mock Uniswap V2",
    "UNI-V2",
    Wallet.createRandom().address, // initialAccount
    0, // initialBalance
    { ...overrides, gasLimit: 3000000 }
  );

export const deployAndSetupContracts = async (
  deployer: Signer,
  getContractFactory: (name: string, signer: Signer) => Promise<ContractFactory>,
  _priceFeedIsTestnet = true,
  _isDev = true,
  wethAddress?: string,
  overrides?: Overrides
): Promise<_LiquityDeploymentJSON> => {
  if (!deployer.provider) {
    throw new Error("Signer must have a provider.");
  }

  log("Deploying contracts...");
  log();

  const deployment: _LiquityDeploymentJSON = {
    chainId: await deployer.getChainId(),
    version: "unknown",
    deploymentDate: new Date().getTime(),
    bootstrapPeriod: 0,
    totalStabilityPoolHLQTReward: "0",
    liquidityMiningHLQTRewardRate: "0",
    _priceFeedIsTestnet,
    _uniTokenIsMock: !wethAddress,
    _isDev,

    addresses: await deployContracts(
      deployer,
      getContractFactory,
      _priceFeedIsTestnet,
      overrides
    ).then(async addresses => ({
      ...addresses,

      uniToken: await (wethAddress
        ? createUniswapV2Pair(deployer, wethAddress, addresses.hchfToken, overrides)
        : deployMockUniToken(deployer, getContractFactory, overrides))
    }))
  };

  const contracts = _connectToContracts(deployer, deployment);

  log("Connecting contracts...");
  await connectContracts(contracts, deployer, overrides);

  const lqtyTokenDeploymentTime = await contracts.hlqtToken.getDeploymentStartTime();
  const bootstrapPeriod = await contracts.troveManager.BOOTSTRAP_PERIOD();
  const totalStabilityPoolLQTYReward = await contracts.communityIssuance.HLQTSupplyCap();
  const liquidityMiningLQTYRewardRate = await contracts.saucerSwapPool.rewardRate();

  return {
    ...deployment,
    deploymentDate: lqtyTokenDeploymentTime.toNumber() * 1000,
    bootstrapPeriod: bootstrapPeriod.toNumber(),
    totalStabilityPoolHLQTReward: `${Decimal.fromBigNumberString(
      totalStabilityPoolLQTYReward.toHexString()
    )}`,
    liquidityMiningHLQTRewardRate: `${Decimal.fromBigNumberString(
      liquidityMiningLQTYRewardRate.toHexString()
    )}`
  };
};
