const test = require('tape');
const sinon = require('sinon');

const searchHelper = require('../../src/modules/search-helpers');
const getSearchedEntityStub = sinon.stub(searchHelper, 'getSearchedEntity');
const mhct_lookup = require('../../src/modules/mhct-lookup');

//const getMHCTList = mhct_lookup.getMHCTList;
//const findThing = mhct_lookup.findThing;
const getFilter = mhct_lookup.getFilter;
const getLoot = mhct_lookup.getLoot;
const getMice = mhct_lookup.getMice;
const getConvertibles = mhct_lookup.getConvertibles;
//const formatLoot = mhct_lookup.formatLoot;


test('getFilter', suite => {
    suite.test('given non-string input - returns undefined', t => {
        const inputs = [
            true,
            undefined,
            () => {},
        ];
        t.plan(inputs.length * 2);
        inputs.forEach(input => {
            t.equal(getFilter(input), undefined, `should return undefined for non-string ${typeof input}`);
            t.false(getSearchedEntityStub.called, 'should not call "getSearchedEntity"');
        });
        sinon.reset();
    });

    suite.test('given shorthand string - returns known shortcuts', t => {
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
        sinon.reset();
    });

    suite.test('given input that can\'t be turned into a truthy string - returns undefined', t => {
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
        sinon.reset();
    });

    suite.test('given input that can\'t be turned into a truthy string - returns undefined', t => {
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
        sinon.reset();
    });
});

test('getConvertibles', suite => {
    suite.test('given input that can\'t be turned into a truthy string - returns undefined', t => {
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
        sinon.reset();
    });

    suite.test('given valid input - calls getSearchedEntity correctly', t => {
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
        sinon.reset();
    });
});

test('Module Cleanup - mhct-lookup', t => {
    getSearchedEntityStub.restore();
    t.end();
});
