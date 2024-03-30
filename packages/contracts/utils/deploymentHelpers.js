const SortedTroves = artifacts.require("./SortedTroves.sol")
const TroveManager = artifacts.require("./TroveManager.sol")
const PriceFeedTestnet = artifacts.require("./PriceFeedTestnet.sol")
const LUSDToken = artifacts.require("./DCHFToken.sol")
const ActivePool = artifacts.require("./ActivePool.sol");
const DefaultPool = artifacts.require("./DefaultPool.sol");
const StabilityPool = artifacts.require("./StabilityPool.sol")
const GasPool = artifacts.require("./GasPool.sol")
const CollSurplusPool = artifacts.require("./CollSurplusPool.sol")
const FunctionCaller = artifacts.require("./TestContracts/FunctionCaller.sol")
const BorrowerOperations = artifacts.require("./BorrowerOperations.sol")
const HintHelpers = artifacts.require("./HintHelpers.sol")

const LQTYStaking = artifacts.require("./HLQTStaking.sol")
const LQTYToken = artifacts.require("./HLQTToken.sol")
const LockupContractFactory = artifacts.require("./LockupContractFactory.sol")
const CommunityIssuance = artifacts.require("./CommunityIssuance.sol")

const Unipool = artifacts.require("./Unipool.sol")

const LQTYTokenTester = artifacts.require("./HLQTTokenTester.sol")
const CommunityIssuanceTester = artifacts.require("./CommunityIssuanceTester.sol")
const StabilityPoolTester = artifacts.require("./StabilityPoolTester.sol")
const ActivePoolTester = artifacts.require("./ActivePoolTester.sol")
const DefaultPoolTester = artifacts.require("./DefaultPoolTester.sol")
const LiquityMathTester = artifacts.require("./LiquityMathTester.sol")
const BorrowerOperationsTester = artifacts.require("./BorrowerOperationsTester.sol")
const TroveManagerTester = artifacts.require("./TroveManagerTester.sol")
const LUSDTokenTester = artifacts.require("./DCHFTokenTester.sol")

// Proxy scripts
const BorrowerOperationsScript = artifacts.require('BorrowerOperationsScript')
const BorrowerWrappersScript = artifacts.require('BorrowerWrappersScript')
const TroveManagerScript = artifacts.require('TroveManagerScript')
const StabilityPoolScript = artifacts.require('StabilityPoolScript')
const TokenScript = artifacts.require('TokenScript')
const LQTYStakingScript = artifacts.require('HLQTStakingScript')
const {
    buildUserProxies,
    BorrowerOperationsProxy,
    BorrowerWrappersProxy,
    TroveManagerProxy,
    StabilityPoolProxy,
    SortedTrovesProxy,
    TokenProxy,
    LQTYStakingProxy
} = require('../utils/proxyHelpers.js')
const {ethers, contract} = require("hardhat");
const {HEDERA_LOCAL_TESTNET_ACCOUNTS} = require("./HederaAccounts");
const {associateTokenWithAccount} = require("./HederaOperations");

/* "Liquity core" consists of all contracts in the core Liquity system.

LQTY contracts consist of only those contracts related to the LQTY Token:

-the LQTY token
-the Lockup factory and lockup contracts
-the LQTYStaking contract
-the CommunityIssuance contract 
*/

const ZERO_ADDRESS = '0x' + '0'.repeat(40)
const maxBytes32 = '0x' + 'f'.repeat(64)

class DeploymentHelper {

    static async deployLiquityCore() {
        const cmdLineArgs = process.argv
        const frameworkPath = cmdLineArgs[1]
        // console.log(`Framework used:  ${frameworkPath}`)

        if (frameworkPath.includes("hardhat")) {
            return this.deployLiquityCoreHardhat()
        } else if (frameworkPath.includes("truffle")) {
            return this.deployLiquityCoreTruffle()
        }
    }

