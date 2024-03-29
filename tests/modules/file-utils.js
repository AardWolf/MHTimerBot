// Required test imports
const test = require('tape');
const sinon = require('sinon');
// const mock = require('mock-fs');

// Stub IO
// Just in case modules are already loaded:
delete require.cache[require.resolve('fs/promises')];
delete require.cache[require.resolve('../../src/modules/file-utils')];
const fs = require('fs/promises');
const { stubLogger, restoreLogger } = require('../helpers/logging');
let logStubs;

// Functionality to be tested.
let load;
/** @type {sinon.SinonStub} */
let readStub;
let save;
/** @type {sinon.SinonStub} */
let writeStub;
test('Module Setup - file-utils', t => {
    logStubs = stubLogger();

    // (The test stubs must be created before require-ing the test module,
    // because we promisify fs upon require.)
    readStub = sinon.stub(fs, 'readFile');
    writeStub = sinon.stub(fs, 'writeFile');

    const fileUtils = require('../../src/modules/file-utils');
    load = fileUtils.loadDataFromJSON;
    save = fileUtils.saveDataAsJSON;
    t.end();
});

// #region loadDataFromJSON
test('loadDataFromJSON', suite => {
    suite.test('given path - calls fs.readFile with path', async t => {
        t.teardown(() => sinon.reset());
        t.plan(2);
        readStub.resolves('{}');

        const filePath = 'path/to/file.json';
        await load(filePath);
        t.true(readStub.calledOnce, 'should call fs.readFile');
        t.strictEqual(readStub.firstCall.args[0], filePath, 'should read given path');
    });

    suite.test('given input - logs input', async t => {
        t.teardown(() => sinon.reset());
        t.plan(2);
        readStub.resolves('{}');

        const filePath = 'path/to/other/file.json';
        await load(filePath);
        t.strictEqual(logStubs.log.callCount, 1, 'should log read call');
        t.true(logStubs.log.args.join(' ').includes(filePath), 'should log file path');
    });

    suite.test('given path to JSON - returns parsed content', async t => {
        t.teardown(() => sinon.reset());
        t.plan(1);

        const input = [{ key: 'value' }];
        readStub.resolves(JSON.stringify(input));

        const result = await load('path/to/file.json');
        t.deepEqual(result, input, 'should return parsed JSON');
    });

    suite.test('given path to non-JSON - throws SyntaxError', async t => {
        t.teardown(() => sinon.reset());
        t.plan(1);
        readStub.resolves('hello there');

        try {
            await load('path/to/file.txt');
            t.fail('should throw SyntaxError');
        } catch (err) {
            t.true(err instanceof SyntaxError, 'should throw SyntaxError');
        }
    });

    suite.test('given bad path - throws err', async t => {
        t.teardown(() => sinon.reset());
        t.plan(1);
        readStub.rejects(Error('ENOENT'));

        try {
            await load('path/to/file.txt');
            t.fail('should throw fs Error');
        } catch (err) {
            t.deepEqual(err, Error('ENOENT'), 'should throw fs Error');
        }
    });
});
// #endregion loadDataFromJSON

// #region saveDataAsJSON
test('saveDataAsJSON', suite => {
    suite.test('given path - calls fs.writeFile with path', async t => {
        t.teardown(() => sinon.reset());
        t.plan(2);
        writeStub.resolves();

        const filePath = 'path/to/file.json';
        await save(filePath, {});
        t.true(writeStub.calledOnce, 'should call fs.writeFile');
        const [arg1] = writeStub.firstCall.args;
        t.strictEqual(arg1, filePath, 'should call fs.writeFile with path');
    });

    suite.test('given data - stringifies data before write', async t => {
        t.teardown(() => sinon.reset());
        t.plan(1);
        writeStub.resolves();

        const data = {};
        await save('path/to/file.json', data);
        const [, arg2] = writeStub.firstCall.args;
        t.strictEqual(arg2, JSON.stringify(data), 'should call fs.writeFile with stringified data');
    });

    suite.test('when successful - returns true', async t => {
        t.teardown(() => sinon.reset());
        t.plan(1);
        writeStub.resolves();

        t.true(await save('path/to/file.json', {}), 'should return true');
    });

    suite.test('when successful - logs success', async t => {
        t.teardown(() => sinon.reset());
        t.plan(2);
        writeStub.resolves();

        const filePath = 'path/to/file.json';
        await save(filePath, {});
        t.true(logStubs.log.calledOnce, 'should log write call');
        t.true(logStubs.log.args.join(' ').includes(filePath), 'should log file path');
    });

    suite.test('when unsuccessful - returns false', async t => {
        t.teardown(() => sinon.reset());
        t.plan(1);
        writeStub.rejects(Error());

        t.false(await save('path/to/file.json', {}), 'should return false');
    });

    suite.test('when unsuccessful - logs error', async t => {
        t.teardown(() => sinon.reset());
        t.plan(3);
        const err = Error('EACCES');
        err.stack = 'Hello there';
        writeStub.rejects(err);

        const filePath = 'path/to/file.json';
        await save(filePath, {});
        t.true(logStubs.error.calledOnce, 'should log write error');
        const [logPath, logErr] = logStubs.error.args[0];
        t.true(logPath.includes(filePath), 'should log file path');
        t.deepEqual(logErr, err, 'should log error details');
    });
});
// #endregion saveDataAsJSON

test('Module Cleanup - file utils', t => {
    restoreLogger(logStubs);
    readStub.restore();
    writeStub.restore();

    load = null;
    save = null;
    t.end();
});
