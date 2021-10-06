const sinon = require('sinon');

/**
 * A facsimile of a Discord Message, for use in tests
 * @param {object} c Config object
 * @param {'dm'|'group'|'text'} c.channelType Type of the channel the message was received in (default = text)
 * @param {Function} c.reactStub A stub for message#react
 * @param {Function} c.replyStub A stub for message#reply
 * @param {Function} c.sendStub A stub for message.channel#send
 * @param {string} c.authorId A discord ID for the message's author
 * @param {object} c.clientStub An object representing the bot client
 */
const mockMessage = ({
    channelType = 'text',
    reactStub = sinon.stub(),
    replyStub = sinon.stub(),
    sendStub = sinon.stub(),
    locationNicknames = {},
    rankNicknames = {},
    authorId = '123456789',
    clientStub = {},
} = {}) => {
    // Stub the client, and its nicknames Map.
    const baseClient = {
        settings: { botPrefix: '-mh' },
        nicknames: { get: sinon.stub().returns({}) }, // Return an empty mapping object by default.
    };
    baseClient.nicknames.get.withArgs('locations').returns(locationNicknames);
    baseClient.nicknames.get.withArgs('ranks').returns(rankNicknames);
    const clientWithSettings = Object.assign({}, baseClient, clientStub);

    const stub = {
        client: clientWithSettings,
        author: { id: authorId },
        channel: {
            type: channelType,
            send: sendStub,
        },
        react: reactStub,
        reply: replyStub,
    };
    return stub;
};

module.exports = mockMessage;
