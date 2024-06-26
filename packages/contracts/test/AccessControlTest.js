const deploymentHelper = require("../utils/deploymentHelpers.js")
const testHelpers = require("../utils/testHelpers.js")
const {ethers, network} = require("hardhat");
const {associateTokenWithAccount, transferToken} = require("../utils/HederaOperations");
const {HEDERA_LOCAL_TESTNET_ACCOUNTS} = require("../utils/HederaAccounts");
const TroveManagerTester = artifacts.require("TroveManagerTester")

const th = testHelpers.TestHelper
const timeValues = testHelpers.TimeValues

const dec = th.dec
const toBN = th.toBN
const assertRevert = th.assertRevert

/* The majority of access control tests are contained in this file. However, tests for restrictions 
on the Liquity admin address's capabilities during the first year are found in:

test/launchSequenceTest/DuringLockupPeriodTest.js */

contract('Access Control: Liquity functions with the caller restricted to Liquity contract(s)', async accounts => {

    const [owner, alice, bob, carol] = accounts;
    const bountyAddress = bob;
    const lpRewardsAddress = carol;
    const multisig = owner;

    let coreContracts

    let priceFeed
    let lusdToken
    let sortedTroves
    let troveManager
    let nameRegistry
    let activePool
    let stabilityPool
    let defaultPool
    let functionCaller
    let borrowerOperations

    let lqtyStaking
    let lqtyToken
    let communityIssuance
    let lockupContractFactory

    before(async () => {
        coreContracts = await deploymentHelper.deployLiquityCore()
        coreContracts.troveManager = await TroveManagerTester.new()
        coreContracts = await deploymentHelper.deployLUSDTokenTester(coreContracts)
        coreContracts = await deploymentHelper.deployGasPool(coreContracts);
        const LQTYContracts = await deploymentHelper.deployLQTYTesterContractsHardhat(multisig)

        priceFeed = coreContracts.priceFeed
        lusdToken = coreContracts.lusdToken
        sortedTroves = coreContracts.sortedTroves
        troveManager = coreContracts.troveManager
        nameRegistry = coreContracts.nameRegistry
        activePool = coreContracts.activePool
        stabilityPool = coreContracts.stabilityPool
        defaultPool = coreContracts.defaultPool
        functionCaller = coreContracts.functionCaller
        borrowerOperations = coreContracts.borrowerOperations

        lqtyStaking = LQTYContracts.lqtyStaking
        lqtyToken = LQTYContracts.lqtyToken
        communityIssuance = LQTYContracts.communityIssuance
        lockupContractFactory = LQTYContracts.lockupContractFactory

        await deploymentHelper.connectLQTYContracts(LQTYContracts)
        await deploymentHelper.connectCoreContracts(coreContracts, LQTYContracts)
        await deploymentHelper.connectLQTYContractsToCore(LQTYContracts, coreContracts, bountyAddress, lpRewardsAddress, multisig)

        for (account of accounts.slice(0, 3)) {
            const hederaAccount = HEDERA_LOCAL_TESTNET_ACCOUNTS.find(acc => acc.publicAddress.toLowerCase() === account.toLowerCase());
            await associateTokenWithAccount(await coreContracts.lusdToken.getTokenAddress(), hederaAccount)
            await th.openTrove(coreContracts, {
                extraLUSDAmount: toBN(dec(20000, 8)),
                ICR: toBN(dec(2, 8)),
                extraParams: {from: account}
            })
        }

        const expectedCISupplyCap = '3200000000000000' // 32mil

        // Check CI has been properly funded
        const bal = await lqtyToken.balanceOf(communityIssuance.address)
        assert.equal(bal, expectedCISupplyCap)
    })

    describe('BorrowerOperations', async accounts => {
        it("moveETHGainToTrove(): reverts when called by an account that is not StabilityPool", async () => {
            // Attempt call from alice
            try {
                const tx1 = await borrowerOperations.moveETHGainToTrove(bob, bob, bob, {from: bob})
            } catch (err) {
                assert.include(err.message, "revert")
                // assert.include(err.message, "BorrowerOps: Caller is not Stability Pool")
            }
        })
    })

    describe('TroveManager', async accounts => {
        // applyPendingRewards
        it("applyPendingRewards(): reverts when called by an account that is not BorrowerOperations", async () => {
            // Attempt call from alice
            try {
                const txAlice = await troveManager.applyPendingRewards(bob, {from: alice})

            } catch (err) {
                assert.include(err.message, "revert")
                // assert.include(err.message, "Caller is not the BorrowerOperations contract")
            }
        })

        // updateRewardSnapshots
        it("updateRewardSnapshots(): reverts when called by an account that is not BorrowerOperations", async () => {
            // Attempt call from alice
            try {
                const txAlice = await troveManager.updateTroveRewardSnapshots(bob, {from: alice})

            } catch (err) {
                assert.include(err.message, "revert")
                // assert.include(err.message, "Caller is not the BorrowerOperations contract")
            }
        })

        // removeStake
        it("removeStake(): reverts when called by an account that is not BorrowerOperations", async () => {
            // Attempt call from alice
            try {
                const txAlice = await troveManager.removeStake(bob, {from: alice})

            } catch (err) {
                assert.include(err.message, "revert")
                // assert.include(err.message, "Caller is not the BorrowerOperations contract")
            }
        })

        // updateStakeAndTotalStakes
        it("updateStakeAndTotalStakes(): reverts when called by an account that is not BorrowerOperations", async () => {
            // Attempt call from alice
            try {
                const txAlice = await troveManager.updateStakeAndTotalStakes(bob, {from: alice})

            } catch (err) {
                assert.include(err.message, "revert")
                // assert.include(err.message, "Caller is not the BorrowerOperations contract")
            }
        })

        // closeTrove
        it("closeTrove(): reverts when called by an account that is not BorrowerOperations", async () => {
            // Attempt call from alice
            try {
                const txAlice = await troveManager.closeTrove(bob, {from: alice})

            } catch (err) {
                assert.include(err.message, "revert")
                // assert.include(err.message, "Caller is not the BorrowerOperations contract")
            }
        })

        // addTroveOwnerToArray
        it("addTroveOwnerToArray(): reverts when called by an account that is not BorrowerOperations", async () => {
            // Attempt call from alice
            try {
                const txAlice = await troveManager.addTroveOwnerToArray(bob, {from: alice})

            } catch (err) {
                assert.include(err.message, "revert")
                // assert.include(err.message, "Caller is not the BorrowerOperations contract")
            }
        })

        // setTroveStatus
        it("setTroveStatus(): reverts when called by an account that is not BorrowerOperations", async () => {
            // Attempt call from alice
            try {
                const txAlice = await troveManager.setTroveStatus(bob, 1, {from: alice})

            } catch (err) {
                assert.include(err.message, "revert")
                // assert.include(err.message, "Caller is not the BorrowerOperations contract")
            }
        })

        // increaseTroveColl
        it("increaseTroveColl(): reverts when called by an account that is not BorrowerOperations", async () => {
            // Attempt call from alice
            try {
                const txAlice = await troveManager.increaseTroveColl(bob, 100, {from: alice})

            } catch (err) {
                assert.include(err.message, "revert")
                // assert.include(err.message, "Caller is not the BorrowerOperations contract")
            }
        })

        // decreaseTroveColl
        it("decreaseTroveColl(): reverts when called by an account that is not BorrowerOperations", async () => {
            // Attempt call from alice
            try {
                const txAlice = await troveManager.decreaseTroveColl(bob, 100, {from: alice})

            } catch (err) {
                assert.include(err.message, "revert")
                // assert.include(err.message, "Caller is not the BorrowerOperations contract")
            }
        })

        // increaseTroveDebt
        it("increaseTroveDebt(): reverts when called by an account that is not BorrowerOperations", async () => {
            // Attempt call from alice
            try {
                const txAlice = await troveManager.increaseTroveDebt(bob, 100, {from: alice})

            } catch (err) {
                assert.include(err.message, "revert")
                // assert.include(err.message, "Caller is not the BorrowerOperations contract")
            }
        })

        // decreaseTroveDebt
        it("decreaseTroveDebt(): reverts when called by an account that is not BorrowerOperations", async () => {
            // Attempt call from alice
            try {
                const txAlice = await troveManager.decreaseTroveDebt(bob, 100, {from: alice})

            } catch (err) {
                assert.include(err.message, "revert")
                // assert.include(err.message, "Caller is not the BorrowerOperations contract")
            }
        })
    })

    describe('ActivePool', async accounts => {
        // sendETH
        it("sendETH(): reverts when called by an account that is not BO nor TroveM nor SP", async () => {
            // Attempt call from alice
            try {
                const txAlice = await activePool.sendETH(alice, 100, {from: alice})
            } catch (err) {
                assert.include(err.message, "revert")
                //assert.include(err.message, "Caller is neither BorrowerOperations nor TroveManager nor StabilityPool")
            }
        })

        // increaseDCHF
        it("increaseLUSDDebt(): reverts when called by an account that is not BO nor TroveM", async () => {
            // Attempt call from alice
            try {
                const txAlice = await activePool.increaseDCHFDebt(100, {from: alice})

            } catch (err) {
                assert.include(err.message, "revert")
                //assert.include(err.message, "Caller is neither BorrowerOperations nor TroveManager")
            }
        })

        // decreaseLUSD
        it("decreaseLUSDDebt(): reverts when called by an account that is not BO nor TroveM nor SP", async () => {
            // Attempt call from alice
            try {
                const txAlice = await activePool.decreaseDCHFDebt(100, {from: alice})

            } catch (err) {
                assert.include(err.message, "revert")
                //assert.include(err.message, "Caller is neither BorrowerOperations nor TroveManager nor StabilityPool")
            }
        })

        // fallback (payment)
        it("fallback(): reverts when called by an account that is not Borrower Operations nor Default Pool", async () => {
            // Attempt call from alice
            try {
                const txAlice = await web3.eth.sendTransaction({
                    from: alice,
                    to: activePool.address,
                    value: 100000000000
                })

            } catch (err) {
                assert.include(err.message, "revert")
                //assert.include(err.message, "ActivePool: Caller is neither BO nor Default Pool")
            }
        })
    })

    describe('DefaultPool', async accounts => {
        // sendETHToActivePool
        it("sendETHToActivePool(): reverts when called by an account that is not TroveManager", async () => {
            // Attempt call from alice
            try {
                const txAlice = await defaultPool.sendETHToActivePool(100, {from: alice})

            } catch (err) {
                assert.include(err.message, "revert")
                //assert.include(err.message, "Caller is not the TroveManager")
            }
        })

        // increaseLUSD
        it("increaseLUSDDebt(): reverts when called by an account that is not TroveManager", async () => {
            // Attempt call from alice
            try {
                const txAlice = await defaultPool.increaseDCHFDebt(100, {from: alice})

            } catch (err) {
                assert.include(err.message, "revert")
                //assert.include(err.message, "Caller is not the TroveManager")
            }
        })

        // decreaseLUSD
        it("decreaseLUSD(): reverts when called by an account that is not TroveManager", async () => {
            // Attempt call from alice
            try {
                const txAlice = await defaultPool.decreaseDCHFDebt(100, {from: alice})

            } catch (err) {
                assert.include(err.message, "revert")
                //assert.include(err.message, "Caller is not the TroveManager")
            }
        })

        // fallback (payment)
        it("fallback(): reverts when called by an account that is not the Active Pool", async () => {
            // Attempt call from alice
            try {
                const txAlice = await web3.eth.sendTransaction({
                    from: alice,
                    to: defaultPool.address,
                    value: 100000000000
                })

            } catch (err) {
                assert.include(err.message, "reverted")
                //assert.include(err.message, "DefaultPool: Caller is not the ActivePool")
            }
        })
    })

    describe('StabilityPool', async accounts => {
        // --- onlyTroveManager ---

        // offset
        it("offset(): reverts when called by an account that is not TroveManager", async () => {
            // Attempt call from alice
            try {
                txAlice = await stabilityPool.offset(100, 10, {from: alice})
                assert.fail(txAlice)
            } catch (err) {
                assert.include(err.message, "revert")
                //assert.include(err.message, "Caller is not TroveManager")
            }
        })

        // --- onlyActivePool ---

        // fallback (payment)
        it("fallback(): reverts when called by an account that is not the Active Pool", async () => {
            // Attempt call from alice
            try {
                const txAlice = await web3.eth.sendTransaction({
                    from: alice,
                    to: stabilityPool.address,
                    value: 100000000000
                })

            } catch (err) {
                assert.include(err.message, "revert")
                //assert.include(err.message, "StabilityPool: Caller is not ActivePool")
            }
        })
    })

    describe('LUSDToken', async accounts => {

        //    mint
        it("mint(): reverts when called by an account that is not BorrowerOperations", async () => {
            // Attempt call from alice
            const txAlice = lusdToken.mint(bob, 100, {from: alice})
            await th.assertRevert(txAlice, "Caller is not BorrowerOperations")
        })

        // burn
        it("burn(): reverts when called by an account that is not BO nor TroveM nor SP", async () => {
            // Attempt call from alice
            try {
                const txAlice = await lusdToken.burn(bob, 100, {from: alice})

            } catch (err) {
                assert.include(err.message, "revert")
                // assert.include(err.message, "Caller is neither BorrowerOperations nor TroveManager nor StabilityPool")
            }
        })

        // sendToPool
        it("sendToPool(): reverts when called by an account that is not StabilityPool", async () => {
            // Attempt call from alice
            try {
                const txAlice = await lusdToken.sendToPool(bob, activePool.address, 100, {from: alice})

            } catch (err) {
                assert.include(err.message, "revert")
                //assert.include(err.message, "Caller is not the StabilityPool")
            }
        })

        // returnFromPool
        it("returnFromPool(): reverts when called by an account that is not TroveManager nor StabilityPool", async () => {
            // Attempt call from alice
            try {
                const txAlice = await lusdToken.returnFromPool(activePool.address, bob, 100, {from: alice})

            } catch (err) {
                assert.include(err.message, "revert")
                // assert.include(err.message, "Caller is neither TroveManager nor StabilityPool")
            }
        })
    })

    describe('SortedTroves', async accounts => {
        // --- onlyBorrowerOperations ---
        //     insert
        it("insert(): reverts when called by an account that is not BorrowerOps or TroveM", async () => {
            // Attempt call from alice
            try {
                const txAlice = await sortedTroves.insert(bob, '150000000000000000000', bob, bob, {from: alice})

            } catch (err) {
                assert.include(err.message, "revert")
                //assert.include(err.message, " Caller is neither BO nor TroveM")
            }
        })

        // --- onlyTroveManager ---
        // remove
        it("remove(): reverts when called by an account that is not TroveManager", async () => {
            // Attempt call from alice
            try {
                const txAlice = await sortedTroves.remove(bob, {from: alice})

            } catch (err) {
                assert.include(err.message, "revert")
                //assert.include(err.message, " Caller is not the TroveManager")
            }
        })

        // --- onlyTroveMorBM ---
        // reinsert
        it("reinsert(): reverts when called by an account that is neither BorrowerOps nor TroveManager", async () => {
            // Attempt call from alice
            try {
                const txAlice = await sortedTroves.reInsert(bob, '150000000000000000000', bob, bob, {from: alice})

            } catch (err) {
                assert.include(err.message, "revert")
                //assert.include(err.message, "Caller is neither BO nor TroveM")
            }
        })
    })

    describe('LockupContract', async accounts => {
        it("withdrawLQTY(): reverts when caller is not beneficiary", async () => {
            // deploy new LC with Carol as beneficiary
            const unlockTime = (await lqtyToken.getDeploymentStartTime()).add(toBN(timeValues.SECONDS_IN_ONE_YEAR))
            const deployedLCtx = await lockupContractFactory.deployLockupContract(
                carol,
                unlockTime,
                {from: owner})

            const LC = await th.getLCFromDeploymentTx(deployedLCtx)

            // LQTY Multisig funds the LC
            const hederaAccount = HEDERA_LOCAL_TESTNET_ACCOUNTS.find(acc => acc.publicAddress.toLowerCase() === multisig.toLowerCase());
            await transferToken(await lqtyToken.getTokenAddress(), hederaAccount, LC.address, 100)

            // Fast-forward one year, so that beneficiary can withdraw. Doesn't work in Hedera
            await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

            // Bob attempts to withdraw LQTY
            try {
                const txBob = await LC.withdrawLQTY({from: bob})

            } catch (err) {
                assert.include(err.message, "revert")
            }

            // Confirm beneficiary, Carol, can withdraw
            // const txCarol = await LC.withdrawLQTY({from: carol})
            // assert.isTrue(txCarol.receipt.status)
        })
    })

    describe('LQTYStaking', async accounts => {
        it("increaseF_LUSD(): reverts when caller is not TroveManager", async () => {
            try {
                const txAlice = await lqtyStaking.increaseF_DCHF(dec(1, 18), {from: alice})

            } catch (err) {
                assert.include(err.message, "revert")
            }
        })
    })

    describe('LQTYToken', async accounts => {
        it("sendToLQTYStaking(): reverts when caller is not the LQTYSstaking", async () => {
            // Check multisig has some LQTY
            assert.isTrue((await lqtyToken.balanceOf(multisig)).gt(toBN('0')))

            // multisig tries to call it
            try {
                const tx = await lqtyToken.sendToHLQTStaking(multisig, 1, {from: multisig})
            } catch (err) {
                assert.include(err.message, "revert")
            }

            // FF >> time one year
            await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

            // Owner transfers 1 LQTY to alice
            const aliceAccount = HEDERA_LOCAL_TESTNET_ACCOUNTS.find(acc => acc.publicAddress.toLowerCase() === alice.toLowerCase());
            await associateTokenWithAccount(await lqtyToken.getTokenAddress(), aliceAccount)

            const hederaAccount = HEDERA_LOCAL_TESTNET_ACCOUNTS.find(acc => acc.publicAddress.toLowerCase() === multisig.toLowerCase());
            await transferToken(await lqtyToken.getTokenAddress(), hederaAccount, alice, 1)


            // Alice tries to call it
            try {
                const tx = await lqtyToken.sendToHLQTStaking(alice, dec(1, 8), {from: alice})
            } catch (err) {
                assert.include(err.message, "revert")
            }
        })
    })

    describe('CommunityIssuance', async accounts => {
        it("sendLQTY(): reverts when caller is not the StabilityPool", async () => {
            const tx1 = communityIssuance.sendHLQT(alice, dec(100, 18), {from: alice})
            const tx2 = communityIssuance.sendHLQT(bob, dec(100, 18), {from: alice})
            const tx3 = communityIssuance.sendHLQT(stabilityPool.address, dec(100, 18), {from: alice})

            assertRevert(tx1)
            assertRevert(tx2)
            assertRevert(tx3)
        })

        it("issueLQTY(): reverts when caller is not the StabilityPool", async () => {
            const tx1 = communityIssuance.issueHLQT({from: alice})

            assertRevert(tx1)
        })
    })


})


