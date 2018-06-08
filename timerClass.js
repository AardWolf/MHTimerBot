// Timer Class
const { DateTime, Duration, Interval } = require('luxon');

/**
 * A serializable representation of a timer, suitable for reading and writing with JSON files.
 *
 * @typedef {Object} TimerSeed
 * @property {string} area The area shorthand (e.g. fg) that this timer is for
 * @property {string} sub_area Areas may have multiple things to care about, such as "close" or "open"
 * @property {string} seed_time A reference RFC3339 timestamp string, e.g. "2017-07-24T12:00:00.000Z" that indicates when this timer turned on.
 * @property {number} repeat_time The duration of the timer interval, in milliseconds. e.g. 72 000 000
 * @property {string} announce_string The message printed when this timer activates, i.e. "X is happening right now"
 * @property {string} demand_string The message printed when this timer is upcoming, i.e. "do this before X happens"
 */

/**
 * @class Timer
 */
class Timer {
    /**
     * Construct a Timer object based on the input data from a file.
     * @constructor
     * @param {TimerSeed} seed
     */
    constructor(seed) {
        if (!seed) {
            console.log("Timer constructor did not receive an object seed as input.");
            process.exit(1);
        }
        // If the input Timer seed is a primitive (e.g. 1), or is missing required properties, bail. 
        const keys = Object.keys(seed);
        const required = ['area', 'seed_time', 'repeat_time'];
        if (!keys.length ||
                // If the required key is missing, or has a falsy value, then the seed is invalid.
                !required.every((rq) => { return (keys.indexOf(rq) !== -1 && seed[rq]); })) {
            console.log("Invalid input timer seed: missing required keys.");
            process.exit(1);
        }

        // Assign area and sub_area.
        this._area = String(seed.area);
        if (seed.sub_area)
            this._subArea = String(seed.sub_area);

        // Validate and assign time values.
        this._seedTime = DateTime.fromISO(seed.seed_time);
        if (!this._seedTime.isValid) {
            console.log(`Timer constructor failed to parse date from ${seed.seed_time} for ${seed.area}.`);
            process.exit(1);
        }

        this._repeatDuration = Duration.fromMillis(seed.repeat_time);
        if (!this._repeatDuration.isValid || this._repeatDuration.as('milliseconds') < 60000) {
            console.log(`Input seed repeat time was ${seed.repeat_time}, which is invalid or too short.`);
            process.exit(1);
        }

        // Always set an announce string.
        this._announcement = seed.announce_string;
        if (!this._announcement) {
            console.log(`Initialized default announce string for timer in ${this._area}`);
            this._announcement = "This is a default string because the timer was not set up properly";
        }

        // If not provided, the demand string defaults to the announce string.
        this._demand = seed.demand_string;
        if (!this._demand) {
            console.log(`Defaulted 'demand string' for timer in ${this._area} to its announce string '${this._announcement}'.`);
            this._demand = this._announcement;
        }

        // If no advance warning is specified, the timer will send reminders only when it activates.
        this._advanceNotice = seed.announce_offset || 0;

        /** @type {NodeJS.Timer} the NodeJS.Timer object created by NodeJS.setTimeout() */
        this._timeout = null;
        /** @type {NodeJS.Timer} the NodeJS.Timer object created by NodeJS.setInterval() */
        this._interval = null;
    }

    /**
     * Determine the last time this particular Timer activated.
     * @instance
     * @returns {Date} a Date object that indicates the last time this Timer activated.
     */
    get getLastActivation() {
        const now = Date.now();
        // Note: % in JavaScript is 'remainder', not 'modulo': -1 % 8 = -1
        return new Date(now + (this._seedTime - now) % this._repeatDuration);
    }

    /**
     * Determine the next time this particular Timer activates.
     *
     * @instance
     * @returns {Date} a Date object that indicates the next time this Timer will activate.
     */
    get getNext() {
        const last = this.getLastActivation().getTime();
        return new Date(last + this._repeatDuration);
    }

    /**
     * Return a generator to obtain any number of Date objects that describe when this
     * timer activates.
     *
     * @instance
     * @generator
     */
    * upcoming() {
        var last = this.getLastActivation().getTime();
        while (true) {
            last += this._repeatDuration;
            yield new Date(last);
        }
    }

    /**
     * Returns the area to which this timer applies, e.g. "Forbidden Grove"
     *
     * @instance
     * @returns {string} The area for this timer.
     */
    getArea() {
        return this._area;
    }

    /**
     * Returns the sub-area, if applicable, that tunes how this timer behaves. For example,
     * if this is the timer that announces the "close" action of Forbidden Grove.
     *
     * @instance
     * @returns {string|null} A specification, or undefined if no such specification exists.
     */
    getSubArea() {
        return this._subArea;
    }

    /**
     * Returns the string to be displayed when the timer activates.
     *
     * @instance
     * @returns {string} The announcment associated with the timer.
     */
    getAnnouncement() {
        return this._announcement;
    }

    /**
     * Return the number of milliseconds before activation that the demand string should
     * be sent out
     * 
     * @instance
     * @returns {number}
     */
    getAnnounceOffset() {
        return this._advanceNotice;
    }

    /**
     * Returns the string to be displayed when this timer is nearing activation
     * 
     * @instance
     * @returns {string} A call to action, e.g. "Closing soon, travel early!"
     */
    getDemand() {
        return this._demand;
    }

    /**
     * Return the number of milliseconds between activations of this timer
     * @instance
     * @returns {number}
     */
    getRepeatInterval() {
        return this._repeatDuration;
    }

    /**
     * Return the Node.js Timer object created with setTimeout() for this timer instance.
     *
     * @instance
     * @returns {NodeJS.Timer} 
     */
    getTimeout() {
        return this._timeout;
    }

    /**
     * Stores the registered Node.js Timer object for this timer instance, after stopping any existing ones.
     *
     * @instance
     * @param {NodeJS.Timer} timeout a Node.js Timer started with setTimeout()
     */
    storeTimeout(timeout) {
        if (!timeout || !timeout.ref)
            return;
        if (this.hasTimeout)
            this.stopTimeout();
    
        this._timeout = timeout;
        this.hasTimeout = true;
    }

    /**
     * Stops and also removes the existing Node.js Timer object for this timer instance
     *
     * @instance
     */
    stopTimeout() {
        if (this.hasTimeout)
            clearTimeout(this._timeout);

        this._timeout = null;
        this.hasTimeout = false;
    }

    /**
     * Returns the Node.js Timer object for this timer instance that was created with setInterval().
     *
     * @instance
     * @returns {NodeJS.Timer} the Node.js Timer that was created with setInterval().
     */
    getInterval() {
        return this._interval;
    }

    /**
     * Stores the registered Node.js Timer object for this timer instance, after
     * stopping any existing intervals.
     *
     * @instance
     * @param {NodeJS.Timer} interval a Node.js Timer initiated with setInterval()
     */
    storeInterval(interval) {
        if (!interval || !interval.ref) // .ref() is void....
            return;
        if (this.hasInterval)
            this.stopInterval();

        this._interval = interval;
        this.hasInterval = true;
    }

    /**
     * Stops and also removes the existing Node.js Timer for this timer instance.
     *
     * @instance
     */
    stopInterval() {
        if (this.hasInterval)
            clearInterval(this._interval);

        this._interval = null;
        this.hasInterval = false;
    }
}


module.exports = Timer;
