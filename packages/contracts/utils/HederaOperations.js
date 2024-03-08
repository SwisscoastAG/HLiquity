const {AccountId, Client, PrivateKey, TokenAssociateTransaction, TokenId, TransferTransaction} = require("@hashgraph/sdk");

async function associateTokenWithAccount(tokenAddress, account) {
    const accountId = AccountId.fromString(account.accountId);
    const accountKey = PrivateKey.fromStringECDSA(account.privateKey);
    const client = Client.forLocalNode().setOperator(accountId, accountKey);


    const associateTx = await new TokenAssociateTransaction()
        .setAccountId(accountId)
        .setTokenIds([TokenId.fromSolidityAddress(tokenAddress)])
        .freezeWith(client)
        .sign(accountKey)
    const associateTxSubmit = await associateTx.execute(client);
    const associateRx = await associateTxSubmit.getReceipt(client);
    console.log(
        `Manual Association for ${accountId}: ${associateRx.status.toString()} \n`,
    );
}

async function transferToken(tokenAddress, account, receiverAddress, amount){
    const accountId = AccountId.fromString(account.accountId);
    const accountKey = PrivateKey.fromStringECDSA(account.privateKey);
    const client = Client.forLocalNode().setOperator(accountId, accountKey);

    const transaction = await new TransferTransaction()
        .addTokenTransfer(TokenId.fromSolidityAddress(tokenAddress), accountId, -Number(amount * 10 ** 8))
        .addTokenTransfer(TokenId.fromSolidityAddress(tokenAddress), AccountId.fromString(receiverAddress), Number(amount * 10 ** 8))
        .freezeWith(client).sign(accountKey);
    const txResponse = await transaction.execute(client);
    const receipt = await txResponse.getReceipt(client);
    console.log(`Manual Transfer: ${receipt.status.toString()} \n`);
}

module.exports = { associateTokenWithAccount, transferToken };