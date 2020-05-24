const sinon = require('sinon');
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

exports.stubLogger = stubLogger;
exports.restoreLogger = restoreLogger;
