// Timer Class
const { DateTime, Duration, Interval } = require('luxon');

/**
 * @typedef {Object} TimerSeed A serializable representation of a timer, suitable for reading and writing with JSON files.
 *
 * @property {string} area The area shorthand (e.g. fg) that this timer is for
 * @property {string} sub_area Areas may have multiple things to care about, such as "close" or "open"
 * @property {string} seed_time A reference RFC3339 timestamp string, e.g. "2017-07-24T12:00:00.000Z" that indicates when this timer turned on.
 * @property {number} repeat_time The duration of the timer interval, in milliseconds. e.g. 72 000 000
 * @property {string} announce_string The message printed when this timer activates, i.e. "X is happening right now"
 * @property {string} demand_string The message printed when this timer is upcoming, i.e. "do this before X happens"
 */

/**
 * Timers track various events within MouseHunt, generally things that would otherwise not be visible without travel. For example,
 * a Timer could be created to track when the Toxic Spill location's severity reaches the "Archduke" level. When a timer activates,
 * a message is sent to the MouseHunt Discord's #timers channel, and also to any subscribed Discord users via PM. Optionally, a
 * Timer can offer an advanced notice of the upcoming activation - for example, being alerted that the Forbidden Grove has just
 * closed is far less useful than being notified that it is *about to close*.
 * 
 * @class Timer
 */
class Timer {
    /**
     * Construct a Timer object based on the input data from a file.
     *
     * @constructor
     * @param {TimerSeed} seed
     */
    constructor(seed) {
        if (!seed)
            throw new TypeError("Timer construction requires an input seed object.");
        
        // If the input Timer seed is a primitive (e.g. 1), or is missing required properties, bail. 
        const keys = Object.keys(seed);
        const required = ['area', 'seed_time', 'repeat_time'];
        if (!keys.length ||
                // If the required key is missing, or has a falsy value, then the seed is invalid.
                !required.every(rq => { return (keys.indexOf(rq) !== -1 && seed[rq]); }))
            throw new TypeError(`Input timer seed is missing required keys. Found only: ${keys.toString()}`);

        // Assign area and sub_area.
        this._area = String(seed.area);
        if (seed.sub_area)
            this._subArea = String(seed.sub_area);

        // Validate and assign time values.
        this._seedTime = DateTime.fromISO(seed.seed_time); // Are they ISO format? or something else?
        if (!this._seedTime.isValid)
            throw new TypeError(`(${this.name}): Input seed time ${seed.seed_time} failed to parse into a valid DateTime.`);

        // Create the Duration that represents the time period between activations.
        // Could switch from milliseconds serialization to an object, e.g.
        // { hours: 80 } and {days: 3, hours: 8} both mean the same thing.
        // this._repeatDuration = Duration.fromObject(seed.repeat_time);
        this._repeatDuration = Duration.fromMillis(Math.abs(seed.repeat_time));
        if (!this._repeatDuration.isValid || this._repeatDuration.as('minutes') < 1)
            throw new RangeError(`(${this.name}): Input seed repeat duration was ${seed.repeat_time}, which is invalid or too short.`);

        // Require the stored seed time to be in the past.
        while (DateTime.utc() < this._seedTime) {
            console.log(`(${this.name}): seed time ('${this._seedTime}') is in the future, decrementing by Duration ${this._repeatDuration}`);
            this._seedTime = this._seedTime.minus(this._repeatDuration);
        }

        // Always set an announce string.
        this._announcement = seed.announce_string;
        if (!this._announcement) {
            console.log(`(${this.name}): using default announce string.`);
            this._announcement = "This is a default string because the timer was not set up properly";
        }

        // If not provided, the demand string defaults to the announce string.
        this._demand = seed.demand_string;
        if (!this._demand) {
            console.log(`(${this.name}): defaulted demand string to announce string '${this._announcement}'.`);
            this._demand = this._announcement;
        }

        // If no advance warning is specified, the timer will send reminders only when it activates.
        this._advanceNotice = Duration.fromMillis(seed.announce_offset || 0);

        /** @type {NodeJS.Timer} the NodeJS.Timer object created by NodeJS.setTimeout() */
        this._timeout = null;
        /** @type {NodeJS.Timer} the NodeJS.Timer object created by NodeJS.setInterval() */
        this._interval = null;
    }

