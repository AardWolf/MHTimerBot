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
let WHOIS;

test('commands - whois', suite => {
    let logStubs;
    let hunterStubs;
    suite.test('Test Suite Setup', t => {
        logStubs = stubLogger();
        hunterStubs = stubHunterRegistry();

        // Now that we have stubs active, we can require the test subject.
        WHOIS = require('../../src/commands/whois');
        t.end();
    });

    suite.test('when channel is text - when replying - signals caller', async t => {
        t.plan(2);

        const messageStub = mockMessage({ channelType: 'GUILD_TEXT' });
        const result = await WHOIS.execute(messageStub, []);
        t.true(result.replied, 'should reply');
        t.false(result.sentDm, 'should reply publically');

        sinon.reset();
    });
    suite.test('when channel#send fails - logs error', async t => {
        t.plan(3);

        const messageStub = mockMessage({ sendStub: sinon.stub().rejects(Error('oops!')) });
        await WHOIS.execute(messageStub, []);
        t.strictEqual(logStubs.error.callCount, 1, 'should log error');
        const [description, err] = logStubs.error.getCall(0).args;
        t.match(description, /failed to send/, 'should indicate error source');
        t.match(err.message, /oops!/, 'should log error from Message.channel#send');

        sinon.reset();
    });
    suite.test('when channel#send fails - flags bot error', async t => {
        t.plan(1);

        const messageStub = mockMessage({ sendStub: sinon.stub().rejects(Error('oops!')) });
        const result = await WHOIS.execute(messageStub, []);
        t.true(result.botError, 'should indicate bot error');

        sinon.reset();
    });
    suite.test('when called with a number - calls getHuntersByProperty with type "hid"', async t => {
        t.plan(4);

        const messageStub = mockMessage();
        const sendToken = ['1'];
        hunterStubs.getHuntersByProperty.returns([]);
        await WHOIS.execute(messageStub, sendToken);
        t.strictEqual(hunterStubs.getHuntersByProperty.callCount, 1, 'should call getHuntersByProperty');
        const [type, tokens, limit] = hunterStubs.getHuntersByProperty.getCall(0).args;
        t.deepEqual(tokens, sendToken[0], 'Called with first token argument');
        t.strictEqual(type, 'hid', 'Called out to do a hunter id lookup');
        t.strictEqual(limit, 1, 'Limited to one answer');

        sinon.reset();
    });
    suite.test('when first token starts with "snu" - calls getHuntersByProperty with type "snuid"', async t => {
        t.plan(4);

        const messageStub = mockMessage();
        const sendToken = ['snuid', 1];
        hunterStubs.getHuntersByProperty.returns([]);
        await WHOIS.execute(messageStub, sendToken);
        t.strictEqual(hunterStubs.getHuntersByProperty.callCount, 1, 'should call getHuntersByProperty');
        const [type, tokens, limit] = hunterStubs.getHuntersByProperty.getCall(0).args;
        t.deepEqual(tokens, 1, 'Called with second token argument');
        t.strictEqual(type, 'snuid', 'Called out to do a snuid lookup');
        t.strictEqual(limit, 1, 'Limited to one answer');

        sinon.reset();
    });
    suite.test('when first token starts with "snu" - when alpha input - calls getHuntersByProperty with type "snuid"', async t => {
        t.plan(4);

        const messageStub = mockMessage();
        const sendToken = ['snuid', 'a'];
        hunterStubs.getHuntersByProperty.returns([]);
        await WHOIS.execute(messageStub, sendToken);
        t.strictEqual(hunterStubs.getHuntersByProperty.callCount, 1, 'should call getHuntersByProperty with alpha arg');
        const [type, tokens, limit] = hunterStubs.getHuntersByProperty.getCall(0).args;
        t.deepEqual(tokens, 'a', 'Called with original alpha argument');
        t.strictEqual(type, 'snuid', 'Called out to do a snuid lookup');
        t.strictEqual(limit, 1, 'Limited to one answer');

        sinon.reset();
    });
    suite.test('when first token starts with "snu" - when multiple args - calls getHuntersByProperty with type "snuid"', async t => {
        t.plan(4);

        const messageStub = mockMessage();
        const sendToken = ['snuid', 1, 3, 'a'];
        hunterStubs.getHuntersByProperty.returns([]);
        await WHOIS.execute(messageStub, sendToken);
        t.strictEqual(hunterStubs.getHuntersByProperty.callCount, 1, 'should call findHunter with both args');
        const [type, tokens, limit] = hunterStubs.getHuntersByProperty.getCall(0).args;
        t.deepEqual(tokens, 1, 'Called with only the first token');
        t.strictEqual(type, 'snuid', 'Called out to do a snuid lookup');
        t.strictEqual(limit, 1, 'Limited to one answer');

        sinon.reset();
    });
    suite.test('when first token is "in" - calls getHuntersByProperty with type "location" ', async t => {
        t.plan(3);

        const messageStub = mockMessage();
        const sendToken = ['in', 'trouble'];
        hunterStubs.getHuntersByProperty.returns([]);
        await WHOIS.execute(messageStub, sendToken);
        t.strictEqual(hunterStubs.getHuntersByProperty.callCount, 1, 'should call getHuntersByProperty');
        const [type, tokens] = hunterStubs.getHuntersByProperty.getCall(0).args;
        t.strictEqual(type, 'location', 'Called out to do a location lookup');
        t.strictEqual(tokens, 'trouble', 'Called with original alpha argument');
        hunterStubs.getHuntersByProperty.reset();
        sinon.reset();
    });
    suite.test('when first token is "a" - calls getHuntersByProperty with type "rank" ', async t => {
        t.plan(3);

        const messageStub = mockMessage();
        const sendToken = ['a', 'nerd'];
        hunterStubs.getHuntersByProperty.returns([]);
        await WHOIS.execute(messageStub, sendToken);
        t.strictEqual(hunterStubs.getHuntersByProperty.callCount, 1, 'should call getHuntersByProperty');
        const [type, tokens] = hunterStubs.getHuntersByProperty.getCall(0).args;
        t.strictEqual(type, 'rank', 'Called out to do a location lookup');
        t.strictEqual(tokens, 'nerd', 'Called with original alpha argument');
        hunterStubs.getHuntersByProperty.reset();
        sinon.reset();
    });

    suite.test('Restore Loggers - whois', t => {
        restoreHunterRegistry(hunterStubs);
        restoreLogger(logStubs);
        t.end();
    });
});
