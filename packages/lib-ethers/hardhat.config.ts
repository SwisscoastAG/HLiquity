import assert from "assert";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import "colors";

import {JsonFragment} from "@ethersproject/abi";
import {Wallet} from "@ethersproject/wallet";
import {Signer} from "@ethersproject/abstract-signer";
import {ContractFactory, Overrides} from "@ethersproject/contracts";

import {task, HardhatUserConfig, types, extendEnvironment} from "hardhat/config";
import {HardhatRuntimeEnvironment, NetworkUserConfig} from "hardhat/types";
import "@nomiclabs/hardhat-ethers";

import {Decimal} from "@liquity/lib-base";

import {
    deployAndSetupContracts,
    deployPythCaller,
    deploySupraCaller,
    setSilent
} from "./utils/deploy";
import {_connectToContracts, _LiquityDeploymentJSON, _priceFeedIsTestnet} from "./src/contracts";

import accounts from "./accounts.json";

dotenv.config();

const numAccounts = 100;

const useLiveVersionEnv = (process.env.USE_LIVE_VERSION ?? "false").toLowerCase();
const useLiveVersion = !["false", "no", "0"].includes(useLiveVersionEnv);

const contractsDir = path.join("..", "contracts");
const artifacts = path.join(contractsDir, "artifacts");
const cache = path.join(contractsDir, "cache");

const contractsVersion = fs
    .readFileSync(path.join(useLiveVersion ? "live" : artifacts, "version"))
    .toString()
    .trim();

if (useLiveVersion) {
    console.log(`Using live version of contracts (${contractsVersion}).`.cyan);
}

const generateRandomAccounts = (numberOfAccounts: number) => {
    const accounts = new Array<string>(numberOfAccounts);

    for (let i = 0; i < numberOfAccounts; ++i) {
        accounts[i] = Wallet.createRandom().privateKey;
    }

    return accounts;
};

const deployerAccount = process.env.DEPLOYER_PRIVATE_KEY || Wallet.createRandom().privateKey;
const devChainRichAccount = "0x4d5db4107d237df6a3d58ee5f70ae63d73d7658d4026f2eefd2f204c81682cb7";

const infuraApiKey = "ad9cef41c9c844a7b54d10be24d416e5";

const infuraNetwork = (name: string): { [name: string]: NetworkUserConfig } => ({
    [name]: {
        url: `https://${name}.infura.io/v3/${infuraApiKey}`,
        accounts: [deployerAccount, 'ddf37d7451300e93251583aed5e24cd46ba2d53bf6324d5d8bcc81455e683e69', 'ef0f9883208ac913e6dd7260e0afda4bf47d0d4d5805a118893af49ed6b325fa', '604d1734906ff8eddea6a1307c27e03d5d30184154fe33ce29b5993c87dfcd62']
    }
});

// https://docs.chain.link/docs/ethereum-addresses
// https://docs.tellor.io/tellor/integration/reference-page

const oracleAddresses = {
    hederaMainnet: {
        pyth: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729",
        supra: "0xD02cc7a670047b6b012556A88e275c685d25e0c9"
    },
    hederaTestnet: {
        pyth: "0xa2aa501b19aff244d90cc15a4cf739d2725b5729",
        supra: "0x6Cd59830AAD978446e6cc7f6cc173aF7656Fb917"
    }
};

const hasOracles = (network: string): network is keyof typeof oracleAddresses =>
    network in oracleAddresses;

const wethAddresses = {
    hederaMainnet: "0x0000000000000000000000000000000000163b5a",
    hederaTestnet: "0x0000000000000000000000000000000000003ad2",
};

const hasWETH = (network: string): network is keyof typeof wethAddresses => network in wethAddresses;

const config: HardhatUserConfig = {
    networks: {
        hardhat: {
            accounts: accounts.slice(0, numAccounts),

            gas: 12e6, // tx gas limit
            blockGasLimit: 12e6,

            // Let Ethers throw instead of Buidler EVM
            // This is closer to what will happen in production
            throwOnCallFailures: false,
            throwOnTransactionFailures: false
        },

        hederaTestnet: {
            url: "https://pool.arkhia.io/hedera/testnet/json-rpc/v1/1u6ercu94y4u20eeeZ417e72w2990ad7",
            gas: 16e6,
            blockGasLimit: 34e6,
            gasPrice: 1490000000000,
            chainId: 296,
            timeout: 1000000,
            accounts: ['3d5410259092c2fd609239cababe3ef4690f48057aba853c0da7ed6cedae835a', '4c01eff6764673ab79a4cbfb954801f7d4ae8538a6496896ce72b73e6b63b0d4', 'aaf63f1eac2a78e34cee46e7ee90bb51fe7dbf36e6e4da7edb6c952e24abe484', '3b6f552386dc800cef28e2a02e1aff4774480e718a2d30b092d011eb6e0d4418']
        },

        hederaMainnet: {
            url: "https://mainnet.hashio.io/api",
            gas: 14.5e6,
            blockGasLimit: 34e6,
            gasPrice: 1490000000000,
            chainId: 295,
            timeout: 1000000,
            accounts: ['']
        },

        hederaPreviewnet: {
            url: "https://previewnet.hashio.io/api",
            gas: 12e6,
            blockGasLimit: 34e6,
            chainId: 297,
            timeout: 90000,
            accounts: ['0xef0f9883208ac913e6dd7260e0afda4bf47d0d4d5805a118893af49ed6b325fa', '604d1734906ff8eddea6a1307c27e03d5d30184154fe33ce29b5993c87dfcd62', '057ef1dcbc48ac15e22f7d6954fa4ef10c38e62a5c014e8ecec63238c06864c6']
        },
        hederaLocalTestnet: {
            url: 'http://localhost:7546',
            accounts: ['4c01eff6764673ab79a4cbfb954801f7d4ae8538a6496896ce72b73e6b63b0d4', '3d5410259092c2fd609239cababe3ef4690f48057aba853c0da7ed6cedae835a'],
            chainId: 298,
            timeout: 90000,
            blockGasLimit: 34e6
        },
        ...infuraNetwork("ropsten"),
        ...infuraNetwork("rinkeby"),
        ...infuraNetwork("goerli"),
        ...infuraNetwork("kovan"),
        ...infuraNetwork("mainnet")
    },

    paths: {
        artifacts,
        cache
    }
};

