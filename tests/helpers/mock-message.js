const sinon = require('sinon');

/**
 * A facsimile of a Discord Message, for use in tests
 * @param {Object} c Config object
 * @param {'dm'|'group'|'text'} c.channelType Type of the channel the message was received in
 * @param {Function} c.reactStub A stub for message#react
 * @param {Function} c.replyStub A stub for message#reply
 * @param {Function} c.sendStub A stub for message.channel#send
 * @param {string} c.authorId A discord ID for the message's author
 * @param {Object} c.clientStub An object representing the bot client
 */
const mockMessage = ({
    channelType = 'dm',
    reactStub = sinon.stub(),
    replyStub = sinon.stub(),
    sendStub = sinon.stub(),
    authorId = '123456789',
    clientStub = {},
} = {}) => {
    const clientWithSettings = Object.assign({}, { settings: { botPrefix: '-mh' } }, clientStub);
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
