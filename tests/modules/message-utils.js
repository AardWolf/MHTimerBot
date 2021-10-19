// Required test imports
const test = require('tape');
const sinon = require('sinon');

const CommandResult = require('../../src/interfaces/command-result');

// Functionality to be tested.
const { addMessageReaction } = require('../../src/modules/message-utils');

test('addMessageReaction', suite => {
    // Note that `addMessageReaction` is async, and thus cannot be directly wrapped by `t.throws` or
    // `t.doesNotThrow` (since it would actually return a rejected promise, rather than throw).
    suite.test('given bad input - throws TypeError', t => {
        const inputs = [
            null,
            undefined,
            { success: true, message: {} },
            Promise.resolve(null),
            Promise.resolve(undefined),
            Promise.resolve({ success: true, message: {} }),
        ];
        t.plan(inputs.length);
        inputs.forEach(async (input) => {
            try {
                await addMessageReaction(input);
                t.fail('should throw TypeError');
            } catch (err) {
                t.ok(err instanceof TypeError, 'should throw TypeError');
            }
        });
    });
    suite.test('given CommandResult - does not throw', t => {
        const inputs = [
            new CommandResult(),
            Promise.resolve(new CommandResult()),
        ];
        t.plan(inputs.length);
        inputs.forEach(async (input) => {
            try {
                await addMessageReaction(input);
                t.pass('should not throw');
            } catch (err) {
                t.fail(err);
            }
        });
    });
    suite.test('returns CommandResult', async t => {
        t.plan(2);
        const input = new CommandResult();
        const result = await addMessageReaction(input);
        t.true(result instanceof CommandResult, 'should return a CommandResult');
        t.isNot(result, input, 'should return own CommandResult');
    });
    suite.test('when origin was DM - when replied via DM - does not react', t => {
        const inputs = [true, false];
        t.plan(inputs.length);
        inputs.forEach(async (success) => {
            const message = {
                channel: { type: 'DM' },
                react: sinon.spy(),
            };
            const input = new CommandResult({ success, sentDm: true, message });
            await addMessageReaction(input);
            t.strictEqual(message.react.callCount, 0, `should not call Message#react when command ${success ? 'succeeded' : 'failed'}`);
        });
    });
    suite.test('when origin was DM - when no reply sent - reacts', t => {
        const inputs = [
            { success: true, emoji: '✅' },
            { success: false, emoji: '❌' },
        ];
        t.plan(inputs.length * 2);
        inputs.forEach(async ({ success, emoji }) => {
            const message = {
                channel: { type: 'DM' },
                react: sinon.spy(),
            };
            const input = new CommandResult({ success, sentDm: false, message });
            await addMessageReaction(input);
            t.strictEqual(message.react.callCount, 1, `should call react when command ${success ? 'succeeded' : 'failed'}`);
            t.deepEqual(message.react.getCall(0).args, [emoji], `should react with ${emoji} when command's success=${success}`);
        });
    });
    suite.test('when origin was DM - when replied via DM - when command errored - does not react', async t => {
        t.plan(1);
        const message = {
            channel: { type: 'DM' },
            react: sinon.spy(),
        };
        const input = new CommandResult({ sentDm: true, botError: true, message });
        await addMessageReaction(input);
        t.strictEqual(message.react.callCount, 0, 'should not call Message#react even when command errors');
    });
    suite.test('when origin was DM - when no reply sent - when command errored - reacts with error sequence', t => {
        const inputs = [true, false];
        t.plan(inputs.length * 2);
        inputs.forEach(async (success) => {
            const message = {
                channel: { type: 'DM' },
                react: sinon.spy(),
            };
            const input = new CommandResult({ success, sentDm: false, botError: true, message });
            await addMessageReaction(input);
            t.strictEqual(message.react.callCount, 3, `should call react when command ${success ? 'succeeded' : 'failed'}`);
            t.deepEqual(message.react.args, [['🤖'], ['💣'], ['💥']], 'should react with bot error sequence');
        });
    });
    suite.test('when origin was public - when replied via DM - reacts', t => {
        const inputs = [
            { success: true, emoji: '✅' },
            { success: false, emoji: '❌' },
        ];
        t.plan(inputs.length * 2);
        inputs.forEach(async ({ success, emoji }) => {
            const message = {
                channel: { type: 'text' },
                react: sinon.spy(),
            };
            const input = new CommandResult({ success, sentDm: true, message });
            await addMessageReaction(input);
            t.strictEqual(message.react.callCount, 1, `should call react when command ${success ? 'succeeded' : 'failed'}`);
            t.deepEqual(message.react.getCall(0).args, [emoji], `should react with ${emoji} when command's success=${success}`);
        });
    });
    suite.test('when origin was public - when no reply sent - reacts', t => {
        const inputs = [
            { success: true, emoji: '✅' },
            { success: false, emoji: '❌' },
        ];
        t.plan(inputs.length * 2);
        inputs.forEach(async ({ success, emoji }) => {
            const message = {
                channel: { type: 'text' },
                react: sinon.spy(),
            };
            const input = new CommandResult({ success, sentDm: false, message });
            await addMessageReaction(input);
            t.strictEqual(message.react.callCount, 1, `should call react when command ${success ? 'succeeded' : 'failed'}`);
            t.deepEqual(message.react.getCall(0).args, [emoji], `should react with ${emoji} when command's success=${success}`);
        });
    });
    suite.test('when origin was public - when replied publicly - does not react', async t => {
        t.plan(1);
        const message = {
            channel: { type: 'text' },
            react: sinon.spy(),
        };
        const input = new CommandResult({ replied: true, message });
        await addMessageReaction(input);
        t.strictEqual(message.react.callCount, 0, 'should not call Message#react');
    });
    suite.test('when origin was public - when command errored -  calls react with error sequence', t => {
        const inputs = [true, false];
        t.plan(inputs.length * 2);
        inputs.forEach(async (sentDm) => {
            const message = {
                channel: { type: 'text' },
                react: sinon.spy(),
            };
            const input = new CommandResult({ sentDm, message, botError: true });
            await addMessageReaction(input);
            t.strictEqual(message.react.callCount, 3, 'should react with bot error sequence');
            t.deepEqual(message.react.args, [['🤖'], ['💣'], ['💥']], 'should react with bot error sequence');
        });
    });
    suite.test('when sending reaction - when error occurs - handles error', async t => {
        t.plan(6);
        const message = { channel : { type: 'text' }, react: sinon.stub().rejects(Error('oops!')) };
        const input = new CommandResult({ success: true, sentDm: false, message });
        const errorStub = sinon.stub(require('../../src/modules/logger'), 'error');
        const result = await addMessageReaction(input);
        t.strictEqual(errorStub.callCount, 1, 'should log error from Message#react');
        const [description, err, givenResult] = errorStub.getCall(0).args;
        t.match(description, /Failed to react to input message/, 'should describe error');
        t.match(err.message, /oops!/, 'should log error from Message#react');
        t.same(givenResult, input, 'should log input command result');
        t.true(result.botError, 'should signal bot error to caller');
        t.false(result.success, 'should signal unsuccessful result to caller');
    });
    suite.test('Module Cleanup', t => {
        sinon.restore();
        t.end();
    });
});
