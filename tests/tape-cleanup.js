const test = require('tape');
const sinon = require('sinon');

test.onFinish(() => {
    console.log('Removing all spies & restoring all mocks');
    sinon.restore();
});
