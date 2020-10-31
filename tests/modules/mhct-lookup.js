const test = require('tape');
const sinon = require('sinon');

const searchHelper = require('../../src/modules/search-helpers');
const getSearchedEntityStub = sinon.stub(searchHelper, 'getSearchedEntity').returns([]);
const mhct_lookup = require('../../src/modules/mhct-lookup');

//const getMHCTList = mhct_lookup.getMHCTList;
//const findThing = mhct_lookup.findThing;
const getFilter = mhct_lookup.getFilter;
const getLoot = mhct_lookup.getLoot;
const getMice = mhct_lookup.getMice;
//const formatLoot = mhct_lookup.formatLoot;


test('getFilter', suite => {
    suite.test('given non-string input - returns undefined', t => {
        const inputs = [
            '',
            true,
            undefined,
            () => {},
        ];
        t.plan(inputs.length);
        getSearchedEntityStub.returns([]);
        inputs.forEach(input => t.deepEqual(
            getFilter(input),
            undefined,
            `should return undefined for random and empty stuff - ${typeof input}`,
        ));
        sinon.reset();

    });
    suite.test('given string input - returns known shortcuts', t => {
        const inputs = [
            { input: '3_d', expected: '3_days' },
            { input: '3days', expected: '3_days' },
            { input: '3_m', expected: '3_months' },
            { input: '3months', expected: '3_months'},
            { input: 'all', expected: 'alltime' },
            { input: 'allowance', expected: 'alltime' },
            { input: 'current', expected: '1_month' }, //NOTE this can only be asserted because we don't load the filter list
        ];
        t.plan(inputs.length*2);
        getSearchedEntityStub.resetHistory();
        getSearchedEntityStub.returns([]);
        inputs.forEach(input => {
            const result = getFilter(input.input);
            t.true(getSearchedEntityStub.calledOnce, 'should call search entity');
            t.deepEqual(getSearchedEntityStub.args[0][0], input.expected, `should search for known shortcut ${input.input} = ${input.expected}`);
            console.log(`Recived ${result}`);
            getSearchedEntityStub.resetHistory();
        });
        sinon.reset();
    });    suite.test('given input that can\'t be turned into a truthy string - returns undefined', t => {
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

    });    suite.test('Module Cleanup', t => {
        sinon.restore();
        t.end();
    });
});
