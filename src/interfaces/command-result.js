// eslint-disable-next-line no-unused-vars
const { Message } = require('discord.js');

/**
 * A "command result" is a simple public class that conveys information about the result of a command that executed.
 */
class CommandResult {
    // Instance fields are node 12 only, and our eslint config doesn't handle them yet either.
    /** @type {boolean} Whether the command was successful */
    // success = null;
    /** @type {boolean} Whether the bot encountered an error processing the command */
    // botError = false;
    /** @type {boolean} Whether the command sent a DM */
    // sentDm = false;
    /** @type {boolean} Whether the command replied at all (either publicly or privately). */
    // replied = false;
    /** @type {Message} The original command request message (a Discord Message object) */
    // message = null;

    /**
     * @param {object} c Config object
     * @param {boolean} c.success Whether the command was successful
     * @param {boolean} c.botError Whether the bot encountered an error processing the command
     * @param {boolean} c.sentDm Whether the command sent a DM
     * @param {boolean} c.replied Whether the command sent a response (public or DM).
     * @param {Message} c.message The original command request
     */
    constructor({
        success = null,
        botError = false,
        sentDm = false,
        replied = false,
        message = null,
    } = {}) {
        this.success = success;
        this.botError = botError;
        this.sentDm = sentDm;
        this.replied = sentDm || replied;
        this.message = message;
    }
}

module.exports = CommandResult;
