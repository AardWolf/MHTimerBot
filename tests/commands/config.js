const test = require('tape');
const sinon = require('sinon');
const { Permissions } = require('discord.js');

// Stub Logger methods to minimize crosstalk.
const { stubLogger, restoreLogger } = require('../helpers/logging');
// We need a decently realistic Message stub.
const mockMessage = require('../helpers/mock-message');
const mockMember = require('../helpers/mock-member');

// Declaration of what we're testing.
/** @type {{ execute: (Message, tokens: string[] ) => Promise<import('../../src/interfaces/command-result')>}} */
let CONFIG;

const stubAsOwner = () => {
    const memberStub = mockMember({ memberId: '1' });
    const messageStub = mockMessage({ authorId: '1', clientStub: memberStub.client });
    messageStub.guild = memberStub.guild;
    messageStub.member = memberStub;
    return messageStub;
};

function stubAsAdmin() {
    const memberStub = mockMember();
    const messageStub = mockMessage({ clientStub: memberStub.client });
    messageStub.guild = memberStub.guild;
    messageStub.member = memberStub;
    memberStub.permissions.has.withArgs(Permissions.FLAGS.ADMINISTRATOR).returns(true);
    memberStub.permissions.has.withArgs(Permissions.FLAGS.MANAGE_MESSAGES).returns(true);
    return messageStub;
}

