// Required test imports
const test = require('tape');
const sinon = require('sinon');

// Stub IO
const fs = require('fs');
const readStub = sinon.stub(fs, 'readFile');
const writeStub = sinon.stub(fs, 'writeFile');
const Logger = require('../../src/modules/logger');
const logStub = sinon.stub(Logger);

// Functionality to be tested.
const { loadDataFromJSON: load, saveDataAsJSON: save } = require('../../src/modules/file-utils');

test('loadData', suite => {
    suite.test('given path - reads from path', async (t) => {
        t.plan(2);
        readStub.yields(null, '{}');
        const filePath = 'path/to/file.json';
        const result = await load(filePath);
        t.strictEqual(readStub.firstCall.args[0], filePath, 'should call fs.readFile with input');
        t.deepEqual(result, {}, 'should return object');
    });
});
// test('saveData', suite => {

// });
