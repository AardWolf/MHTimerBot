// Timer Class
const { DateTime, Duration, Interval } = require('luxon');
const Logger = require('./logger');

/**
 * @typedef {object} TimerSeed A serializable representation of a timer, suitable for reading and writing with JSON files.
 *
 * @property {string} area The area shorthand (e.g. fg) that this timer is for
 * @property {string} sub_area Areas may have multiple things to care about, such as "close" or "open"
 * @property {string} seed_time A reference timestamp string that indicates when this timer turned on. Assumed ISO format.
 * @property {number | {}} repeat_time The duration of the timer interval, in milliseconds or a luxon Duration object format. e.g. 72 000 000, {seconds: 72000}, {seconds: 71000, milliseconds: 1000000}
 * @property {string} announce_string The message printed when this timer activates, i.e. "X is happening right now"
 * @property {string} demand_string The message printed when this timer is upcoming, i.e. "do this before X happens"
 * @property {number | {}} announce_offset How far in advance of the actual "activation time" the timer should be activated to send reminders, in milliseconds or luxon Duration object format.
 * @property {boolean} silent If it's silent it doesn't get announced but otherwise works
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
            throw new TypeError('Timer construction requires an input seed object.');

        // If the input Timer seed is a primitive (e.g. 1), or is missing required properties, bail.
        const keys = Object.keys(seed);
        const required = ['area', 'seed_time', 'repeat_time'];
        // If a required key is missing, or has a falsy value, then the seed is invalid.
        if (!keys.length || !required.every(rq => (keys.indexOf(rq) !== -1 && seed[rq])))
            throw new TypeError(`Input timer seed is missing required keys or values. Require values for keys "${required.join('", "')}".`);

        // Assign area and sub_area.
        this._area = String(seed.area);
        if (seed.sub_area)
            this._subArea = String(seed.sub_area);

        // Validate and assign time values.
        this._seedTime = DateTime.fromISO(seed.seed_time); // Are they ISO format? or something else?
        if (!this._seedTime.isValid)
            throw new TypeError(`(${this.name}): Input seed time "${seed.seed_time}" failed to parse into a valid DateTime.`);

        // Create the Duration that represents the time period between activations.
        this._repeatDuration = getAsDuration(seed.repeat_time || 0, true);
        if (this._repeatDuration.as('minutes') < 1)
            throw new RangeError(`(${this.name}): Input repeat duration is "${seed.repeat_time}" (invalid or too short).`);

        // Require the stored seed time to be in the past.
        while (DateTime.utc() < this._seedTime) {
            Logger.warn(`(${this.name}): seed time ("${this._seedTime}") in future: decrementing ${this._repeatDuration.as('minutes')} minutes.`);
            this._seedTime = this._seedTime.minus(this._repeatDuration);
        }

        // Always set an announce string.
        this._announcement = seed.announce_string;
        if (!this._announcement) {
            Logger.warn(`(${this.name}): using default announce string.`);
            this._announcement = 'This is a default string because the timer was not set up properly';
        }

        // If not provided, the demand string defaults to the announce string.
        this._demand = seed.demand_string;
        if (!this._demand) {
            Logger.log(`(${this.name}): defaulted demand string to announce string '${this._announcement}'.`);
            this._demand = this._announcement;
        }

        // If no advance warning is specified, the timer will send reminders only when it activates.
        this._advanceNotice = getAsDuration(seed.announce_offset || 0, true);

        // Default to not silent
        this._silent = !!seed.silent;

        /** @type {Object <string, NodeJS.Timer>} the NodeJS.Timer object created by NodeJS.setTimeout() */
        this._timeout = {};
        /** @type {Object <string, NodeJS.Timer>} the NodeJS.Timer object created by NodeJS.setInterval() */
        this._interval = {};

        // Set a unique id for this timer.
        this._id = getId();
    }

    /**
     * A loggable/printable name for this timer, based on the area and sub-area.
     *
     * @instance
     * @returns {string} e.g. "fg: close"
     */
    get name() {
        return `${this._area}${this._subArea ? `: ${this._subArea}` : ''}`;
    }

    /**
     * A uniquely-identifing property for this specific timer.
     *
     * @instance
     * @returns {string} e.g. "1"
     */
    get id() {
        return this._id;
    }

    /**
     * Advances the known last activation time by the repeat duration.
     * @instance
     */
    advance() {
        if (this._lastActivation) {
            const next = this._lastActivation.plus(this._repeatDuration);
            if (next > DateTime.utc())
                Logger.warn(`(${this.name}): Skipped requested advancement into the future.`);
            else
                this._lastActivation = next;
        }
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
        if (!this._lastActivation || !(this._lastActivation instanceof DateTime) || !this._lastActivation.isValid) {
            // Seed time is guaranteed to be in the past by the Timer constructor, so this is a
            // well - formed Interval with at least one value.
            if (now < this._seedTime)
                Logger.error(`(${this.name}): Assertion of seed time in the past failed.`);
            const activations = Interval.fromDateTimes(this._seedTime, now).splitBy(this._repeatDuration).map(i => i.start);
            this._lastActivation = activations.pop();

            Logger.log(`(${this.name}): Cached last activation (${this._lastActivation.toHTTP()})`);
        }

        // Ensure the cache is correct.
        const window = Interval.before(now, this._repeatDuration);
        while (this._lastActivation < now && !window.contains(this._lastActivation))
            this.advance();

        return this._lastActivation;
    }

    /**
     * Determine the next time this particular Timer activates.
     *
     * @instance
     * @returns {DateTime} a new Date object that indicates the next time this Timer will activate.
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
        let last = this.getLastActivation();
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
        return this._subArea || '';
    }

    /**
     * Returns the string to be displayed when the timer activates.
     *
     * @instance
     * @returns {string} The announcement associated with the timer.
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
     * @param {string} key The channel and guild identifier for this particular timeout.
     * @param {NodeJS.Timer} timeout a Node.js Timer started with setTimeout()
     */
    storeTimeout(key, timeout) {
        if (!key || !timeout)
            return;
        this.stopTimeout(key);

        this._timeout[key] = timeout;
    }

    /**
     * Stops and also removes the existing Node.js Timer object for this timer instance
     * If no key is given, all existing timeouts will be cleared.
     * @instance
     * @param {string} [key] The channel and guild identifier for this particular timeout.
     */
    stopTimeout(key) {
        if (key) {
            if (this._timeout[key])
                clearTimeout(this._timeout[key]);

            this._timeout[key] = null;
        }
        else {
            for (const key in this._timeout)
                clearTimeout(this._timeout[key]);
            this._timeout = {};
        }
    }

    /**
     * Stores the registered Node.js Timer object for this timer instance, after
     * stopping any existing intervals.
     *
     * @instance
     * @param {string} key The channel and guild identifier for this particular interval.
     * @param {NodeJS.Timer} interval a Node.js Timer initiated with setInterval()
     */
    storeInterval(key, interval) {
        if (!key || !interval)
            return;
        this.stopInterval(key);

        this._interval[key] = interval;
    }

    /**
     * Stops and also removes the existing Node.js Timer object for this timer instance.
     * If no key is given, all existing intervals will be cleared.
     *
     * @instance
     * @param {string} [key] The channel and guild identifier for this particular interval.
     */
    stopInterval(key) {
        if (key) {
            if (this._interval[key])
                clearInterval(this._interval[key]);

            this._interval[key] = null;
        }
        else {
            for (const key in this._interval)
                clearInterval(this._interval[key]);
            this._interval = {};
        }
    }

    /**
     * Lets the silent property be inspected
     *
     * @instance
     * @returns {boolean} whether this is a silent timer, meaning it shouldn't be scheduled
     */
    isSilent() {
        return this._silent;
    }
}

