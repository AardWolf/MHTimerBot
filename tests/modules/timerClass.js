// Required test imports
const test = require('tape');

// Functionality to be tested.
const Timer = require('../../src/modules/timerClass');
// Stub Logger methods to minimize crosstalk.
// TODO: Use stub & spy library such as sinon
const Logger = require('../../src/modules/logger');
Logger.log = () => {};
Logger.warn = () => {};
Logger.error = () => {};

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
    suite.test('given valid area, seed_time, repeat_time - constructs Timer', t => {
        t.plan(1);
        t.ok(new Timer({ area: 'mars', seed_time: '1970-01-01', repeat_time: 60000 }), 'should create Timer');
    });
    suite.test('given valid seed - provides announcement message', t => {
        t.plan(1);
        const timer = new Timer({ area: 'mars', seed_time: '1970-01-01', repeat_time: 60000 });
        t.ok(timer.getAnnouncement(), 'should have announcement');
    });
    suite.test('given valid seed - provides demand message', t => {
        t.plan(1);
        const timer = new Timer({ area: 'mars', seed_time: '1970-01-01', repeat_time: 60000 });
        t.ok(timer.getDemand(), 'should have default call to action');
    });
    suite.test('given valid seed - given announcement_message - uses announcement', t => {
        t.plan(1);
        const announce_string = 'hello world';
        const timer = new Timer({ area: 'mars', seed_time: '1970-01-01', repeat_time: 60000, announce_string });
        t.strictEqual(timer.getAnnouncement(), announce_string, 'should use given announcement');
    });
    suite.test('given valid seed - given demand_string - uses demand', t => {
        t.plan(1);
        const demand_string = 'hello world';
        const timer = new Timer({ area: 'mars', seed_time: '1970-01-01', repeat_time: 60000, demand_string });
        t.strictEqual(timer.getDemand(), demand_string, 'should use given demand');
    });
    suite.test('given same seed - assigns different IDs', t => {
        t.plan(2);
        const timers = Array(10).fill({ area: 'mars', seed_time: '1970-01-01', repeat_time: 60000 })
            .map(s => new Timer(s));
        const ids = new Set(timers.map(t => t.id));
        t.strictEqual(ids.size, timers.length, 'should create unique IDs');
    });
});
test.skip('Other suite', function (suite) {
    // TODO
});