declare module "hardhat/types/runtime" {
    interface HardhatRuntimeEnvironment {
        deployLiquity: (
            deployer: Signer,
            useRealPriceFeed?: boolean,
            wethAddress?: string,
            overrides?: Overrides
        ) => Promise<_LiquityDeploymentJSON>;
    }
}

const getLiveArtifact = (name: string): { abi: JsonFragment[]; bytecode: string } =>
    require(`./live/${name}.json`);

const getContractFactory: (
    env: HardhatRuntimeEnvironment
) => (name: string, signer: Signer) => Promise<ContractFactory> = useLiveVersion
    ? env => (name, signer) => {
        const {abi, bytecode} = getLiveArtifact(name);
        return env.ethers.getContractFactory(abi, bytecode, signer);
    }
    : env => env.ethers.getContractFactory;

extendEnvironment(env => {
    env.deployLiquity = async (
        deployer,
        useRealPriceFeed = false,
        wethAddress = undefined,
        overrides?: Overrides
    ) => {
        //console.log("deployer: ", deployer);
        const deployment = await deployAndSetupContracts(
            deployer,
            getContractFactory(env),
            !useRealPriceFeed,
            env.network.name === "hederaLocalTestnet",
            wethAddress,
            overrides
        );

        return {...deployment, version: contractsVersion};
    };
});

type DeployParams = {
    channel: string;
    gasPrice?: number;
    useRealPriceFeed?: boolean;
    createUniswapPair?: boolean;
};

const defaultChannel = process.env.CHANNEL || "default";

task("deploy", "Deploys the contracts to the network")
    .addOptionalParam("channel", "Deployment channel to deploy into", defaultChannel, types.string)
    .addOptionalParam("gasPrice", "Price to pay for 1 gas [Gwei]", undefined, types.float)
    .addOptionalParam(
        "useRealPriceFeed",
        "Deploy the production version of PriceFeed and connect it to Chainlink",
        undefined,
        types.boolean
    )
    .addOptionalParam(
        "createUniswapPair",
        "Create a real Uniswap v2 WETH-HCHF pair instead of a mock ERC20 token",
        undefined,
        types.boolean
    )
    .setAction(
        async ({channel, gasPrice, useRealPriceFeed, createUniswapPair}: DeployParams, env) => {
            const overrides = {gasPrice: gasPrice && Decimal.from(gasPrice).div(1000000000).hex};
            const [deployer] = await env.ethers.getSigners();

            useRealPriceFeed ??= env.network.name === "hederaMainnet" || env.network.name === "hederaTestnet";

            if (useRealPriceFeed && !hasOracles(env.network.name)) {
                throw new Error(`PriceFeed not supported on ${env.network.name}`);
            }

            let wethAddress: string | undefined = undefined;
            if (!hasWETH(env.network.name)) {
                throw new Error(`WETH not deployed on ${env.network.name}`);
            }
            wethAddress = wethAddresses[env.network.name];


            setSilent(false);

            const deployment = await env.deployLiquity(deployer, useRealPriceFeed, wethAddress, overrides);

            if (useRealPriceFeed) {
                const contracts = _connectToContracts(deployer, deployment);

                assert(!_priceFeedIsTestnet(contracts.priceFeed));

                if (hasOracles(env.network.name)) {
                    console.log(`Hooking up PriceFeed with oracles ...`);

                    const pythCallerAddress = await deployPythCaller(
                        deployer,
                        getContractFactory(env),
                        oracleAddresses[env.network.name].pyth,
                        overrides
                    );

                    const supraCallerAddress = await deploySupraCaller(
                        deployer,
                        getContractFactory(env),
                        oracleAddresses[env.network.name].supra,
                        overrides
                    );

                    console.log(oracleAddresses[env.network.name].pyth)

                    const tx = await contracts.priceFeed.setAddresses(
                        pythCallerAddress,
                        supraCallerAddress,
                        overrides
                    );

                    await tx.wait();
                }
            }

            fs.mkdirSync(path.join("deployments", channel), {recursive: true});

            fs.writeFileSync(
                path.join("deployments", channel, `${env.network.name}.json`),
                JSON.stringify(deployment, undefined, 2)
            );

            console.log();
            console.log(deployment);

        }
    );

export default config;
