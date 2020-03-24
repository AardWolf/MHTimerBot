// Required test imports
const test = require('tape');

// Functionality to be tested.
const Timer = require('../src/modules/timerClass');

test('Timer ctor - given no seed - throws', t => {
    t.plan(1);
    t.throws(() => new Timer());
});
test('Timer ctor - given improper seed - throws', t => {
    t.plan(1); // update number
    t.throws(() => new Timer({ key: 'some value' }));
    // add other invalid area, seed_time, repeat_time combos that will fail
});
test('Timer ctor - given area, seed_time, repeat_time - does not throw', t => {
    t.plan(1);
    t.doesNotThrow(() => new Timer({ area: 'mars', seed_time: '1970-01-01', repeat_time: 60001 }));
});
