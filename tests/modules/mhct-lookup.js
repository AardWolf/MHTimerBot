const test = require('tape');
const sinon = require('sinon');

const searchHelper = require('../../src/modules/search-helpers');
const getSearchedEntityStub = sinon.stub(searchHelper, 'getSearchedEntity');
const mhct_lookup = require('../../src/modules/mhct-lookup');

const {
    extractEventFilter,
    // findThing,
    // formatConvertibles,
    // formatLoot,
    // formatMice,
    getConvertibles,
    getFilter,
    getLoot,
    getMice,
    // getMinluckString,
    // getMHCTList,
} = mhct_lookup;


test('getFilter', suite => {
    suite.test('given non-string input - returns undefined', t => {
        t.teardown(() => sinon.reset());
        const inputs = [
            true,
            undefined,
            () => {},
        ];
        t.plan(inputs.length * 2);
        getSearchedEntityStub.returns([{ code_name: 1 }]);
        inputs.forEach(input => {
            const result = getFilter(input);
            t.false(getSearchedEntityStub.called, 'should not call "getSearchedEntity"');
            t.equal(result, undefined, `should return undefined for non-string ${typeof input}`);
        });
    });

    suite.test('given shorthand string - returns known shortcuts', t => {
        t.teardown(() => sinon.reset());
        const inputs = [
            { input: '3_d', expected: '3_days' },
            { input: '3days', expected: '3_days' },
            { input: '3_m', expected: '3_months' },
            { input: '3months', expected: '3_months' },
            { input: 'all', expected: 'alltime' },
            { input: 'allowance', expected: 'alltime' },
            { input: 'current', expected: '1_month' }, //NOTE this can only be asserted because we don't load the filter list
        ];
        t.plan(inputs.length * 2);
        getSearchedEntityStub.returns([]);
        inputs.forEach(input => {
            getFilter(input.input);
            t.strictEqual(getSearchedEntityStub.callCount, 1, 'should call search entity');
            t.deepEqual(getSearchedEntityStub.args[0][0], input.expected, `should convert shorthand ${input.input} correctly`);
            getSearchedEntityStub.resetHistory();
        });
    });
});

test('getLoot', suite => {
    suite.test('given input that can\'t be turned into a truthy string - returns undefined', t => {
        t.teardown(() => sinon.reset());
        const inputs = [
            '',
            undefined,
        ];
        t.plan(inputs.length);
        inputs.forEach(input => t.deepEqual(
            getLoot(input),
            undefined,
            `should return undefined for random and empty stuff - ${typeof input}`,
        ));
    });
});

test('getMice', suite => {
    suite.test('given input that can\'t be turned into a truthy string - returns undefined', t => {
        t.teardown(() => sinon.reset());
        const inputs = [
            '',
            undefined,
        ];
        t.plan(inputs.length);
        inputs.forEach(input => t.deepEqual(
            getMice(input),
            undefined,
            `should return undefined for random and empty stuff - ${typeof input}`,
        ));
    });
});

test('getConvertibles', suite => {
    suite.test('given input that can\'t be turned into a truthy string - returns undefined', t => {
        t.teardown(() => sinon.reset());
        const inputs = [
            '',
            undefined,
        ];
        t.plan(inputs.length);
        inputs.forEach(input => t.deepEqual(
            getConvertibles(input),
            undefined,
            `should return undefined for random and empty stuff - ${typeof input}`,
        ));
    });

    suite.test('given valid input - calls getSearchedEntity correctly', t => {
        t.teardown(() => sinon.reset());
        const inputs = [
            '10th',
            'birthday',
        ];
        t.plan(inputs.length * 4);
        inputs.forEach(input => {
            getConvertibles(input),
            t.strictEqual(getSearchedEntityStub.callCount, 1, 'should call "getSearchedEntity"');
            const callArgs = getSearchedEntityStub.getCall(0).args;
            t.strictEqual(callArgs.length, 2, 'should pass correct number of arguments');
            t.strictEqual(callArgs[0], input, 'should pass input to search method');
            // TODO: mock initialize `convertibles` to assert the right array is used. Requires stubbing `getMHCTList` or `fetch`
            t.true(Array.isArray(callArgs[1]), 'should pass convertible "db" as second arg');
            getSearchedEntityStub.resetHistory();
        });
    });
});

