// Required test imports
const test = require('tape');

// Functionality to be tested.
const Timer = require('../../src/modules/timerClass');

test('Timer ctor', function (suite) {
    suite.test('given no seed - throws', t => {
        t.plan(1);
        t.throws(() => new Timer(), TypeError, 'requires input');
    });
    suite.test('given improper seed - throws', t => {
        const plan = [
            { obj: { key: 'some value' }, error: TypeError, msg: 'not given required keys' },
            { obj: { area: 'mars', seed_time: 0, repeat_time: 60001 }, error: TypeError, msg: 'given invalid seed_time format' },
            { obj: { area: 'mars', seed_time: '1970', repeat_time: 1 }, error: RangeError, msg: 'given short repeat' },
            { obj: { area: 'mars', seed_time: '1970', repeat_time: { seconds: 1 } }, error: RangeError, msg: 'given short luxon repeat' },
        ];
        t.plan(plan.length);
        plan.forEach(({ obj, error, msg }) => t.throws(() => new Timer(obj), error, msg));
    });
    suite.test('given valid area, seed_time, repeat_time - does not throw', t => {
        t.plan(1);
        t.doesNotThrow(() => new Timer({ area: 'mars', seed_time: '1970-01-01', repeat_time: 60000 }));
    });
});
test.skip('Other suite', function (suite) {
    // TODO
});
