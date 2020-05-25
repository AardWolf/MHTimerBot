const test = require('tape');
const sinon = require('sinon');

// Stub Logger methods to minimize crosstalk.
const { stubLogger, restoreLogger } = require('../helpers/logging');
// Stub hunter registry methods.
const { stubHunterRegistry, restoreHunterRegistry } = require('../helpers/hunters');
// We need a decently realistic Message stub.
const mockMessage = require('../helpers/mock-message');

// Declaration of what we're testing.
/** @type {{ execute: (Message, tokens: string[] ) => Promise<import('../../src/interfaces/command-result')>}} */
let IAM;

test('commands - IAM', suite => {
    let logStubs;
    let hunterStubs;
    suite.test('Test Suite Setup', t => {
        logStubs = stubLogger();
        hunterStubs = stubHunterRegistry();

        // Now that we have stubs active, we can require the test subject.
        IAM = require('../../src/commands/iam');
        t.end();
    });

    suite.test('when channel#send fails - logs error', async t => {
        t.plan(3);

        const messageStub = mockMessage({ sendStub: sinon.stub().rejects(Error('oops!')) });
        await IAM.execute(messageStub, []);
        t.strictEqual(logStubs.error.callCount, 1, 'should log error');
        const [description, err] = logStubs.error.getCall(0).args;
        t.match(description, /failed to send/, 'should indicate error source');
        t.match(err.message, /oops!/, 'should log error from Message.channel#send');

        sinon.reset();
    });
    suite.test('when channel#send fails - flags bot error', async t => {
        t.plan(1);

        const messageStub = mockMessage({ sendStub: sinon.stub().rejects(Error('oops!')) });
        const result = await IAM.execute(messageStub, []);
        t.true(result.botError, 'should indicate bot error');

        sinon.reset();
    });
    suite.test('when called with exactly "not" - calls unsetHunterID', async t => {
        t.plan(1);

        const messageStub = mockMessage();
        await IAM.execute(messageStub, ['not']);
        t.strictEqual(hunterStubs.unsetHunterID.callCount, 1, 'should call unsetHunterID');

        sinon.reset();
    });
    suite.test('when first token is "not" - when multiple args - does nothing', async t => {
        t.plan(Object.values(hunterStubs).length);

        const messageStub = mockMessage();
        await IAM.execute(messageStub, ['not', 'cool']);
        Object.entries(hunterStubs).forEach(([name, stub]) => t.strictEqual(stub.callCount, 0, `should not call ${name}`));

        sinon.reset();
    });

    suite.test('Restore Loggers', t => {
        restoreHunterRegistry(hunterStubs);
        restoreLogger(logStubs);
        t.end();
    });
});
