// Required test imports
const test = require('tape');
// const sinon = require('sinon');

// Functionality to be tested.
const {
    oxfordStringifyValues,
    // prettyPrintArrayAsString,
    splitString,
    // timeLeft,
    unescapeEntities,
    isValidURL,
    calculateRate,
    integerComma,
    intToHuman,
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
            new Map([[0, 'a0'], [1, 'a1'], [2, 'a2'], [3, 'a3'], [4, 'a4']]),
            new Set(['a', 'b', 'c', 'd']),
            [1, 2, 3],
        ];
        t.plan(inputs.length);
        inputs.forEach(input => t.deepEqual(
            [...oxfordStringifyValues(input)].filter(char => char === ',').length,
            (input.length || input.size) - 1,
            `should use ${(input.length || input.size) - 1} commas`,
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
test('splitString', suite => {
    suite.test('given one token - returns array of token as string', t => {
        const inputs = [
            { input: 1, expected: ['1'] },
            { input: '1', expected: ['1'] },
            { input: 'one', expected: ['one'] },
            { input: true, expected: ['true'] },
            { input: String(true), expected: ['true'] },
            { input: new String(true), expected: ['true'] },
        ];
        t.plan(inputs.length);
        inputs.forEach(({ input, expected }) => t.deepEqual(splitString(input), expected));
    });
    suite.test('given "empty" input - returns empty array', t => {
        const inputs = [
            { input: '', msg: 'empty string' },
            { input: undefined, msg: 'undefined' },
            { input: '""', msg: 'matched empty double quotes' },
            { input: '"', msg: 'unmatched double quote' },
            { input: ' ', msg: 'space' },
            { input: '\t', msg: 'tab' },
            { input: '\n', msg: 'newline' },
            { input: `
`, msg: 'embedded newline' },
            { input: [], msg: 'array' },
        ];
        t.plan(inputs.length);
        inputs.forEach(({ input, msg }) => t.deepEqual(splitString(input), [], `when given ${msg}`));
    });
    suite.test('given multiple tokens - returns array of tokens as strings', t => {
        const inputs = [
            { input: 'hello world', expected: ['hello', 'world'], msg: '2 words' },
            { input: '1 2', expected: ['1', '2'], msg: '2 numbers' },
            { input: 'hello world MH', expected: ['hello', 'world', 'MH'], msg: '3 words' },
            { input: '"hello world MH"', expected: ['hello world MH'], msg: 'double-quoted phrase' },
            { input: '"hello world" MH', expected: ['hello world', 'MH'], msg: 'double-quoted phrase + add\'l word' },
            { input: '"hello" "world" "MH"', expected: ['hello', 'world', 'MH'], msg: 'individually double-quoted words' },
        ];
        t.plan(inputs.length);
        inputs.forEach(({ input, expected, msg }) => t.deepEqual(
            splitString(input), expected, `when given ${msg}`,
        ));
    });
    suite.test('quoting behavior', subsuite => {
        subsuite.test('given matched double-quotes - token is between quotes', t => {
            const inputs = [
                { input: '"hi"', expected: ['hi'], msg: 'word' },
                { input: '"hello world"', expected: ['hello world'], msg: 'phrase' },
                { input: '", ! ? . "', expected: [', ! ? . '], msg: 'punctuation characters' },
                { input: '""', expected: [], msg: 'nullstring' },
            ];
            t.plan(inputs.length);
            inputs.forEach(({ input, expected, msg }) => t.deepEqual(
                splitString(input), expected, `when wrapping ${msg}`,
            ));
        });
        subsuite.test('given unmatched double-quotes - strips quotes', t => {
            const inputs = [
                { input: '"hi', expected: ['hi'], msg: 'leads word' },
                { input: 'hi"', expected: ['hi'], msg: 'trails word' },
                { input: '"hi there', expected: ['hi', 'there'], msg: 'leads phrase' },
                { input: 'hi there"', expected: ['hi', 'there'], msg: 'trails phrase' },
            ];
            t.plan(inputs.length);
            inputs.forEach(({ input, expected, msg }) => t.deepEqual(
                splitString(input), expected, `when quote ${msg}`,
            ));
        });
        subsuite.test('given double-quotes within words - treated as token separators', t => {
            const inputs = [
                { input: 'super"typo', expected: ['super', 'typo'] },
                { input: 'hi"there"friend', expected: ['hi', 'there', 'friend'] },
                { input: '"hi"there', expected: ['hi', 'there'] },
                { input: 'hi"there"', expected: ['hi', 'there'] },
            ];
            t.plan(inputs.length);
            inputs.forEach(({ input, expected }) => t.deepEqual(
                splitString(input), expected,
            ));
        });
        subsuite.test('given single-quotes - treats as normal character', t => {
            const inputs = [
                { input: '\'hi\'', expected: ['\'hi\''], msg: 'wrapping word' },
                { input: '\'hello world\'', expected: ['\'hello', 'world\''], msg: 'wrapping phrase' },
                { input: '\', ! ? . \'', expected: ['\',',  '!',  '?', '.', '\''], msg: 'wrapping punctuation characters' },
                { input: '\'\'', expected: ['\'\''], msg: 'wrapping nullstring' },
                { input: 'she\'s', expected: ['she\'s'], msg: 'used as apostrophe' },
                { input: '\'this', expected: ['\'this'], msg: 'leading & unmatched' },
                { input: 'that\'', expected: ['that\''], msg: 'trailing & unmatched' },
            ];
            t.plan(inputs.length);
            inputs.forEach(({ input, expected, msg }) => t.deepEqual(
                splitString(input), expected, `when ${msg}`,
            ));
        });
    });
});
test('unescapeEntities', suite => {
    suite.test('given non-string input - throws TypeError', t => {
        const inputs = [
            new Set(),
            new Map(),
            {},
            true,
            undefined,
            0,
            () => {},
        ];
        t.plan(inputs.length);
        inputs.forEach(input => t.throws(
            () => unescapeEntities(input),
            TypeError,
            `should throw for ${typeof input}`,
        ));
    });
    suite.test('given empty string - returns empty string', t => {
        const inputs = [
            '',
            String(),
        ];
        t.plan(inputs.length);
        inputs.forEach(input => t.deepEqual(
            unescapeEntities(input),
            '',
            `should return empty for empty ${input.constructor.name}`,
        ));
    });
    suite.test('given 1 string - returns item as string', t => {
        const inputs = [
            'string',
            'test',
            'King\'s Arms',
        ];
        t.plan(inputs.length);
        inputs.forEach(input => t.deepEqual(
            unescapeEntities(input),
            input,
            'should return what it is given when no escaped entities',
        ));
    });
    suite.test('given escaped entities should return unescaped string', t => {
        const inputs = [
            { input: 'King&#39;s Arms', expected: 'King\'s Arms', msg: 'single escape' },
            { input: 'King&#39;s&#21704;哈 Arms', expected: 'King\'s哈哈 Arms', msg: 'two escapes' },
        ];
        t.plan(inputs.length);
        inputs.forEach(({ input, expected, msg }) => t.deepEqual(
            unescapeEntities(input), expected, `when given ${msg}`,
        ));
    });
});
test('isValidURL', suite => {
    suite.test('given non-string input - throws TypeError', t => {
        const inputs = [
            new Set(),
            new Map(),
            {},
            true,
            undefined,
            0,
            () => {},
        ];
        t.plan(inputs.length);
        inputs.forEach(input => t.throws(
            () => isValidURL(input),
            TypeError,
            `should throw for ${typeof input}`,
        ));
    });
    suite.test('given empty string - returns false', t => {
        const inputs = [
            '',
            String(),
        ];
        t.plan(inputs.length);
        inputs.forEach(input => t.false(
            isValidURL(input),
            `should return false for empty ${input.constructor.name}`,
        ));
    });
    suite.test('given non-http url strings, returns false', t => {
        const inputs = [
            'string',
            'test',
            'King\'s Arms',
            'ftp://ftp.com/bob',
            'htp://www.mousehuntgame.com/',
        ];
        t.plan(inputs.length);
        inputs.forEach(input => t.false(
            isValidURL(input),
            'should return false for non-http strings',
        ));
    });
    suite.test('given valid URLs should return true', t => {
        const inputs = [
            'http://www.google.com/search?q=find+this',
            'http://www.google.com/search?q=find+this',
            'https://stackoverflow.com/questions/5717093/check-if-a-javascript-string-is-a-url',
            'https://www.google.com/search?q=find+url&oq=find+url&aqs=chrome..69i57j0l7.2903j0j4&sourceid=chrome&ie=UTF-8',
            'http://www.mousehuntgame.com/',
        ];
        t.plan(inputs.length);
        inputs.forEach(input => t.true(
            isValidURL(input),
            'should return true for valid URLs',
        ));
    });
});
test('calculateRate', suite => {
    suite.test('given non-numeric inputs - throws TypeError', t => {
        const inputs = [
            new Set(),
            new Map(),
            {},
            undefined,
            () => {},
        ];
        t.plan(inputs.length);
        inputs.forEach(input => t.deepEqual(
            calculateRate(input, input),
            NaN,
            `should return NaN for ${typeof input}`,
        ));
    });
    suite.test('given zero denominator - returns NaN', t => {
        t.plan(1);
        t.deepEqual(
            calculateRate(0, 0),
            NaN,
            'should return NaN for 0 denominator',
        );
    });
    suite.test('Given some known ratios, returns known results', t => {
        const inputs = [
            {  denominator: 1, numerator: 100, expected: '100.00' },
            {  denominator: 2, numerator: 100, expected: '50.00' },
            {  denominator: 100, numerator: 100, expected: '1.000' },
            {  denominator: 200, numerator: 100, expected: '0.5000' },
            {  denominator: 1000, numerator: 100, expected: '0.1000' },
            {  denominator: 10000, numerator: 100, expected: '0.0100' },
            {  denominator: 100000, numerator: 100, expected: '0.0010' },
            {  denominator: 1000000, numerator: 100, expected: '0.0001' },
            {  denominator: 10000000, numerator: 100, expected: '0.0000' },
        ];
        t.plan(inputs.length);
        inputs.forEach(input => t.deepEqual(
            calculateRate(input.denominator, input.numerator),
            input.expected,
            'should return consistent values',
        ));
    });
    suite.test('Given some known ratios and precision (2), returns known results', t => {
        const inputs = [
            {  denominator: 1, numerator: 100, expected: '100.00' },
            {  denominator: 2, numerator: 100, expected: '50.00' },
            {  denominator: 100, numerator: 100, expected: '1.000' },
            {  denominator: 200, numerator: 100, expected: '0.50' },
            {  denominator: 1000, numerator: 100, expected: '0.10' },
            {  denominator: 10000, numerator: 100, expected: '0.01' },
            {  denominator: 100000, numerator: 100, expected: '0.00' },
            {  denominator: 1000000, numerator: 100, expected: '0.00' },
            {  denominator: 10000000, numerator: 100, expected: '0.00' },
        ];
        t.plan(inputs.length);
        inputs.forEach(input => t.deepEqual(
            calculateRate(input.denominator, input.numerator, 2),
            input.expected,
            'should return consistent values',
        ));
    });
});
test('integerComma', suite => {
    suite.test('given non-numeric inputs - returns undefined', t => {
        const inputs = [
            new Set(),
            new Map(),
            {},
            () => {},
            'Happy',
        ];
        t.plan(inputs.length);
        inputs.forEach(input => t.deepEqual(
            integerComma(input),
            input.toString(),
            `should return the stringified for ${typeof input}`,
        ));
    });
    suite.test('Given some known numbers, returns specific formats', t => {
        const inputs = [
            {  input: 1, expected: '1' },
            {  input: 10, expected: '10' },
            {  input: 100, expected: '100' },
            {  input: 1000, expected: '1,000' },
            {  input: 10000, expected: '10,000' },
            {  input: 100000, expected: '100,000' },
            {  input: 1000000, expected: '1,000,000' },
            {  input: 0, expected: '0' },
            {  input: 0.1, expected: '0.1' },
            {  input: 0.01, expected: '0.01' },
            {  input: 0.001, expected: '0.001' },
            {  input: 0.0001, expected: '0.0001' },
        ];
        t.plan(inputs.length);
        inputs.forEach(input => t.deepEqual(
            integerComma(input.input),
            input.expected,
            'should return consistent values',
        ));
    });
});

test('intToHuman', suite => {
    suite.test('given non-numeric inputs - throws TypeError', t => {
        const inputs = [
            new Set(),
            new Map(),
            {},
            undefined,
            () => {},
            'Happy',
        ];
        t.plan(inputs.length);
        inputs.forEach(input => {
            const returned = intToHuman(input);
            t.deepEqual(returned, NaN, `should return NaN for ${typeof input}`);
        });
    });

    suite.test('Given some known numbers, returns specific formats', t => {
        const inputs = [
            {  input: 0, expected: '0' },
            {  input: 1, expected: '1' },
            {  input: 10, expected: '10' },
            {  input: 100, expected: '100' },
            {  input: 1001, expected: '1K' },
            {  input: 10001, expected: '10K' },
            {  input: 100001, expected: '100K' },
            {  input: 1000001, expected: '1M' },
            {  input: 1000000001, expected: '1B' },
            {  input: 1200, expected: '1.2K' },
            {  input: 1234, expected: '1.23K' },
        ];
        t.plan(inputs.length);
        inputs.forEach(input => t.deepEqual(
            intToHuman(input.input),
            input.expected,
            'should return consistent values',
        ));
    });
});
