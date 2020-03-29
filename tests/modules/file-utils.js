// Required test imports
const test = require('tape');
const sinon = require('sinon');

// Stub IO
const fs = require('fs');
const readStub = sinon.stub(fs, 'readFile');
const writeStub = sinon.stub(fs, 'writeFile');
const Logger = require('../../src/modules/logger');
const stubLogger = () => {
    return {
        log: sinon.stub(Logger, 'log'),
        warn: sinon.stub(Logger, 'warn'),
        error: sinon.stub(Logger, 'error'),
    };
};
const restoreLogger = ({ ...stubs }) => {
    Object.values(stubs).forEach(stub => stub.restore());
};

// Functionality to be tested.
const { loadDataFromJSON: load, saveDataAsJSON: save } = require('../../src/modules/file-utils');

test('loadData', suite => {
    suite.test('given path - calls fs.readFile with path', async t => {
        t.plan(2);
        readStub.yields(null, '{}');
        const logStubs = stubLogger();

        const filePath = 'path/to/file.json';
        await load(filePath);
        t.true(readStub.calledOnce, 'should call fs.readFile');
        t.strictEqual(readStub.firstCall.args[0], filePath, 'should read given path');

        restoreLogger(logStubs);
        sinon.reset();
    });
    suite.test('given input - logs input', async t => {
        t.plan(2);
        readStub.yields(null, '{}');
        const logStubs = stubLogger();

        const filePath = 'path/to/other/file.json';
        await load(filePath);
        t.strictEqual(logStubs.log.callCount, 1, 'should log read call');
        t.true(logStubs.log.args.join(' ').includes(filePath), 'should log file path');

        restoreLogger(logStubs);
        sinon.reset();
    });
    suite.test('given path to JSON - returns parsed content', async t => {
        t.plan(1);
        const input = [{ key: 'value' }];
        readStub.yields(null, JSON.stringify(input));
        const logStubs = stubLogger();

        const result = await load('path/to/file.json');
        t.deepEqual(result, input, 'should return parsed JSON');

        restoreLogger(logStubs);
        sinon.reset();
    });
    suite.test('given path to non-JSON - throws SyntaxError', async t => {
        t.plan(1);
        readStub.yields(null, 'hello there');
        const logStubs = stubLogger();

        try {
            await load('path/to/file.txt');
            t.fail('should throw SyntaxError');
        } catch (err) {
            t.true(err instanceof SyntaxError, 'should throw SyntaxError');
        } finally {
            restoreLogger(logStubs);
            sinon.reset();
        }
    });
    suite.test('given bad path - throws err', async t => {
        t.plan(1);
        readStub.yields(Error('ENOENT'));
        const logStubs = stubLogger();

        try {
            await load('path/to/file.txt');
            t.fail('should throw fs Error');
        } catch (err) {
            t.deepEqual(err, Error('ENOENT'), 'should throw fs Error');
        } finally {
            restoreLogger(logStubs);
            sinon.reset();
        }
    });
});
test('saveData', suite => {
    suite.test('given path - calls fs.writeFile with path', async t => {
        t.plan(2);
        writeStub.yields(null);
        const logStubs = stubLogger();

        const filePath = 'path/to/file.json';
        await save(filePath, {});
        t.true(writeStub.calledOnce, 'should call fs.writeFile');
        const [arg1] = writeStub.firstCall.args;
        t.strictEqual(arg1, filePath, 'should call fs.writeFile with path');

        restoreLogger(logStubs);
        sinon.reset();
    });
    suite.test('given data - stringifies data before write', async t => {
        t.plan(1);
        writeStub.yields(null);
        const logStubs = stubLogger();

        const data = {};
        await save('path/to/file.json', data);
        const [, arg2] = writeStub.firstCall.args;
        t.strictEqual(arg2, JSON.stringify(data), 'should call fs.writeFile with stringified data');

        restoreLogger(logStubs);
        sinon.reset();
    });
    suite.test('when successful - returns true', async t => {
        t.plan(1);
        writeStub.yields(null);
        const logStubs = stubLogger();

        t.true(await save('path/to/file.json', {}), 'should return true');

        restoreLogger(logStubs);
        sinon.reset();
    });
    suite.test('when successful - logs success', async t => {
        t.plan(2);
        writeStub.yields(null);
        const logStubs = stubLogger();

        const filePath = 'path/to/file.json';
        await save(filePath, {});
        t.true(logStubs.log.calledOnce, 'should log write call');
        t.true(logStubs.log.args.join(' ').includes(filePath), 'should log file path');

        restoreLogger(logStubs);
        sinon.reset();
    });
    suite.test('when unsuccessful - returns false', async t => {
        t.plan(1);
        writeStub.yields(Error());
        const logStubs = stubLogger();

        t.false(await save('path/to/file.json', {}), 'should return false');

        restoreLogger(logStubs);
        sinon.reset();
    });
    suite.test('when unsuccessful - logs error', async t => {
        t.plan(3);
        const err = Error('EACCES');
        err.stack = 'Hello there';
        writeStub.yields(err);
        const logStubs = stubLogger();

        const filePath = 'path/to/file.json';
        await save(filePath, {});
        t.true(logStubs.error.calledOnce, 'should log write error');
        const [logPath, logErr] = logStubs.error.args[0];
        t.true(logPath.includes(filePath), 'should log file path');
        t.deepEqual(logErr, err, 'should log error details');
        restoreLogger(logStubs);
        sinon.reset();
    });
});

// Remove all stubs / spies.
sinon.restore();
