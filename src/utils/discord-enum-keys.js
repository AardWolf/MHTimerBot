/**
 * Helper function to get only the text values of a Discord API enum
 * @param {Object <string, number|string} discordEnum
 * @returns {ReadonlySet<string>}
 */
module.exports = (discordEnum) => Object.freeze(
    new Set(Object.values(discordEnum).filter((value) => typeof value === 'string')),
);
