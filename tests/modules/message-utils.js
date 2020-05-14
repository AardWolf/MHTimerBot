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
    // TODO: tests with mock messages that 1) call react with checkmark, 2) call react with X, 3) call react with error sequence
});
