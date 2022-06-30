// Originally derived from https://stackoverflow.com/questions/12008120/console-log-timestamps-in-chrome
const { DateTime } = require('luxon');

/**
 * Inserts the current time as ISO 8601 as the first argument
 * @param {any} firstArg
 * @param  {...any} rest
 * @returns {any[]} an array of the arguments to the function, the first of which includes the timestamp.
 */
const addTimestamp = (firstArg, ...rest) => {
    const timestamp = DateTime.utc().toJSON();
    return (typeof firstArg === 'string')
        ? [`[${timestamp}] ${firstArg}`, ...rest]
        : [`[${timestamp}]`, firstArg, ...rest];
};

module.exports = class TimeStampedLogger {
    /**
     * @param {...any} args Items to debug in a timestamped console
     */
    static debug(...args) {
        if (!args.length) return;
        console.debug.apply(console, addTimestamp(...args));
    }

    /**
     * @param {...any} args Items to log in a timestamped console
     */
    static log(...args) {
        if (!args.length) return;
        console.log.apply(console, addTimestamp(...args));
    }

    /**
     * @param {...any} args Items to log in a timestamped console as warnings
     */
    static warn(...args) {
        if (!args.length) return;
        console.warn.apply(console, addTimestamp(...args));
    }

    /**
     * @param {...any} args Items to log in a timestamped console as errors
     */
    static error(...args) {
        if (!args.length) return;
        console.error.apply(console, addTimestamp(...args));
    }
};
