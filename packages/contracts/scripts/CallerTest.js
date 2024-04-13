const hre = require("hardhat");

async function main() {
    const Caller = await hre.ethers.getContractFactory("PythCaller");
    const caller = await Caller.deploy("0xA2aa501b19aff244D90cc15a4Cf739D2725B5729");

    await caller.deployed();
    console.log("Caller deployed to:", caller.address);

    const tx = await caller.getPythCurrentValue("0x3728e591097635310e6341af53db8b7ee42da9b3a8d918f9463ce9cca886dfbd", "0x0b1e3297e69f162877b577b0d6a47a0d63b2392bc8499e6540da4187a63e28f8")
    console.log(tx.toString());

    const CallerSupra = await hre.ethers.getContractFactory("SupraCaller");
    const callerSupra = await CallerSupra.deploy("0x6Cd59830AAD978446e6cc7f6cc173aF7656Fb917");

    await callerSupra.deployed();
    console.log("Caller deployed to:", callerSupra.address);

    const txSupra = await callerSupra.getSupraCurrentValue(75, 5012)
    console.log(txSupra.toString());
}


main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });