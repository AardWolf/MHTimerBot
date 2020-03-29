// Required test imports
const test = require('tape');
const sinon = require('sinon');

// Functionality to be tested.
const {
    oxfordStringifyValues,
    // prettyPrintArrayAsString,
    // splitString,
    // timeLeft,
} = require('../../src/modules/format-utils');

test('oxfordStringifyValues', suite => {
    suite.test('given non-object input - throws TypeError', t => {
        const inputs = [
            'hello world',
            true,
            undefined,
            0,
            () => {},
        ];
        t.plan(inputs.length);
        inputs.forEach(input => t.throws(
            () => oxfordStringifyValues('hello world'),
            TypeError,
            `should throw for ${typeof input}`,
        ));
    });
    suite.test('given empty object - returns empty string', t => {
        const inputs = [
            [],
            new Set(),
            new Map(),
            {},
        ];
        t.plan(inputs.length);
        inputs.forEach(input => t.deepEqual(
            oxfordStringifyValues(input),
            '',
            `should return nullstring for empty ${input.constructor.name}`,
        ));
    });
    suite.test('given 1 item - returns item as string', t => {
        const inputs = [
            'string',
            1,
            true,
            null,
            { key: 'value' },
            undefined,
            function foo () {},
        ];
        t.plan(inputs.length);
        inputs.forEach(input => t.deepEqual(
            oxfordStringifyValues([input]),
            String(input),
            `should convert ${typeof input} to string`,
        ));
    });
    suite.test('given 2 items - given no `final` - defaults final to "and"', t => {
        t.plan(1);
        const input = ['you', 'me'];
        const expected = 'you and me';
        t.deepEqual(oxfordStringifyValues(input), expected, 'should default to "and"');
    });
    suite.test('given 2 items - given custom final - uses custom final', t => {
        t.plan(1);
        const input = ['you', 'me'];
        const expected = 'you or me';
        t.deepEqual(oxfordStringifyValues(input, 'or'), expected, 'should use input `final`');
    });
    suite.test('given N items - when N > 2 - uses N-1 commas', t => {
        const inputs = [
            [1, 2, 3],
            new Set(['a', 'b', 'c']),
            new Map([[0, 'a0'], [1, 'a1'], [2, 'a2']]),
        ];
        t.plan(inputs.length);
        inputs.forEach(input => t.deepEqual(
            [...oxfordStringifyValues(input)].filter(char => char === ',').length,
            (input.length || input.size) - 1,
            'should use N-1 commas',
        ));
    });
    suite.test('given Map instance - consumes only values', t => {
        t.plan(1);
        const map = new Map([
            ['planet', 'earth'],
            ['hello', 'world'],
        ]);
        t.deepEqual(oxfordStringifyValues(map), 'earth and world', 'should use map\'s values');
    });
});


// Remove all stubs / spies.
sinon.restore();
