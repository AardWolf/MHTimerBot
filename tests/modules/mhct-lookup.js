const test = require('tape');
const sinon = require('sinon');

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
        inputs.forEach(input => t.deepEqual(
            getFilter(input),
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