/**
 * Generator for timer identifiers
 *
 * @generator
 */
function* nextId() {
    let id = 0;
    while (true)
        yield (id++).toString();
}
/** Reference to an instantiated generator */
const id = nextId();
/**
 * Method to simplify timer identifier assignment
 *
 * @returns {string} a unique string identifier.
 */
function getId() {
    return id.next().value;
}
/**
 * Convert the given input into a Duration object
 * @param {{} | number} value a value from a user/file to be cast to a duration.
 *  e.g 36000000, {milliseconds: 36000000}, {hours: 10}, {hours: 9, minutes: 60}
 * @param {boolean} normalize If true, the Duration is converted to "human" units (default false)
 * @returns {Duration}
 */
function getAsDuration(value, normalize = false) {
    let dur = _isLuxonObject(value) ? Duration.fromObject(value) : Duration.fromMillis(value || 0);
    if (!dur.isValid) {
        Logger.error(`Received invalid input "${value}" to convert to a Duration.`);
        dur = Duration.fromMillis(0);
        // throw new TypeError(`Invalid argument to Duration constructor: ${value}`);
    }
    return (normalize ? dur.shiftTo('days', 'hours', 'minutes', 'seconds', 'milliseconds') : dur);
}
function _isLuxonObject(value) {
    // It's probably milliseconds, but if not, it needs to be an object.
    if (!value || !isNaN(parseInt(value, 10)) || value !== Object(value))
        return false;
    // It wasn't a valid number.
    const keys = Object.keys(value);
    if (!keys || !keys.length)
        return false;
    const dateTimeUnits = ['year', 'month', 'day', 'ordinal', 'weekYear', 'weekNumber', 'weekday', 'hour', 'minute', 'second', 'millisecond', 'zone', 'locale', 'outputCalendar', 'numberingSystem'];
    if (keys.every(key => dateTimeUnits.indexOf(key) !== -1))
        return true;
    const durationUnits = ['years', 'quarters', 'months', 'weeks', 'days', 'hours', 'minutes', 'seconds', 'milliseconds', 'locale', 'numberingSystem', 'conversionAccuracy'];
    if (keys.every(key => durationUnits.indexOf(key) !== -1))
        return true;
    return false;
}

module.exports = Timer;
