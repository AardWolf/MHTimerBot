const { Collection, Constants } = require('discord.js');
const { ChannelTypes } = Constants;
const Keys = require('../../src/utils/discord-enum-keys');
const sinon = require('sinon');

/**
 * A facsimile of a Discord Message, for use in tests
 * @param {object} c Config object
 * @param {keyof ChannelTypes} c.channelType Type of the channel the message was received in (default = GUILD_TEXT)
 * @param {Function} c.reactStub A stub for message#react
 * @param {Function} c.replyStub A stub for message#reply
 * @param {Function} c.sendStub A stub for message.channel#send
 * @param {string} c.authorId A discord ID for the message's author
 * @param {object} c.clientStub An object representing the bot client
 */
const mockMessage = ({
    channelType = 'GUILD_TEXT',
    reactStub = sinon.stub(),
    replyStub = sinon.stub(),
    sendStub = sinon.stub(),
    locationNicknames = {},
    rankNicknames = {},
    authorId = '123456789',
    clientStub = {},
    mentionedChannels = [],
} = {}) => {
    // Require valid channel type usage.
    if (!Keys(ChannelTypes).has(channelType)) throw new Error(`"${channelType} is not valid; expected one of [${[...Keys(ChannelTypes).values()]}]`);

    // Stub the client, and its nicknames Map.
    const baseClient = {
        settings: { botPrefix: '-mh' },
        nicknames: { get: sinon.stub().returns({}) }, // Return an empty mapping object by default.
    };
    baseClient.nicknames.get.withArgs('locations').returns(locationNicknames);
    baseClient.nicknames.get.withArgs('ranks').returns(rankNicknames);
    const clientWithSettings = { ...baseClient, ...clientStub };

    const stub = {
        client: clientWithSettings,
        author: { id: authorId },
        channel: {
            type: channelType,
            send: sendStub,
        },
        react: reactStub,
        reply: replyStub,
        mentions: {
            channels: new Collection(mentionedChannels),
        },
    };
    return stub;
};

module.exports = mockMessage;
