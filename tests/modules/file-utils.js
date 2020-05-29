// Required test imports
const test = require('tape');
const sinon = require('sinon');
// const mock = require('mock-fs');

// Stub IO
// Just in case modules are already loaded, including promisified versions
delete require.cache[require.resolve('fs')];
delete require.cache[require.resolve('../../src/modules/file-utils')];
const fs = require('fs');
const { stubLogger, restoreLogger } = require('../helpers/logging');
let logStubs;

// Functionality to be tested.
let load;
let readStub;
let save;
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
        t.plan(2);
        readStub.yields(null, '{}');

        const filePath = 'path/to/file.json';
        await load(filePath);
        t.true(readStub.calledOnce, 'should call fs.readFile');
        t.strictEqual(readStub.firstCall.args[0], filePath, 'should read given path');

        sinon.reset();
    });
    suite.test('given input - logs input', async t => {
        t.plan(2);
        readStub.yields(null, '{}');

        const filePath = 'path/to/other/file.json';
        await load(filePath);
        t.strictEqual(logStubs.log.callCount, 1, 'should log read call');
        t.true(logStubs.log.args.join(' ').includes(filePath), 'should log file path');

        sinon.reset();
    });
    suite.test('given path to JSON - returns parsed content', async t => {
        t.plan(1);
        const input = [{ key: 'value' }];
        readStub.yields(null, JSON.stringify(input));

        const result = await load('path/to/file.json');
        t.deepEqual(result, input, 'should return parsed JSON');

        sinon.reset();
    });
    suite.test('given path to non-JSON - throws SyntaxError', async t => {
        t.plan(1);
        readStub.yields(null, 'hello there');

        try {
            await load('path/to/file.txt');
            t.fail('should throw SyntaxError');
        } catch (err) {
            t.true(err instanceof SyntaxError, 'should throw SyntaxError');
        } finally {
            sinon.reset();
        }
    });
    suite.test('given bad path - throws err', async t => {
        t.plan(1);
        readStub.yields(Error('ENOENT'));

        try {
            await load('path/to/file.txt');
            t.fail('should throw fs Error');
        } catch (err) {
            t.deepEqual(err, Error('ENOENT'), 'should throw fs Error');
        } finally {
            sinon.reset();
        }
    });
});
// #endregion loadDataFromJSON

// #region saveDataAsJSON
test('saveDataAsJSON', suite => {
    suite.test('given path - calls fs.writeFile with path', async t => {
        t.plan(2);
        writeStub.yields(null);

        const filePath = 'path/to/file.json';
        await save(filePath, {});
        t.true(writeStub.calledOnce, 'should call fs.writeFile');
        const [arg1] = writeStub.firstCall.args;
        t.strictEqual(arg1, filePath, 'should call fs.writeFile with path');

        sinon.reset();
    });
    suite.test('given data - stringifies data before write', async t => {
        t.plan(1);
        writeStub.yields(null);

        const data = {};
        await save('path/to/file.json', data);
        const [, arg2] = writeStub.firstCall.args;
        t.strictEqual(arg2, JSON.stringify(data), 'should call fs.writeFile with stringified data');

        sinon.reset();
    });
    suite.test('when successful - returns true', async t => {
        t.plan(1);
        writeStub.yields(null);

        t.true(await save('path/to/file.json', {}), 'should return true');

        sinon.reset();
    });
    suite.test('when successful - logs success', async t => {
        t.plan(2);
        writeStub.yields(null);

        const filePath = 'path/to/file.json';
        await save(filePath, {});
        t.true(logStubs.log.calledOnce, 'should log write call');
        t.true(logStubs.log.args.join(' ').includes(filePath), 'should log file path');

        sinon.reset();
    });
    suite.test('when unsuccessful - returns false', async t => {
        t.plan(1);
        writeStub.yields(Error());

        t.false(await save('path/to/file.json', {}), 'should return false');

        sinon.reset();
    });
    suite.test('when unsuccessful - logs error', async t => {
        t.plan(3);
        const err = Error('EACCES');
        err.stack = 'Hello there';
        writeStub.yields(err);

        const filePath = 'path/to/file.json';
        await save(filePath, {});
        t.true(logStubs.error.calledOnce, 'should log write error');
        const [logPath, logErr] = logStubs.error.args[0];
        t.true(logPath.includes(filePath), 'should log file path');
        t.deepEqual(logErr, err, 'should log error details');

        sinon.reset();
    });
});
// #endregion saveDataAsJSON

test('Module Cleanup', t => {
    restoreLogger(logStubs);
    readStub.restore();
    writeStub.restore();

    load = null;
    save = null;
    t.end();
});
