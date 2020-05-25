// Provide an easy way to intercept calls to the hunter registry commands
const sinon = require('sinon');
const hunters = require('../../src/modules/hunter-registry');

const stubHunterRegistry = () => {
    return {
        setHunterID: sinon.stub(hunters, 'setHunterID'),
        unsetHunterID: sinon.stub(hunters, 'unsetHunterID'),
        setHunterProperty: sinon.stub(hunters, 'setHunterProperty'),
        getHuntersByProperty: sinon.stub(hunters, 'getHuntersByProperty'),
        findHunter: sinon.stub(hunters, 'findHunter'),
    };
};

const restoreHunterRegistry = ({ ...stubs }) => {
    Object.values(stubs).forEach(stub => stub.restore());
};

exports.stubHunterRegistry = stubHunterRegistry;
exports.restoreHunterRegistry = restoreHunterRegistry;