    static async deployLQTYContracts(bountyAddress, lpRewardsAddress, multisigAddress) {
        const cmdLineArgs = process.argv
        const frameworkPath = cmdLineArgs[1]
        // console.log(`Framework used:  ${frameworkPath}`)

        if (frameworkPath.includes("hardhat")) {
            return this.deployLQTYContractsHardhat(bountyAddress, lpRewardsAddress, multisigAddress)
        } else if (frameworkPath.includes("truffle")) {
            return this.deployLQTYContractsTruffle(bountyAddress, lpRewardsAddress, multisigAddress)
        }
    }

    static async deployLiquityCoreHardhat() {
        const priceFeedTestnet = await PriceFeedTestnet.new()
        console.log("PriceFeedTestnet deployed:", priceFeedTestnet.address)
        const sortedTroves = await SortedTroves.new()
        console.log("SortedTroves deployed:", sortedTroves.address)
        const troveManager = await TroveManager.new()
        console.log("TroveManager deployed:", troveManager.address)
        const activePool = await ActivePool.new()
        console.log("ActivePool deployed:", activePool.address)
        const stabilityPool = await StabilityPool.new()
        console.log("StabilityPool deployed:", stabilityPool.address)
        const defaultPool = await DefaultPool.new()
        console.log("DefaultPool deployed:", defaultPool.address)
        const collSurplusPool = await CollSurplusPool.new()
        console.log("CollSurplusPool deployed:", collSurplusPool.address)
        const functionCaller = await FunctionCaller.new()
        console.log("FunctionCaller deployed:", functionCaller.address)
        const borrowerOperations = await BorrowerOperations.new()
        console.log("BorrowerOperations deployed:", borrowerOperations.address)
        const hintHelpers = await HintHelpers.new()
        console.log("HintHelpers deployed:", hintHelpers.address)
        const lusdToken = await LUSDToken.new(
            troveManager.address,
            stabilityPool.address,
            borrowerOperations.address,
            {value: ethers.utils.parseEther("10")}
        )
        console.log("LUSDToken deployed:", lusdToken.address)

        LUSDToken.setAsDeployed(lusdToken)
        DefaultPool.setAsDeployed(defaultPool)
        PriceFeedTestnet.setAsDeployed(priceFeedTestnet)
        SortedTroves.setAsDeployed(sortedTroves)
        TroveManager.setAsDeployed(troveManager)
        ActivePool.setAsDeployed(activePool)
        StabilityPool.setAsDeployed(stabilityPool)
        CollSurplusPool.setAsDeployed(collSurplusPool)
        FunctionCaller.setAsDeployed(functionCaller)
        BorrowerOperations.setAsDeployed(borrowerOperations)
        HintHelpers.setAsDeployed(hintHelpers)

        const coreContracts = {
            priceFeedTestnet,
            lusdToken,
            sortedTroves,
            troveManager,
            activePool,
            stabilityPool,
            defaultPool,
            collSurplusPool,
            functionCaller,
            borrowerOperations,
            hintHelpers
        }
        return coreContracts
    }
    static async deployTesterContractsHardhat() {
        const testerContracts = {}

        // Contract without testers (yet)
        testerContracts.priceFeedTestnet = await PriceFeedTestnet.new()
        testerContracts.sortedTroves = await SortedTroves.new()
        // Actual tester contracts
        testerContracts.communityIssuance = await CommunityIssuanceTester.new()
        testerContracts.activePool = await ActivePoolTester.new()
        testerContracts.defaultPool = await DefaultPoolTester.new()
        testerContracts.stabilityPool = await StabilityPoolTester.new()
        testerContracts.gasPool = await GasPool.new()
        testerContracts.collSurplusPool = await CollSurplusPool.new()
        testerContracts.math = await LiquityMathTester.new()
        testerContracts.borrowerOperations = await BorrowerOperationsTester.new()
        testerContracts.troveManager = await TroveManagerTester.new()
        testerContracts.functionCaller = await FunctionCaller.new()
        testerContracts.hintHelpers = await HintHelpers.new()
        testerContracts.lusdToken = await LUSDTokenTester.new(
            testerContracts.troveManager.address,
            testerContracts.stabilityPool.address,
            testerContracts.borrowerOperations.address
        )
        return testerContracts
    }