test('extractEventFilter', suite => {
    const mockResults = [{ code_name: 'first' }, { code_name: 'second' }];
    const filterToken = 'matched';
    // Can't stub out `getFilter` as it is accessed internally, so need to rely on its behavior.
    getSearchedEntityStub.returns([]);
    getSearchedEntityStub.withArgs(filterToken, sinon.match.array).returns(mockResults);
    suite.teardown(() => getSearchedEntityStub.reset());

    suite.test('given no tokens - returns no filter', t => {
        t.teardown(() => sinon.resetHistory());
        t.plan(1);
        const input = [];
        const result = extractEventFilter(input);
        t.strictEqual(result.filter, null, 'should not find filter');
    });

    suite.test('given tokens - when "-e" flag not present - uses first token as filter search term', t => {
        t.teardown(() => sinon.resetHistory());
        t.plan(3);
        const input = ['tryMe', 'as', 'a', 'filter', 'identifier'];
        const result = extractEventFilter(input);
        t.true(getSearchedEntityStub.called, 'should call "getFilter" and thus "getSearchedEntity"');
        t.deepEqual(getSearchedEntityStub.getCall(0).args[0], 'tryMe', 'should search for filter matching first token');
        t.notStrictEqual(result.tokens, input, 'should return new array of tokens');
    });

    suite.test('given tokens - when "-e" flag not present - when filter found - returns tokens without search term', t => {
        t.teardown(() => sinon.resetHistory());
        t.plan(3);
        const input = [filterToken, 'leave', 'us', 'be'];
        const result = extractEventFilter(input);
        t.true(getSearchedEntityStub.called, 'should call "getFilter" and thus "getSearchedEntity"');
        t.ok(result.filter, 'should have found filter');
        t.deepEqual(result.tokens, input.slice(1), 'should return unused tokens');
    });

    suite.test('given tokens - when "-e" flag not present - when filter not found - no tokens consumed', t => {
        t.teardown(() => sinon.resetHistory());
        t.plan(3);
        const input = ['leave', 'us', 'be'];
        const result = extractEventFilter(input);
        t.true(getSearchedEntityStub.called, 'should call "getFilter" and thus "getSearchedEntity"');
        t.notOk(result.filter, 'should not have found filter');
        t.deepEqual(result.tokens, input, 'should not consume any tokens');
    });

    [filterToken, 'not matched'].forEach((followingToken) => {
        const prefix = `given tokens with "-e" flag - when filter ${followingToken}`;
        suite.test(`${prefix} - removes flag from returned tokens`, t => {
            t.teardown(() => sinon.resetHistory());
            t.plan(1);
            const input = ['noTouchy', '-e', followingToken, 'alsoNoTouchy'];
            const result = extractEventFilter(input);
            t.notOk(result.tokens.find((token) => token === '-e'), 'should remove "-e" token from returned tokens');
        });

        suite.test(`${prefix} - removes following token too`, t => {
            t.teardown(() => sinon.resetHistory());
            t.plan(2);
            const input = ['noTouchy', '-e', followingToken, 'alsoNoTouchy'];
            const result = extractEventFilter(input);
            t.notOk(result.tokens.find((token) => token === followingToken), 'should remove "-e" token from returned tokens');
            t.deepEqual(result.tokens, ['noTouchy', 'alsoNoTouchy'], 'should return unused tokens in correct order');
        });

        suite.test(`${prefix} - when following token - following token is the search term`, t => {
            t.teardown(() => sinon.resetHistory());
            t.plan(2);
            const input = ['noTouchy', '-e', followingToken, 'alsoNoTouchy'];
            extractEventFilter(input);
            t.true(getSearchedEntityStub.called, 'should call "getFilter" and thus "getSearchedEntity"');
            t.strictEqual(getSearchedEntityStub.getCall(0).args[0], followingToken, 'should use token after "-e" as filter search term');
        });
    });

    suite.test('given tokens with "-e" - when no following token - no search performed', t => {
        t.teardown(() => sinon.resetHistory());
        t.plan(2);
        const input = ['noTouchy', 'seriouslyNoTouchy', '-e'];
        const result = extractEventFilter(input);
        t.false(getSearchedEntityStub.called, 'should not perform filter lookup');
        t.deepEqual(result.tokens, ['noTouchy', 'seriouslyNoTouchy'], 'should always remove "-e" token');
    });
});

test('Module Cleanup - mhct-lookup', t => {
    getSearchedEntityStub.restore();
    t.end();
});
