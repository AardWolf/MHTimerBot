/**
 * @property {Message} message The original command
 * @property {boolean} dm Whether the bot sent a DM
 * @param {boolean} success Whether it succeeded
 */

/**
* CommandData is something a command can return to say how well it did
* @class CommandData
*/


class CommandData {
    /**
     * Construct a CommandData object based on the input data from a command.
     *
     * @constructor
     * @param {Message} message
     * @param {boolean} dm
     * @param {boolean} success
     */
    constructor(message, dm, success) {
        this._message = message;
        this._dm = dm;
        this._success = success;
    }
    
    /**
     * Returns the original message
     *
     * @returns {Message} The original command sent by the user.
     */
    getMessage() {
        return this._message;
    }
    
    /**
     * Returns the dm boolean
     *
     * @returns {boolean} Whether the user was DM'ed.
     */
    getDm() {
        return this._dm;
    }

    /**
     * Returns the success boolean
     *
     * @returns {boolean} Whether the command was successful.
     */
    getSuccess() {
        return this._success;
    }
}
