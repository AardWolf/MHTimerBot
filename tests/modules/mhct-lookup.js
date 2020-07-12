const test = require('tape');
const sinon = require('sinon');

//let getSearchedEntityStub;
const mhct_lookup = require('../../src/modules/mhct-lookup');

//const getMHCTList = mhct_lookup.getMHCTList;
//const findThing = mhct_lookup.findThing;
const getFilter = mhct_lookup.getFilter;
//const getLoot = mhct_lookup.getLoot;
//const formatLoot = mhct_lookup.formatLoot;


test('getFilter', suite => {
    suite.test('given non-string input - returns false', t => {
        const inputs = [
            '',
            true,
            undefined,
            0,
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
    /*     suite.test('given string input - returns known shortcuts', t => {

        const inputs = [
            { input: '3', expected: '3_days', },
            { input: '3day', expected: '3_days', },
            { input: 'all', expected: 'alltime', },
            { input: 'allowance', expected: 'alltime', },
        ];
        t.plan(inputs.length*2);
        const getSearchedEntityStub = sinon.stub(mhct_lookup, 'getSearchedEntity');
        // The stub doesn't seem to be taking hold.
        inputs.forEach(input => {
            const result = getFilter(input.input);
            t.true(getSearchedEntityStub.calledOnce, 'should call search entity');
            t.deepEqual(getSearchedEntityStub.args[0], input.expected, 'should search for known shortcut');
            console.log(`Recived ${result}`);
        });
        sinon.reset();
    });
 */
    suite.test('Module Cleanup', t => {
        sinon.restore();
        t.end();
    });
});
