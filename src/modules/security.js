const Discord = require('discord.js');

// Extract type-hinting definitions for Discord classes.
// eslint-disable-next-line no-unused-vars
const { Client, Collection, Guild, GuildMember, Message, MessageEmbed, User } = Discord;



/**
 * Checks the permissions of the member to see if they're at the minimum level
 * @param {GuildMember} member Guild member to confirm permissions for
 * @param {String} level Minimum level required
 * @returns boolean Whether the user is at that level or higher
 */
function checkPerms(member, level) {
    const guild = member.guild;
    let authCheck = false;
    if (member.id === member.client.settings.owner)
        authCheck = true;
    if ((level === 'admin') || (level === 'mod')) {
        if ('adminrole' in member.client.settings.guilds[guild.id]) {
            authCheck = member.roles.cache.some(role => role.name === member.client.settings.guilds[guild.id].adminrole);
        } else {
            authCheck = member.hasPermission('ADMINISTRATOR');
        }
    }
    if (level === 'mod') {
        if ('modrole' in member.client.settings.guilds[guild.id]) {
            authCheck = member.roles.cache.some(role => role.name === member.client.settings.guilds[guild.id].modrole);
        } else {
            authCheck = member.hasPermission('MANAGE_MESSAGES');
        }
    }
    return authCheck;
}

exports.checkPerms = checkPerms;
