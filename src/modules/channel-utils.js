const { Constants } = require('discord.js');

const DM_CHANNELS = Object.freeze(new Set([
    Constants.ChannelTypes.DM,
    Constants.ChannelTypes.GROUP_DM,
]));

/**
 * Determines if the given channel is a DM channel (either private or group)
 * @param {{ type: string }} channel
 * @param {boolean} privateOnly Whether the channel should be a private DM (single-user).
 * @returns {boolean}
 */
function isDMChannel({ type }, privateOnly = false) {
    return privateOnly
        ? DM_CHANNELS.has(type)
        : type === Constants.ChannelTypes.DM;
}

exports.isDMChannel = isDMChannel;