    static async deployLQTYContractsHardhat(bountyAddress, lpRewardsAddress, multisigAddress) {
        const lqtyStaking = await LQTYStaking.new()
        const lockupContractFactory = await LockupContractFactory.new()
        const communityIssuance = await CommunityIssuance.new()

        LQTYStaking.setAsDeployed(lqtyStaking)
        LockupContractFactory.setAsDeployed(lockupContractFactory)
        CommunityIssuance.setAsDeployed(communityIssuance)

        // Deploy LQTY Token, passing Community Issuance and Factory addresses to the constructor
        const lqtyToken = await LQTYToken.new(
            communityIssuance.address,
            lqtyStaking.address,
            lockupContractFactory.address,
            bountyAddress,
            lpRewardsAddress,
            multisigAddress
        )
        LQTYToken.setAsDeployed(lqtyToken)

        const LQTYContracts = {
            lqtyStaking,
            lockupContractFactory,
            communityIssuance,
            lqtyToken
        }
        return LQTYContracts
    }

    static async deployLQTYTesterContractsHardhat(multisigAddress) {
        const lqtyStaking = await LQTYStaking.new()
        const lockupContractFactory = await LockupContractFactory.new()
        const communityIssuance = await CommunityIssuanceTester.new()

        LQTYStaking.setAsDeployed(lqtyStaking)
        LockupContractFactory.setAsDeployed(lockupContractFactory)
        CommunityIssuanceTester.setAsDeployed(communityIssuance)

        // Deploy LQTY Token, passing Community Issuance and Factory addresses to the constructor
        const lqtyToken = await LQTYTokenTester.new(
            communityIssuance.address,
            lqtyStaking.address,
            lockupContractFactory.address,
            multisigAddress,
            {value: ethers.utils.parseEther("10")}
        )
        LQTYTokenTester.setAsDeployed(lqtyToken)

        const LQTYContracts = {
            lqtyStaking,
            lockupContractFactory,
            communityIssuance,
            lqtyToken
        }
        return LQTYContracts
    }

    static async deployLiquityCoreTruffle() {
        const priceFeedTestnet = await PriceFeedTestnet.new()
        const sortedTroves = await SortedTroves.new()
        const troveManager = await TroveManager.new()
        const activePool = await ActivePool.new()
        const stabilityPool = await StabilityPool.new()
        const gasPool = await GasPool.new()
        const defaultPool = await DefaultPool.new()
        const collSurplusPool = await CollSurplusPool.new()
        const functionCaller = await FunctionCaller.new()
        const borrowerOperations = await BorrowerOperations.new()
        const hintHelpers = await HintHelpers.new()
        const lusdToken = await LUSDToken.new(
            troveManager.address,
            stabilityPool.address,
            borrowerOperations.address
        )
        const coreContracts = {
            priceFeedTestnet,
            lusdToken,
            sortedTroves,
            troveManager,
            activePool,
            stabilityPool,
            gasPool,
            defaultPool,
            collSurplusPool,
            functionCaller,
            borrowerOperations,
            hintHelpers
        }
        return coreContracts
    }

    static async deployLQTYContractsTruffle(bountyAddress, lpRewardsAddress, multisigAddress) {
        const lqtyStaking = await lqtyStaking.new()
        const lockupContractFactory = await LockupContractFactory.new()
        const communityIssuance = await CommunityIssuance.new()

        /* Deploy LQTY Token, passing Community Issuance,  LQTYStaking, and Factory addresses
        to the constructor  */
        const lqtyToken = await LQTYToken.new(
            communityIssuance.address,
            lqtyStaking.address,
            lockupContractFactory.address,
            bountyAddress,
            lpRewardsAddress,
            multisigAddress
        )

        const LQTYContracts = {
            lqtyStaking,
            lockupContractFactory,
            communityIssuance,
            lqtyToken
        }
        return LQTYContracts
    }

