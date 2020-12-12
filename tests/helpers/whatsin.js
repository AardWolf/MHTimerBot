const sinon = require('sinon');
const convertibles = require('../../src/modules/mhct-lookup');

const stubConvertiblesLookup = () => {
    return {
        getConvertibles: sinon.stub(convertibles, 'getConvertibles'),
        formatConvertibles: sinon.stub(convertibles, 'formatConvertibles'),
        sendInteractiveSearchResult: sinon.stub(convertibles, 'sendInteractiveSearchResult'),
    };
};

const restoreConvertiblesLookup = ({ ...stubs }) => {
    Object.values(stubs).forEach(stub => stub.restore());
};

exports.stubConvertiblesLookup = stubConvertiblesLookup;
exports.restoreConvertiblesLookup = restoreConvertiblesLookup;