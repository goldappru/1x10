const GameGuess = artifacts.require("GameGuess");
const DummyContract = artifacts.require("DummyContract");

async function handleErrorTransaction(transaction) {
    let error;

    try {
        await transaction();
    } catch (e) {
        error = e;
    } finally {
        assert.isDefined(error, "Revert was not thrown out");
    }
}

const subtract = (a, b) => [a, b].map(n => [...n].reverse()).reduce((a, b) => a.reduce((r, d, i) => {
    let s = d - (b[i] || 0);
    if (s < 0) {
        s += 10;
        a[i + 1]--
    }
    return '' + s + r
}, '').replace(/^0+/, ''));

contract("GameGuess", accounts => {
    let contract;
    const value = web3.utils.toWei('5'); // 1 ether
    const unknownAccount = accounts[1];
    before(async () => contract = await GameGuess.deployed());

    async function makeBet(bet, sign, account = unknownAccount, valueOverride) {
        const value = valueOverride || web3.utils.toWei('0.01');
        const getInfo = () => Promise.all([
            web3.eth.getBalance(account),
            web3.eth.getBalance(contract.address),
            contract.userGameStats(account)
        ]);
        const [usersBalanceBefore, contractsBalanceBefore, statsBefore] = await getInfo();
        await contract.play.sendTransaction(bet, sign, {from: account, value});
        const [usersBalanceAfter, contractsBalanceAfter, statsAfter] = await getInfo();

        if (parseInt(usersBalanceAfter) < parseInt(usersBalanceBefore)) {
            console.log('Loosed');
            assert.approximately(parseInt(subtract(usersBalanceBefore, usersBalanceAfter)), parseInt(value), 100, 'Account balance mismatch. Loosed.');
            assert.approximately(parseInt(subtract(contractsBalanceAfter, contractsBalanceBefore)), parseInt(value), 100, 'Contract balance mismatch. Loosed.');
            assert.strictEqual(statsBefore.wins - statsAfter.wins, 0, 'Amount of wins mismatch. Loosed.');
            assert.strictEqual(statsAfter.loses - statsBefore.loses, 1, 'Amount of loses mismatch. Loosed.');
            assert.strictEqual(Math.abs(statsAfter.profit - statsBefore.profit).toString(), value, 'Amount of profit mismatch. Loosed.');
        } else {
            console.log('Won');
            const profit = ((Math.round((99 / (sign ? (100 - bet) : bet)).toFixed(4) * 10000) * value) / 10000) - parseInt(value);
            const accountBalanceDiff = usersBalanceAfter === usersBalanceBefore ? 0 : parseInt(subtract(usersBalanceAfter, usersBalanceBefore));
            const contractBalanceDiff = contractsBalanceBefore === contractsBalanceAfter ? 0 : parseInt(subtract(contractsBalanceBefore, contractsBalanceAfter));

            console.log(accountBalanceDiff, profit);
            assert.approximately(accountBalanceDiff, profit, 100, 'Account balance mismatch. Won.');
            assert.approximately(contractBalanceDiff, profit, 101, 'Contract balance mismatch. Won.');
            assert.strictEqual(statsAfter.wins - statsBefore.wins, 1, 'Amount of wins mismatch. Won.');
            assert.strictEqual(statsAfter.loses - statsBefore.loses, 0, 'Amount of loses mismatch. Won.');
            assert.approximately(parseInt(statsAfter.profit.sub(statsBefore.profit).toString()), profit + parseInt(value), 101, 'Amount of profit mismatch. Won.');
        }

        return true;
    }

    const callMakeBet = (i, sign) => makeBet(50, sign).then(() => (i + 1) === 99 ? null : callMakeBet(i + 1, sign));

    it("Should increase contract balance from owner's address", async () => {
        const [contractBalanceBefore, ownerBalanceBefore] = await Promise.all([web3.eth.getBalance(contract.address), web3.eth.getBalance(accounts[0])]);
        await contract.play.sendTransaction(1, false, {value});
        const [contractBalanceAfter, ownerBalanceAfter] = await Promise.all([web3.eth.getBalance(contract.address), web3.eth.getBalance(accounts[0])]);
        assert.strictEqual((ownerBalanceBefore - ownerBalanceAfter).toString(), value, "Owner balance mismatch");
        assert.strictEqual((contractBalanceAfter - contractBalanceBefore).toString(), value, "Contract balance mismatch");
    });

    it('Should get correct multipliers', async () => {
        for (let i = 1; i < 100; i++) {
            const multiplier = await contract.getMultiplier(i);
            assert.strictEqual(multiplier.toNumber(), Math.round((99 / i).toFixed(4) * 10000));
        }
    });

    // it("Should get bet result after sending ether to contract with true sign", async () => callMakeBet(1, true));
    //
    it("Should get bet result after sending ether to contract with false sign", async () => callMakeBet(1, false));

    it("Should not be able to send incorrect number as bet", () => handleErrorTransaction(() => makeBet(0)));

    it("Should not be able to send zero value as bet", () => handleErrorTransaction(() => makeBet(1, unknownAccount, web3.utils.toWei(0))));

    it("Should not be able to make bet with value more than contact's balance", () =>
        handleErrorTransaction(() => makeBet(1, unknownAccount, web3.utils.toWei(1))));

    it("Should not be able to make bet from contract's address", () =>
        handleErrorTransaction(async () => makeBet(1, (await DummyContract.deployed()).address)));

    it("Should not be able to send incorrect number as bet", async () => handleErrorTransaction(() => makeBet(0)));

    it("Should not be able to withdraw ether from unknown account", () =>
        handleErrorTransaction(async () =>
            contract.withdraw.sendTransaction(await web3.eth.getBalance(contract.address), {from: unknownAccount})));

    it("Should be able to withdraw ether from the owner", async () => {
        const [contractBalanceBefore, ownerBalanceBefore] = await Promise.all([web3.eth.getBalance(contract.address), web3.eth.getBalance(accounts[0])]);
        await contract.withdraw.sendTransaction((await web3.eth.getBalance(contract.address)).toString());
        const [contractBalanceAfter, ownerBalanceAfter] = await Promise.all([web3.eth.getBalance(contract.address), web3.eth.getBalance(accounts[0])]);

        assert.strictEqual(subtract(ownerBalanceAfter, ownerBalanceBefore).toString(), contractBalanceBefore, "Owner balance mismatch");
        assert.strictEqual(contractBalanceAfter, '0', "Contract balance mismatch");
    });

    it("Payable function should not be called from a contract", async () => {
        const dcontract = await DummyContract.new();
        await dcontract.sendTransaction({value: value.toString()});

        return handleErrorTransaction(() => dcontract.testCall.sendTransaction(contract.address));
    });
});