test('commands - config', suite => {
    let logStubs;
    suite.test('Test Suite Setup', t => {
        logStubs = stubLogger();

        // Now that we have stubs active, we can require the test subject.
        CONFIG = require('../../src/commands/config');
        t.end();
    });

    suite.test('when user is not owner, admin, mod - fail', async t => {
        t.teardown(() => sinon.reset());
        t.plan(3);

        const messageStub = mockMessage();
        const memberStub = mockMember();
        messageStub.guild = memberStub.guild;
        messageStub.client = memberStub.client;
        memberStub.permissions.has.withArgs(Permissions.FLAGS.ADMINISTRATOR).returns(false);
        memberStub.permissions.has.withArgs(Permissions.FLAGS.MANAGE_MESSAGES).returns(false);
        const result = await CONFIG.execute(messageStub, []);
        t.true(result.replied, 'should reply to random user');
        t.strictEqual(messageStub.channel.send.callCount, 1, 'should call channel.send');
        const reply = messageStub.channel.send.getCall(0).args[0];
        t.match(reply, /Just who do you think you are?/, 'should fail');
    });

    suite.test('when user is mod - fail', async t => {
        t.teardown(() => sinon.reset());
        t.plan(3);

        const messageStub = mockMessage();
        const memberStub = mockMember();
        messageStub.guild = memberStub.guild;
        messageStub.client = memberStub.client;
        memberStub.permissions.has.withArgs(Permissions.FLAGS.ADMINISTRATOR).returns(false);
        memberStub.permissions.has.withArgs(Permissions.FLAGS.MANAGE_MESSAGES).returns(true);

        const result = await CONFIG.execute(messageStub, []);

        t.true(result.replied, 'should reply to mod');
        t.strictEqual(messageStub.channel.send.callCount, 1, 'should call channel.send');
        const reply = messageStub.channel.send.getCall(0).args[0];
        t.match(reply, /Just who do you think you are?/, 'should not work for mods');
    });

    suite.test('when user is owner; no args - view', async t => {
        t.teardown(() => sinon.reset());
        t.plan(3);
        const messageStub = stubAsOwner();

        const result = await CONFIG.execute(messageStub, []);

        t.true(result.replied, 'should reply to owner');
        t.strictEqual(messageStub.channel.send.callCount, 1, 'should call channel.send');
        const reply = messageStub.channel.send.getCall(0).args[0];
        t.match(reply, /adminrole/, 'should return settings');
    });

    suite.test('when user is owner; prefix, 1 token shows current prefix', async t => {
        t.teardown(() => sinon.reset());
        t.plan(3);
        const messageStub = stubAsOwner();

        const result = await CONFIG.execute(messageStub, ['prefix']);

        t.true(result.replied, 'should reply to owner');
        t.strictEqual(messageStub.channel.send.callCount, 1, 'should call channel.send');
        const reply = messageStub.channel.send.getCall(0).args[0];
        t.match(reply, /Current prefix for this server/, 'should return settings');
    });

    suite.test('when user is owner; prefix, 2 tokens sets prefix', async t => {
        t.teardown(() => sinon.reset());
        t.plan(3);
        const messageStub = stubAsOwner();

        const result = await CONFIG.execute(messageStub, ['prefix', '-mh2']);

        t.true(result.replied, 'should reply to owner');
        t.strictEqual(messageStub.channel.send.callCount, 1, 'should call channel.send');
        const reply = messageStub.channel.send.getCall(0).args[0];
        t.match(reply, /New prefix for this server after the bot restarts/, 'should announce change to setting');
    });

    suite.test('when user is admin; no args - view', async t => {
        t.teardown(() => sinon.reset());
        t.plan(3);
        const messageStub = stubAsAdmin();

        const result = await CONFIG.execute(messageStub, []);

        t.true(result.replied, 'should reply to admin');
        t.strictEqual(messageStub.channel.send.callCount, 1, 'should call channel.send');
        const reply = messageStub.channel.send.getCall(0).args[0];
        t.match(reply, /adminrole/, 'should return settings');
    });

    suite.test('when user is admin; prefix, 1 token shows current prefix', async t => {
        t.teardown(() => sinon.reset());
        t.plan(3);
        const messageStub = stubAsAdmin();

        const result = await CONFIG.execute(messageStub, ['prefix']);

        t.true(result.replied, 'should reply to admin');
        t.strictEqual(messageStub.channel.send.callCount, 1, 'should call channel.send');
        const reply = messageStub.channel.send.getCall(0).args[0];
        t.match(reply, /Current prefix for this server/, 'should return settings');
    });

    suite.test('when user is admin; prefix, 2 tokens sets prefix', async t => {
        t.teardown(() => sinon.reset());
        t.plan(3);
        const messageStub = stubAsAdmin();

        const result = await CONFIG.execute(messageStub, ['prefix', '-mh2']);

        t.true(result.replied, 'should reply to admin');
        t.strictEqual(messageStub.channel.send.callCount, 1, 'should call channel.send');
        const reply = messageStub.channel.send.getCall(0).args[0];
        t.match(reply, /New prefix for this server after the bot restarts/, 'should announce change to setting');
    });

    suite.test('when user is admin; timers; 1 token shows timers', async t => {
        t.teardown(() => sinon.reset());
        t.plan(3);
        const messageStub = stubAsAdmin();

        const result = await CONFIG.execute(messageStub, ['timers']);

        t.true(result.replied);
        t.strictEqual(messageStub.channel.send.callCount, 1, 'should call channel.send');
        const reply = messageStub.channel.send.getCall(0).args[0];
        t.match(reply, /Timer channels for this server:/, 'should list timers');
    });

    suite.test('when user is admin; timers; add w/o channel', async t => {
        t.teardown(() => sinon.reset());
        t.plan(3);
        const messageStub = stubAsAdmin();

        const result = await CONFIG.execute(messageStub, ['timers', 'add']);

        t.true(result.replied);
        t.strictEqual(messageStub.channel.send.callCount, 1, 'should call channel.send');
        const reply = messageStub.channel.send.getCall(0).args[0];
        t.match(reply, /I don't think you gave me a channel to add/, 'should request channel mention');
    });

    suite.test('when user is admin; timers; remove w/o channel', async t => {
        t.teardown(() => sinon.reset());
        t.plan(3);
        const messageStub = stubAsAdmin();

        const result = await CONFIG.execute(messageStub, ['timers', 'remove']);

        t.true(result.replied);
        t.strictEqual(messageStub.channel.send.callCount, 1, 'should call channel.send');
        const reply = messageStub.channel.send.getCall(0).args[0];
        t.match(reply, /I don't think you gave me a channel to remove/, 'should request channel mention');
    });

    suite.teardown(() => {
        suite.comment('Restore Loggers - config');
        restoreLogger(logStubs);
    });
});
