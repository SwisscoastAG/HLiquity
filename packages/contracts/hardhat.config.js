require("@nomiclabs/hardhat-truffle5");
require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-etherscan");
require("solidity-coverage");
require("hardhat-gas-reporter");

const accounts = require("./hardhatAccountsList2k.js");
const accountsList = accounts.accountsList

const fs = require('fs')
const getSecret = (secretKey, defaultValue = '') => {
    const SECRETS_FILE = "./secrets.js"
    let secret = defaultValue
    if (fs.existsSync(SECRETS_FILE)) {
        const {secrets} = require(SECRETS_FILE)
        if (secrets[secretKey]) {
            secret = secrets[secretKey]
        }
    }

    return secret
}
const alchemyUrl = () => {
    return `https://eth-mainnet.alchemyapi.io/v2/${getSecret('alchemyAPIKey')}`
}

const alchemyUrlRinkeby = () => {
    return `https://eth-rinkeby.alchemyapi.io/v2/${getSecret('alchemyAPIKeyRinkeby')}`
}

module.exports = {
    paths: {
        // contracts: "./contracts",
        // artifacts: "./artifacts"
    },
    solidity: {
        compilers: [
            {
                version: "0.4.23",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 100
                    }
                }
            },
            {
                version: "0.5.17",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 100
                    }
                }
            },
            {
                version: "0.6.11",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 100
                    }
                }
            },
        ]
    },
    networks: {
        hardhat: {
            accounts: accountsList,
            gas: 10000000,  // tx gas limit
            blockGasLimit: 15000000,
            gasPrice: 20000000000,
            initialBaseFeePerGas: 0,
        },
        mainnet: {
            url: alchemyUrl(),
            gasPrice: process.env.GAS_PRICE ? parseInt(process.env.GAS_PRICE) : 20000000000,
            accounts: [
                getSecret('DEPLOYER_PRIVATEKEY', '0x60ddfe7f579ab6867cbe7a2dc03853dc141d7a4ab6dbefc0dae2d2b1bd4e487f'),
                getSecret('ACCOUNT2_PRIVATEKEY', '0x3ec7cedbafd0cb9ec05bf9f7ccfa1e8b42b3e3a02c75addfccbfeb328d1b383b')
            ]
        },
        rinkeby: {
            url: alchemyUrlRinkeby(),
            gas: 10000000,  // tx gas limit
            accounts: [getSecret('RINKEBY_DEPLOYER_PRIVATEKEY', '0x60ddfe7f579ab6867cbe7a2dc03853dc141d7a4ab6dbefc0dae2d2b1bd4e487f')]
        },
        hederaTestnet: {
            url: "https://testnet.hashio.io/api",
            gas: 14.5e6,
            blockGasLimit: 34e6,
            gasPrice: 1490000000000,
            chainId: 296,
            timeout: 1000000,
            accounts: ['3d5410259092c2fd609239cababe3ef4690f48057aba853c0da7ed6cedae835a', '4c01eff6764673ab79a4cbfb954801f7d4ae8538a6496896ce72b73e6b63b0d4', 'aaf63f1eac2a78e34cee46e7ee90bb51fe7dbf36e6e4da7edb6c952e24abe484', '3b6f552386dc800cef28e2a02e1aff4774480e718a2d30b092d011eb6e0d4418']
        },
        hederaLocalTestnet: {
            url: 'http://localhost:7546',
            accounts: ['0x45a5a7108a18dd5013cf2d5857a28144beadc9c70b3bdbd914e38df4e804b8d8','0x6e9d61a325be3f6675cf8b7676c70e4a004d2308e3e182370a41f5653d52c6bd','0x0b58b1bd44469ac9f813b5aeaf6213ddaea26720f0b2f133d08b6f234130a64f','0x95eac372e0f0df3b43740fa780e62458b2d2cc32d6a440877f1cc2a9ad0c35cc','0x6c6e6727b40c8d4b616ab0d26af357af09337299f09c66704146e14236972106','0x5072e7aa1b03f531b4731a32a021f6a5d20d5ddc4e55acbb71ae202fc6f3a26d','0x6ec1f2e7d126a74a1d2ff9e1c5d90b92378c725e506651ff8bb8616a5c724628','0xb4d7f7e82f61d81c95985771b8abf518f9328d019c36849d4214b5f995d13814','0x941536648ac10d5734973e94df413c17809d6cc5e24cd11e947e685acfbd12ae','0x5829cf333ef66b6bdd34950f096cb24e06ef041c5f63e577b4f3362309125863','0x8fc4bffe2b40b2b7db7fd937736c4575a0925511d7a0a2dfc3274e8c17b41d20','0xb6c10e2baaeba1fa4a8b73644db4f28f4bf0912cceb6e8959f73bb423c33bd84','0xfe8875acb38f684b2025d5472445b8e4745705a9e7adc9b0485a05df790df700','0xbdc6e0a69f2921a78e9af930111334a41d3fab44653c8de0775572c526feea2d','0x3e215c3d2a59626a669ed04ec1700f36c05c9b216e592f58bbfd3d8aa6ea25f9'],
            chainId: 298,
            timeout: 90000,
            blockGasLimit: 34e6,
            gas: 14.5e6,
            gasPrice: 1490000000000,
        },
    },
    etherscan: {
        apiKey: getSecret("ETHERSCAN_API_KEY")
    },
    mocha: {timeout: 12000000},
    rpc: {
        host: "localhost",
        port: 8545
    },
    gasReporter: {
        enabled: (process.env.REPORT_GAS) ? true : false
    }
};