    static async deployLUSDToken(contracts) {
        contracts.lusdToken = await LUSDToken.new(
            contracts.troveManager.address,
            contracts.stabilityPool.address,
            contracts.borrowerOperations.address
        )
        return contracts
    }

    static async deployLUSDTokenTester(contracts) {
        contracts.lusdToken = await LUSDTokenTester.new(
            contracts.troveManager.address,
            contracts.stabilityPool.address,
            contracts.borrowerOperations.address,
            {value: ethers.utils.parseEther("10")}
        )
        console.log("LUSDToken deployed:", contracts.lusdToken.address)

        return contracts
    }

    static async deployGasPool(contracts) {
        const gasPool = await GasPool.new(contracts.lusdToken.address, contracts.troveManager.address, contracts.borrowerOperations.address)
        console.log("GasPool deployed:", gasPool.address)

        GasPool.setAsDeployed(gasPool)
        contracts.gasPool = gasPool;
        return contracts;
    }

    static async deployProxyScripts(contracts, LQTYContracts, owner, users) {
        const proxies = await buildUserProxies(users)

        const borrowerWrappersScript = await BorrowerWrappersScript.new(
            contracts.borrowerOperations.address,
            contracts.troveManager.address,
            LQTYContracts.lqtyStaking.address
        )
        contracts.borrowerWrappers = new BorrowerWrappersProxy(owner, proxies, borrowerWrappersScript.address)

        const borrowerOperationsScript = await BorrowerOperationsScript.new(contracts.borrowerOperations.address)
        contracts.borrowerOperations = new BorrowerOperationsProxy(owner, proxies, borrowerOperationsScript.address, contracts.borrowerOperations)

        const troveManagerScript = await TroveManagerScript.new(contracts.troveManager.address)
        contracts.troveManager = new TroveManagerProxy(owner, proxies, troveManagerScript.address, contracts.troveManager)

        const stabilityPoolScript = await StabilityPoolScript.new(contracts.stabilityPool.address)
        contracts.stabilityPool = new StabilityPoolProxy(owner, proxies, stabilityPoolScript.address, contracts.stabilityPool)

        contracts.sortedTroves = new SortedTrovesProxy(owner, proxies, contracts.sortedTroves)

        const lusdTokenScript = await TokenScript.new(contracts.lusdToken.address)
        contracts.lusdToken = new TokenProxy(owner, proxies, lusdTokenScript.address, contracts.lusdToken)

        const lqtyTokenScript = await TokenScript.new(LQTYContracts.lqtyToken.address)
        LQTYContracts.lqtyToken = new TokenProxy(owner, proxies, lqtyTokenScript.address, LQTYContracts.lqtyToken)

        const lqtyStakingScript = await LQTYStakingScript.new(LQTYContracts.lqtyStaking.address)
        LQTYContracts.lqtyStaking = new LQTYStakingProxy(owner, proxies, lqtyStakingScript.address, LQTYContracts.lqtyStaking)
    }

