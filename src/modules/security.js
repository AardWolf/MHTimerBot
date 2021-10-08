// Extract type-hinting definitions for Discord classes.
// eslint-disable-next-line no-unused-vars
const { Client, Collection, Guild, GuildMember, Permissions, User } = require('discord.js');

/**
 * Checks the permissions of the member to see if they're at the minimum level
 * @param {GuildMember} member Guild member to confirm permissions for
 * @param {'admin'|'mod'} level Minimum level required ('admin' or 'mod')
 * @returns {boolean} Whether the user is at that level or higher
 */
function checkPerms(member, level) {
    if (!member || !level || !member.guild || !member.id || !('client' in member)) return false;
    const guild = member.guild;
    let authCheck = false;
    if (member.id === member.client.settings.owner)
        authCheck = true;
    if (!authCheck && ((level === 'admin') || (level === 'mod'))) {
        if ('adminrole' in member.client.settings.guilds[guild.id]) {
            authCheck = member.roles.cache.some(role => role.name === member.client.settings.guilds[guild.id].adminrole);
        } else {
            authCheck = member.permissions.has(Permissions.FLAGS.ADMINISTRATOR);
        }
    }
    if (!authCheck && (level === 'mod')) {
        if ('modrole' in member.client.settings.guilds[guild.id]) {
            authCheck = member.roles.cache.some(role => role.name === member.client.settings.guilds[guild.id].modrole);
        } else {
            authCheck = member.permissions.has(Permissions.FLAGS.MANAGE_MESSAGES);
        }
    }
    return authCheck;
}

exports.checkPerms = checkPerms;