    /**
     * A loggable/printable name for this timer, based on the area and sub-area.
     *
     * @returns {string} e.g. "fg: close"
     */
    get name() {
        let name = this._area;
        if (this._subArea)
            name += ": " + this._subArea;
        return name;
    }

    /**
     * Called when the timer activates.
     */
    advance() {
        if (this._lastActivation)
            this._lastActivation = this._lastActivation.plus(this._repeatDuration);
    }

    /**
     * Determine the last time this particular Timer activated.
     * Caches the value for fast future accesses.
     *
     * @instance
     * @returns {DateTime} a DateTime object that indicates the last time this Timer activated.
     */
    getLastActivation() {
        const now = DateTime.utc();

        // Compute all activations based on the seed time, and cache the most recent one.
        if (!this._lastActivation || !this._lastActivation instanceof DateTime || !this._lastActivation.isValid) {
            // Seed time is guaranteed to be in the past by the Timer constructor, so this is a
            // well - formed Interval with at least one value.
            let activations = Interval.fromDateTimes(this._seedTime, now).splitBy(this._repeatDuration).map(i => { return i.start });
            this._lastActivation = activations.pop();

            console.log(`(${this.name}): rebuilt last activation cache.`);
        }

        // Ensure the cache is correct.
        while (!Interval.after(this._lastActivation, this._repeatDuration).contains(now)) {
            this.advance();

            console.log(`(${this.name}): had to update incorrect cached activation time.`);
        }

        return this._lastActivation;
    }

    /**
     * Determine the next time this particular Timer activates.
     *
     * @instance
     * @returns {DateTime} a Date object that indicates the next time this Timer will activate.
     */
    getNext() {
        return this.getLastActivation().plus(this._repeatDuration);
    }

    /**
     * Return a generator to obtain any number of Date objects that describe when this
     * timer activates.
     *
     * @param {DateTime} [until] The date & time beyond which no activations should be returned.
     * @instance
     * @generator
     */
    * upcoming(until) {
        var last = this.getLastActivation();
        while (!until || last.plus(this._repeatDuration) < until) {
            last = last.plus(this._repeatDuration);
            yield last;
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
     * @returns {string} The sub-area descriptor, or "" if none exists.
     */
    getSubArea() {
        return this._subArea || "";
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
     * Return the amount of time before activation that the Timer's warning/demand
     * string should be sent out
     *
     * @instance
     * @returns {Duration}
     */
    getAdvanceNotice() {
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
     * The amount of time between successive activations, e.g. 80 hours.
     *
     * @instance
     * @returns {Duration}
     */
    getRepeatInterval() {
        return this._repeatDuration;
    }

    /**
     * Stores the registered Node.js Timer object for this timer instance, after
     * stopping any existing timeout.
     *
     * @instance
     * @param {NodeJS.Timer} timeout a Node.js Timer started with setTimeout()
     */
    storeTimeout(timeout) {
        if (!timeout)
            return;
        this.stopTimeout();
    
        this._timeout = timeout;
    }

    /**
     * Stops and also removes the existing Node.js Timer object for this timer instance
     *
     * @instance
     */
    stopTimeout() {
        if (this._timeout)
            clearTimeout(this._timeout);

        this._timeout = null;
    }

    /**
     * Stores the registered Node.js Timer object for this timer instance, after
     * stopping any existing intervals.
     *
     * @instance
     * @param {NodeJS.Timer} interval a Node.js Timer initiated with setInterval()
     */
    storeInterval(interval) {
        if (!interval)
            return;
        this.stopInterval();

        this._interval = interval;
    }

    /**
     * Stops and also removes the existing Node.js Timer object for this timer instance.
     *
     * @instance
     */
    stopInterval() {
        if (this._interval)
            clearInterval(this._interval);

        this._interval = null;
    }
}


module.exports = Timer;