    // Connect contracts to their dependencies
    static async connectCoreContracts(contracts, LQTYContracts) {

        // set TroveManager addr in SortedTroves
        await contracts.sortedTroves.setParams(
            maxBytes32,
            contracts.troveManager.address,
            contracts.borrowerOperations.address
        )

        // set contract addresses in the FunctionCaller
        await contracts.functionCaller.setTroveManagerAddress(contracts.troveManager.address)
        await contracts.functionCaller.setSortedTrovesAddress(contracts.sortedTroves.address)

        // set contracts in the Trove Manager
        await contracts.troveManager.setAddresses(
            contracts.borrowerOperations.address,
            contracts.activePool.address,
            contracts.defaultPool.address,
            contracts.stabilityPool.address,
            contracts.gasPool.address,
            contracts.collSurplusPool.address,
            contracts.priceFeedTestnet.address,
            contracts.lusdToken.address,
            contracts.sortedTroves.address,
            LQTYContracts.lqtyToken.address,
            LQTYContracts.lqtyStaking.address
        )

        // set contracts in BorrowerOperations
        await contracts.borrowerOperations.setAddresses(
            contracts.troveManager.address,
            contracts.activePool.address,
            contracts.defaultPool.address,
            contracts.stabilityPool.address,
            contracts.gasPool.address,
            contracts.collSurplusPool.address,
            contracts.priceFeedTestnet.address,
            contracts.sortedTroves.address,
            contracts.lusdToken.address,
            LQTYContracts.lqtyStaking.address
        )

        // set contracts in the Pools
        await contracts.stabilityPool.setAddresses(
            contracts.borrowerOperations.address,
            contracts.troveManager.address,
            contracts.activePool.address,
            contracts.lusdToken.address,
            contracts.sortedTroves.address,
            contracts.priceFeedTestnet.address,
            LQTYContracts.communityIssuance.address
        )

        await contracts.activePool.setAddresses(
            contracts.borrowerOperations.address,
            contracts.troveManager.address,
            contracts.stabilityPool.address,
            contracts.defaultPool.address
        )

        await contracts.defaultPool.setAddresses(
            contracts.troveManager.address,
            contracts.activePool.address,
        )

        await contracts.collSurplusPool.setAddresses(
            contracts.borrowerOperations.address,
            contracts.troveManager.address,
            contracts.activePool.address,
        )

        // set contracts in HintHelpers
        await contracts.hintHelpers.setAddresses(
            contracts.sortedTroves.address,
            contracts.troveManager.address
        )
    }

    static async connectLQTYContracts(LQTYContracts) {
        // Set LQTYToken address in LCF
        await LQTYContracts.lockupContractFactory.setHLQTTokenAddress(LQTYContracts.lqtyToken.address);
    }

    static async connectLQTYContractsToCore(LQTYContracts, coreContracts, bountyAddress, lpRewardsAddress, multisigAddress) {
        await LQTYContracts.lqtyStaking.setAddresses(
            LQTYContracts.lqtyToken.address,
            coreContracts.lusdToken.address,
            coreContracts.troveManager.address,
            coreContracts.borrowerOperations.address,
            coreContracts.activePool.address
        )

        await LQTYContracts.communityIssuance.setAddresses(
            LQTYContracts.lqtyToken.address,
            coreContracts.stabilityPool.address
        )


        const tokenAddress = await LQTYContracts.lqtyToken.getTokenAddress()
        const bountyAccount = HEDERA_LOCAL_TESTNET_ACCOUNTS.find(acc => acc.publicAddress.toLowerCase() === bountyAddress.toLowerCase());
        await associateTokenWithAccount(tokenAddress, bountyAccount);
        const lpRewardsAccount = HEDERA_LOCAL_TESTNET_ACCOUNTS.find(acc => acc.publicAddress.toLowerCase() === lpRewardsAddress.toLowerCase());
        await associateTokenWithAccount(tokenAddress, lpRewardsAccount)
        const multisigAccount = HEDERA_LOCAL_TESTNET_ACCOUNTS.find(acc => acc.publicAddress.toLowerCase() === multisigAddress.toLowerCase());
        await associateTokenWithAccount(tokenAddress, multisigAccount)

        // initialize lqty token and mint
        await LQTYContracts.lqtyToken.initialize(bountyAddress, lpRewardsAddress);
    }

    static async connectUnipool(uniPool, LQTYContracts, uniswapPairAddr, duration) {
        await uniPool.setParams(LQTYContracts.lqtyToken.address, uniswapPairAddr, duration)
    }
}

module.exports = DeploymentHelper
