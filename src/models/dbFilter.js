// {
//     "code_name": "all_time",
//     "display_name": "All Time",
//     "start_time": null,
//     "end_time": null,
//     "updated": "0",
//     "minimum_seen": "2",
//     "sort": "1",
//     "last_update": "1633882499",
//     "dynamic_start": "25920000"
// }

/**
 * A simple class that represents a database filter used by MHCT to group event data or various arbitrary time spans.
 * @typedef {object} DatabaseFilter
 * @property {string} code_name
 * @property {string} lowerValue a lowercased version of `code_name` for use by comparison algorithms
 */
class DatabaseFilter {
    /**
     * @param {string} code_name
     * @param {Object <string, string|null} rest
     */
    constructor(code_name, rest) {
        this.code_name = code_name;
        this.start_time = rest.start_time;
        this.end_time = rest.end_time;
        this.dynamic_start = rest.dynamic_start;

        // Allow ranking this entity by lowerValue:
        this.lowerValue = this.code_name.toLowerCase();

        // Don't allow other modifications of this object.
        Object.freeze(this);
    }
}

/**
 * A filter that has a dynamic start time, representing a sliding window of time.
 * @typedef {object} DynamicDatabaseFilter
 * @property {null} start_time
 * @property {null} end_time
 * @property {string} dynamic_start
 */

/**
 * A filter that has a fixed start and end time, representing some fixed period of time.
 * @typedef {object} PastEventDatabaseFilter
 * @property {string} start_time The beginning of the filter, in epoch SECONDS, as a string.
 * @property {string} end_time The end of the filter, in epoch SECONDS, as a string.
 * @property {null} dynamic_start
 */

/**
 * A filter that has a fixed start time, but a null end time, as the time period is still open.
 * @typedef {object} OngoingEventDatabaseFilter
 * @property {string} start_time The beginning of the filter, in epoch SECONDS, as a string.
 * @property {null} end_time
 * @property {null} dynamic_start
 */

module.exports = DatabaseFilter;
