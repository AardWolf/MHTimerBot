// Required test imports
const test = require('tape');
const sinon = require('sinon');

// Functionality to be tested.
const Logger = require('../../src/modules/logger');

const utcRegex = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/;

['log', 'warn', 'error'].forEach(method => {
    test(method, suite => {
        suite.test('given no args - does nothing', t => {
            t.plan(1);
            const stub = sinon.stub(console, method);
            Logger[method]();
            t.true(stub.notCalled, 'should be no-op');
            sinon.restore();
        });
        suite.test(`given arg - calls console.${method}`, t => {
            t.plan(1);
            const stub = sinon.stub(console, method);
            Logger[method]('foo');
            t.true(stub.calledOnce, 'should be called');
            sinon.restore();
        });
        suite.test(`given string arg - includes arg in call to console.${method}`, t => {
            t.plan(1);
            const stub = sinon.stub(console, method);
            const input = 'foo';
            Logger[method](input);
            const [firstArg] = stub.firstCall.args;
            t.true(firstArg.includes(input), `should call console.${method} with arg`);
            sinon.restore();
        });
        suite.test(`given object arg - calls console.${method} with timestamp and arg`, t => {
            t.plan(3);
            const stub = sinon.stub(console, method);
            const input = { hello: 'world' };
            Logger[method](input);
            const [firstArg, secondArg] = stub.firstCall.args;
            t.true(utcRegex.test(firstArg), `should call console.${method} with timestamp`);
            t.ok(secondArg, `should call console.${method} with multiple args`);
            t.is(secondArg, input, 'should forward object arg');
            sinon.restore();
        });
    });
});
