const sinon = require('sinon');

/**
 * A Fake guild member for use in tests
 * @param memberId
 * @param guildId
 * @param hasPermissionStub stub function for the `permissions.has` method
 * @param someStub
 * @param clientStub
 */
const mockMember = ({
    memberId = '123456789',
    guildId = '987654321',
    hasPermissionStub = sinon.stub(),
    someStub = sinon.stub(),
    clientStub = {},
} = {}) => {
    // Stub the client, and its nicknames Map.
    const baseClient = {
        settings: {
            botPrefix: '-mh',
            owner: '1',
            guilds: {
                '987654321': {
                    adminRole: '',
                    modRole: '',
                },
            },
        },
        nicknames: { get: sinon.stub().returns({}) }, // Return an empty mapping object by default.
    };
    const clientWithSettings = Object.assign({}, baseClient, clientStub);

    const stub = {
        client: clientWithSettings,
        id: memberId,
        guild: { id: guildId },
        permissions: {
            has: hasPermissionStub,
        },
        roles: {
            cache: {
                some: someStub,
            },
        },
    };
    return stub;
};

module.exports = mockMember;
