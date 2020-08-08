// Provide an easy way to intercept calls to the hunter registry commands
const sinon = require('sinon');
const timerHelpers = require('../../src/modules/timer-helper');

const stubTimerHelper = () => {
    return {
        getKnownTimersDetails: sinon.stub(timerHelpers, 'getKnownTimersDetails'),
        timerAliases: sinon.stub(timerHelpers, 'timerAliases'),
        nextTimer: sinon.stub(timerHelpers, 'nextTimer'),
        listRemind: sinon.stub(timerHelpers, 'listRemind'),
    };
};

const restoreTimerHelper = ({ ...stubs }) => {
    Object.values(stubs).forEach(stub => stub.restore());
};

exports.stubTimerHelper = stubTimerHelper;
exports.restoreTimerHelper = restoreTimerHelper;
