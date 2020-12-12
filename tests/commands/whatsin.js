const test = require('tape');
const sinon = require('sinon');

// Stub Logger methods to minimize crosstalk.
const { stubLogger, restoreLogger } = require('../helpers/logging');
// Stub hunter registry methods.
const { stubConvertiblesLookup, restoreConvertiblesLookup } = require('../helpers/whatsin');
// We need a decently realistic Message stub.
const mockMessage = require('../helpers/mock-message');

// Declaration of what we're testing.
/** @type {{ execute: (Message, tokens: string[] ) => Promise<import('../../src/interfaces/command-result')>}} */
let WHATSIN;

test('commands - whatsin', suite => {
    let logStubs;
    let whatsinStubs;

    suite.test('Test Suite Setup', t => {
        logStubs = stubLogger();
        whatsinStubs = stubConvertiblesLookup();

        WHATSIN = require('../../src/commands/whatsin');
        t.end();
    });

    suite.test('when channel is text - when replying - signals caller', async t => {
        t.plan(2);

        const messageStub = mockMessage({ channelType: 'text' });
        const result = await WHATSIN.execute(messageStub, []);
        t.true(result.replied, 'should reply');
        t.false(result.sentDm, 'should reply publically');

        sinon.reset();
    });

    suite.test('when channel is dm - when replying - signals caller', async t => {
        t.plan(2);

        const messageStub = mockMessage({ channelType: 'dm' });
        const result = await WHATSIN.execute(messageStub, []);
        t.true(result.replied, 'should reply');
        t.true(messageStub.channel.send.calledOnce, 'Should use the channel send');

        sinon.reset();
    });

    suite.test('when channel#send fails - logs error', async t => {
        t.plan(4);

        const messageStub = mockMessage({ sendStub: sinon.stub().rejects(Error('oops!')) });
        const result = await WHATSIN.execute(messageStub, []);
        t.strictEqual(logStubs.error.callCount, 1, 'should log error');
        const [description, err] = logStubs.error.getCall(0).args;
        t.match(description, /failed to send/, 'should indicate error source');
        t.match(err.message, /oops!/, 'should log error from Message.channel#send');
        t.true(result.botError, 'should indicate bot error');

        sinon.reset();
    });

    suite.test('when called with 10th, should call getConvertibles and sendInteractiveSearchResult', async t => {
        t.plan(3);

        const messageStub = mockMessage({ channelType: 'text' });
        whatsinStubs.getConvertibles.returns(['10th Birthday Duffle Bag']);
        await WHATSIN.execute(messageStub, ['10th']);
        t.strictEqual(whatsinStubs.getConvertibles.callCount, 1, 'should call getConvertibles');
        t.strictEqual(whatsinStubs.sendInteractiveSearchResult.callCount, 1, 'should call sendInteractiveSearchResult');

        sinon.reset();
    });

    suite.test('Restore Loggers - whatsin', t => {
        restoreConvertiblesLookup(whatsinStubs);
        restoreLogger(logStubs);
        t.end();
    });
});