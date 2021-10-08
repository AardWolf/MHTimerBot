const test = require('tape');
const sinon = require('sinon');
const { Permissions } = require('discord.js');

// Stub Logger methods to minimize crosstalk.
const { stubLogger, restoreLogger } = require('../helpers/logging');
// Stub hunter registry methods.
const { stubHunterRegistry, restoreHunterRegistry } = require('../helpers/hunters');
// We need a decently realistic Message stub.
const mockMessage = require('../helpers/mock-message');
const mockMember = require('../helpers/mock-member');

// Declaration of what we're testing.
/** @type {{ execute: (Message, tokens: string[] ) => Promise<import('../../src/interfaces/command-result')>}} */
let NOTIAM;

test('commands - NOTIAM', suite => {
    let logStubs;
    let hunterStubs;
    suite.test('Test Suite Setup', t => {
        logStubs = stubLogger();
        hunterStubs = stubHunterRegistry();
        hunterStubs.cleanHunters.returns('Clean cycle complete');

        // Now that we have stubs active, we can require the test subject.
        NOTIAM = require('../../src/commands/notiam');
        t.end();
    });

    suite.test('when user is owner; no args - fails', async t => {
        t.plan(3);

        const messageStub = mockMessage({ authorId: '1' });
        const memberStub = mockMember({ memberId: '1' });
        messageStub.guild = memberStub.guild;
        messageStub.client = memberStub.client;
        messageStub.member = memberStub;
        const result = await NOTIAM.execute(messageStub, []);
        t.true(result.replied, 'should reply to owner');
        t.strictEqual(messageStub.channel.send.callCount, 1, 'should call channel.send');
        const reply = messageStub.channel.send.getCall(0).args[0];
        t.match(reply, /You have permissions to use this command but not like that./, 'should return settings');

        sinon.reset();
    });
    suite.test('when user is owner; clean, calls cleanHunters', async t => {
        t.plan(2);

        const messageStub = mockMessage({ authorId: '1' });
        const memberStub = mockMember({ memberId: '1' });
        messageStub.guild = memberStub.guild;
        messageStub.client = memberStub.client;
        messageStub.member = memberStub;
        hunterStubs.cleanHunters.returns('Clean cycle complete');
        const result = await NOTIAM.execute(messageStub, ['clean']);
        t.true(result.replied, 'should reply to owner');
        t.strictEqual(hunterStubs.cleanHunters.callCount, 1, 'should call cleanHunters');

        sinon.reset();
    });
    // Testing deeper functionality would require deeper stubs
    suite.test('when user is admin; no args - fails', async t => {
        t.plan(3);

        const messageStub = mockMessage();
        const memberStub = mockMember();
        memberStub.permissions.has.withArgs(Permissions.FLAGS.ADMINISTRATOR).returns(true);
        memberStub.permissions.has.withArgs(Permissions.FLAGS.MANAGE_MESSAGES).returns(false);
        const breakup = true; // does nothing, makes my editor happy
        messageStub.guild = memberStub.guild;
        messageStub.client = memberStub.client;
        messageStub.member = memberStub;
        if (!breakup)
            console.log('weird');
        const result = await NOTIAM.execute(messageStub, []);
        t.true(result.replied, 'should reply to admin');
        t.strictEqual(messageStub.channel.send.callCount, 1, 'should call channel.send');
        const reply = messageStub.channel.send.getCall(0).args[0];
        t.match(reply, /You have permissions to use this command but not like that./, 'should return settings');

        sinon.reset();
    });
    suite.test('when user is admin; clean, calls cleanHunters', async t => {
        t.plan(2);

        const messageStub = mockMessage();
        const memberStub = mockMember();
        memberStub.permissions.has.withArgs(Permissions.FLAGS.ADMINISTRATOR).returns(true);
        messageStub.guild = memberStub.guild;
        messageStub.client = memberStub.client;
        messageStub.member = memberStub;
        hunterStubs.cleanHunters.returns('Clean cycle complete');
        const result = await NOTIAM.execute(messageStub, ['clean']);
        t.true(result.replied, 'should reply to admin');
        t.strictEqual(hunterStubs.cleanHunters.callCount, 1, 'should call cleanHunters');

        sinon.reset();
    });
    suite.test('when user is mod; no args - fails', async t => {
        t.plan(3);

        const messageStub = mockMessage();
        const memberStub = mockMember();
        memberStub.permissions.has.withArgs(Permissions.FLAGS.ADMINISTRATOR).returns(false);
        memberStub.permissions.has.withArgs(Permissions.FLAGS.MANAGE_MESSAGES).returns(true);
        const breakup = true; // does nothing, makes my editor happy
        messageStub.guild = memberStub.guild;
        messageStub.client = memberStub.client;
        messageStub.member = memberStub;
        if (!breakup)
            console.log('weird');
        const result = await NOTIAM.execute(messageStub, []);
        t.true(result.replied, 'should reply to mod');
        t.strictEqual(messageStub.channel.send.callCount, 1, 'should call channel.send');
        const reply = messageStub.channel.send.getCall(0).args[0];
        t.match(reply, /You have permissions to use this command but not like that./, 'should return settings');

        sinon.reset();
    });
    suite.test('when user is mod; clean, does NOT call cleanHunters', async t => {
        t.plan(3);

        const messageStub = mockMessage();
        const memberStub = mockMember();
        memberStub.permissions.has.withArgs(Permissions.FLAGS.MANAGE_MESSAGES).returns(true);
        messageStub.guild = memberStub.guild;
        messageStub.client = memberStub.client;
        messageStub.member = memberStub;
        const result = await NOTIAM.execute(messageStub, ['clean']);
        t.true(result.replied, 'should NOT reply to mods');
        t.strictEqual(hunterStubs.cleanHunters.callCount, 0, 'should NOT call cleanHunters');
        const reply = messageStub.channel.send.getCall(0).args[0];
        t.match(reply, /not sure what to do with that./, 'should give usage error');

        sinon.reset();
    });

    suite.test('Restore Loggers - config', t => {
        restoreHunterRegistry(hunterStubs);
        restoreLogger(logStubs);
        t.end();
        // CONFIG.save();
    });
});
