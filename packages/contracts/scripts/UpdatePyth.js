const hre = require("hardhat");
const { EvmPriceServiceConnection } = require("@pythnetwork/pyth-evm-js");
const {ethers} = require("hardhat");


async function main() {
    const [deployer] = await ethers.getSigners();

    const connection = new EvmPriceServiceConnection("https://hermes.pyth.network");
    const priceIds = ["0x3728e591097635310e6341af53db8b7ee42da9b3a8d918f9463ce9cca886dfbd" , "0x0b1e3297e69f162877b577b0d6a47a0d63b2392bc8499e6540da4187a63e28f8"]
    const priceFeedUpdateData = await connection.getPriceFeedsUpdateData(
        priceIds
    );
    const abi = [
        {
            "anonymous": false,
            "inputs": [
                {
                    "indexed": false,
                    "internalType": "uint16",
                    "name": "chainId",
                    "type": "uint16"
                },
                {
                    "indexed": false,
                    "internalType": "uint64",
                    "name": "sequenceNumber",
                    "type": "uint64"
                }
            ],
            "name": "BatchPriceFeedUpdate",
            "type": "event"
        },
        {
            "anonymous": false,
            "inputs": [
                {
                    "indexed": true,
                    "internalType": "bytes32",
                    "name": "id",
                    "type": "bytes32"
                },
                {
                    "indexed": false,
                    "internalType": "uint64",
                    "name": "publishTime",
                    "type": "uint64"
                },
                {
                    "indexed": false,
                    "internalType": "int64",
                    "name": "price",
                    "type": "int64"
                },
                {
                    "indexed": false,
                    "internalType": "uint64",
                    "name": "conf",
                    "type": "uint64"
                }
            ],
            "name": "PriceFeedUpdate",
            "type": "event"
        },
        {
            "inputs": [
                {
                    "internalType": "bytes32",
                    "name": "id",
                    "type": "bytes32"
                }
            ],
            "name": "getEmaPrice",
            "outputs": [
                {
                    "components": [
                        {
                            "internalType": "int64",
                            "name": "price",
                            "type": "int64"
                        },
                        {
                            "internalType": "uint64",
                            "name": "conf",
                            "type": "uint64"
                        },
                        {
                            "internalType": "int32",
                            "name": "expo",
                            "type": "int32"
                        },
                        {
                            "internalType": "uint256",
                            "name": "publishTime",
                            "type": "uint256"
                        }
                    ],
                    "internalType": "struct PythStructs.Price",
                    "name": "price",
                    "type": "tuple"
                }
            ],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [
                {
                    "internalType": "bytes32",
                    "name": "id",
                    "type": "bytes32"
                },
                {
                    "internalType": "uint256",
                    "name": "age",
                    "type": "uint256"
                }
            ],
            "name": "getEmaPriceNoOlderThan",
            "outputs": [
                {
                    "components": [
                        {
                            "internalType": "int64",
                            "name": "price",
                            "type": "int64"
                        },
                        {
                            "internalType": "uint64",
                            "name": "conf",
                            "type": "uint64"
                        },
                        {
                            "internalType": "int32",
                            "name": "expo",
                            "type": "int32"
                        },
                        {
                            "internalType": "uint256",
                            "name": "publishTime",
                            "type": "uint256"
                        }
                    ],
                    "internalType": "struct PythStructs.Price",
                    "name": "price",
                    "type": "tuple"
                }
            ],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [
                {
                    "internalType": "bytes32",
                    "name": "id",
                    "type": "bytes32"
                }
            ],
            "name": "getEmaPriceUnsafe",
            "outputs": [
                {
                    "components": [
                        {
                            "internalType": "int64",
                            "name": "price",
                            "type": "int64"
                        },
                        {
                            "internalType": "uint64",
                            "name": "conf",
                            "type": "uint64"
                        },
                        {
                            "internalType": "int32",
                            "name": "expo",
                            "type": "int32"
                        },
                        {
                            "internalType": "uint256",
                            "name": "publishTime",
                            "type": "uint256"
                        }
                    ],
                    "internalType": "struct PythStructs.Price",
                    "name": "price",
                    "type": "tuple"
                }
            ],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [
                {
                    "internalType": "bytes32",
                    "name": "id",
                    "type": "bytes32"
                }
            ],
            "name": "getPrice",
            "outputs": [
                {
                    "components": [
                        {
                            "internalType": "int64",
                            "name": "price",
                            "type": "int64"
                        },
                        {
                            "internalType": "uint64",
                            "name": "conf",
                            "type": "uint64"
                        },
                        {
                            "internalType": "int32",
                            "name": "expo",
                            "type": "int32"
                        },
                        {
                            "internalType": "uint256",
                            "name": "publishTime",
                            "type": "uint256"
                        }
                    ],
                    "internalType": "struct PythStructs.Price",
                    "name": "price",
                    "type": "tuple"
                }
            ],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [
                {
                    "internalType": "bytes32",
                    "name": "id",
                    "type": "bytes32"
                },
                {
                    "internalType": "uint256",
                    "name": "age",
                    "type": "uint256"
                }
            ],
            "name": "getPriceNoOlderThan",
            "outputs": [
                {
                    "components": [
                        {
                            "internalType": "int64",
                            "name": "price",
                            "type": "int64"
                        },
                        {
                            "internalType": "uint64",
                            "name": "conf",
                            "type": "uint64"
                        },
                        {
                            "internalType": "int32",
                            "name": "expo",
                            "type": "int32"
                        },
                        {
                            "internalType": "uint256",
                            "name": "publishTime",
                            "type": "uint256"
                        }
                    ],
                    "internalType": "struct PythStructs.Price",
                    "name": "price",
                    "type": "tuple"
                }
            ],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [
                {
                    "internalType": "bytes32",
                    "name": "id",
                    "type": "bytes32"
                }
            ],
            "name": "getPriceUnsafe",
            "outputs": [
                {
                    "components": [
                        {
                            "internalType": "int64",
                            "name": "price",
                            "type": "int64"
                        },
                        {
                            "internalType": "uint64",
                            "name": "conf",
                            "type": "uint64"
                        },
                        {
                            "internalType": "int32",
                            "name": "expo",
                            "type": "int32"
                        },
                        {
                            "internalType": "uint256",
                            "name": "publishTime",
                            "type": "uint256"
                        }
                    ],
                    "internalType": "struct PythStructs.Price",
                    "name": "price",
                    "type": "tuple"
                }
            ],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [
                {
                    "internalType": "bytes[]",
                    "name": "updateData",
                    "type": "bytes[]"
                }
            ],
            "name": "getUpdateFee",
            "outputs": [
                {
                    "internalType": "uint256",
                    "name": "feeAmount",
                    "type": "uint256"
                }
            ],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [],
            "name": "getValidTimePeriod",
            "outputs": [
                {
                    "internalType": "uint256",
                    "name": "validTimePeriod",
                    "type": "uint256"
                }
            ],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [
                {
                    "internalType": "bytes[]",
                    "name": "updateData",
                    "type": "bytes[]"
                },
                {
                    "internalType": "bytes32[]",
                    "name": "priceIds",
                    "type": "bytes32[]"
                },
                {
                    "internalType": "uint64",
                    "name": "minPublishTime",
                    "type": "uint64"
                },
                {
                    "internalType": "uint64",
                    "name": "maxPublishTime",
                    "type": "uint64"
                }
            ],
            "name": "parsePriceFeedUpdates",
            "outputs": [
                {
                    "components": [
                        {
                            "internalType": "bytes32",
                            "name": "id",
                            "type": "bytes32"
                        },
                        {
                            "components": [
                                {
                                    "internalType": "int64",
                                    "name": "price",
                                    "type": "int64"
                                },
                                {
                                    "internalType": "uint64",
                                    "name": "conf",
                                    "type": "uint64"
                                },
                                {
                                    "internalType": "int32",
                                    "name": "expo",
                                    "type": "int32"
                                },
                                {
                                    "internalType": "uint256",
                                    "name": "publishTime",
                                    "type": "uint256"
                                }
                            ],
                            "internalType": "struct PythStructs.Price",
                            "name": "price",
                            "type": "tuple"
                        },
                        {
                            "components": [
                                {
                                    "internalType": "int64",
                                    "name": "price",
                                    "type": "int64"
                                },
                                {
                                    "internalType": "uint64",
                                    "name": "conf",
                                    "type": "uint64"
                                },
                                {
                                    "internalType": "int32",
                                    "name": "expo",
                                    "type": "int32"
                                },
                                {
                                    "internalType": "uint256",
                                    "name": "publishTime",
                                    "type": "uint256"
                                }
                            ],
                            "internalType": "struct PythStructs.Price",
                            "name": "emaPrice",
                            "type": "tuple"
                        }
                    ],
                    "internalType": "struct PythStructs.PriceFeed[]",
                    "name": "priceFeeds",
                    "type": "tuple[]"
                }
            ],
            "stateMutability": "payable",
            "type": "function"
        },
        {
            "inputs": [
                {
                    "internalType": "bytes[]",
                    "name": "updateData",
                    "type": "bytes[]"
                }
            ],
            "name": "updatePriceFeeds",
            "outputs": [],
            "stateMutability": "payable",
            "type": "function"
        },
        {
            "inputs": [
                {
                    "internalType": "bytes[]",
                    "name": "updateData",
                    "type": "bytes[]"
                },
                {
                    "internalType": "bytes32[]",
                    "name": "priceIds",
                    "type": "bytes32[]"
                },
                {
                    "internalType": "uint64[]",
                    "name": "publishTimes",
                    "type": "uint64[]"
                }
            ],
            "name": "updatePriceFeedsIfNecessary",
            "outputs": [],
            "stateMutability": "payable",
            "type": "function"
        }
    ]
    const pyth = new ethers.Contract(
        "0xa2aa501b19aff244d90cc15a4cf739d2725b5729",
        abi,
        deployer,
    )
    const updatetx = await pyth.updatePriceFeeds(priceFeedUpdateData, {gasLimit: 3000000, value: ethers.utils.parseUnits("1")})
    console.log(updatetx)

}


main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });