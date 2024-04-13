const hre = require("hardhat");

async function main() {
    const Caller = await hre.ethers.getContractFactory("PriceFeed");
    const caller = await Caller.deploy();

    await caller.deployed();
    console.log("Caller deployed to:", caller.address);

    const setTx = await caller.setAddresses("0xA2aa501b19aff244D90cc15a4Cf739D2725B5729", "0x6Cd59830AAD978446e6cc7f6cc173aF7656Fb917");
    console.log(setTx);

}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });