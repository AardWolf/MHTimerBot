/**
 * Helper function to get only the text values of a Discord API enum / string array
 * @param {Object <string, number|string} discordEnum
 * @returns {ReadonlySet<string>}
 */
module.exports = (discordEnum) => {
    const values = Object.values(discordEnum);
    if (values.length === 0) throw new TypeError('No values contained in enum');
    if (!values.some((v) => typeof v === 'string')) throw new TypeError('Enum contains no string values');
    return Object.freeze(new Set(values.filter((value) => typeof value === 'string')));
};
