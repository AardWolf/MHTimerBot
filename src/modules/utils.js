/**
 * Helper function to convert all elements of an iterable container into an oxford-comma-delimited
 * string.
 * @param {string[] | Set <string> | Map <string, string> | Object <string, string>} container
 *        An iterable container, of which the contents should be converted into a string.
 * @param {string} [final] The final conjunction ('and' or 'or')
 * @returns {string} The container contents as an nice string with Oxford comma punctuation.
 */
function oxfordStringifyValues(container, final = 'and') {
    let printables = [];
    if (typeof container !== 'object')
        throw new TypeError(`Utils: bad input for 1st argument: Expected object, got ${typeof container}`);
    else if (Array.isArray(container))
        printables = container;
    else if (container instanceof Set || container instanceof Map)
        printables = Array.from(container.values());
    else
        printables = Array.from(Object.values(container));

    const count = printables.length;
    if (!count)
        return '';
    else if (count === 1)
        return `${printables[0]}`;
    else if (count === 2)
        return `${printables[0]} ${final} ${printables[1]}`;

    return printables.slice(0, -1).join(', ') + `, ${final} ${printables.slice(-1)}`;
}

/**
 * @typedef {Object} ColumnFormatOptions
 * @property {number} [columnWidth] The total width of the largest value in the column
 * @property {boolean} [isFixedWidth] If true, the input width will not be dynamically computed based on the values in the given column
 * @property {string} [prefix] a string or character which should appear in the column before the column's value. e.g. $
 * @property {string} [suffix] a string or character which should appear in the column after the column's value. e.g. %
 * @property {boolean} [alignRight] Whether the column should be right-aligned (default: left-aligned)
 * @property {boolean} [convertToPercent] Whether the value is a raw float that should be converted to a percentage value by multiplying by 100. (Does not add a % to the end)
 * @property {number} [numDecimals] For right-aligned values that are converted to percent, the number of decimals kept.
 */

/**
 * Given the input array and headers, computes a ready-to-print string that lines up the values in each column.
 *
 * @param {Object <string, any>[]} body an array of object data to be printed.
 * @param {Object <string, ColumnFormatOptions>} columnFormat An array of objects that describe the formatting to apply to the given column in the output table.
 * @param {{key: string, label: string}[]} headers The headers which will label the columns in the output table, in the order to be arranged. The key property should
 *                                                 match a key in the body and columnFormat objects, and the label should be the desired column header text.
 * @param {string} [headerUnderline] a character to use to draw an "underline", separating the printed header row from the rows of the body.
 * @returns {string} an internally-aligned string that will print as a nice table in Discord.
 */
function prettyPrintArrayAsString(body, columnFormat, headers, headerUnderline) {
    // The body should be an array of objects.
    if (!body || !Array.isArray(body) || !Object.keys(body[0]).length)
        throw new TypeError(`Input body was of type ${typeof body}. Expected an array of objects.`);
    // The column formatter should be an object.
    if (!columnFormat || !Object.keys(columnFormat).length)
        throw new TypeError('Input column formatter was of wrong type (or had no keys).');
    // The headers should be an array of objects with at minimum 'key' and 'label' properties, of which 'key' must have a non-falsy value.
    if (!headers || !Array.isArray(headers) || !headers.every(col => (col.key && col.label !== undefined)))
        throw new TypeError('Input headers of incorrect type. Expected array of objects with properties \'key\' and \'label\'.');
    // All object keys in the headers array must be found in both the body and columnFormat objects.
    const bodyKeys = body.reduce((acc, row) => { Object.keys(row).forEach(key => acc.add(key)); return acc; }, new Set());
    if (!headers.every(col => (bodyKeys.has(col.key) && columnFormat[col.key] !== undefined)))
        throw new TypeError('Input header array specifies non-existent columns.');

    // Ensure that the column format prefix/suffix strings are initialized.
    for (const col in columnFormat) {
        ['prefix', 'suffix'].forEach(key => {
            columnFormat[col][key] = columnFormat[col][key] || (columnFormat[col][key] === 0 ? '0' : '');
        });
    }

    // To pad the columns properly, we must determine the widest column value of each column.
    // Initialize with the width of the column's header text.
    for (const col of headers)
        if (!columnFormat[col.key].isFixedWidth)
            columnFormat[col.key].columnWidth = Math.max(col.label.length, columnFormat[col.key].columnWidth);

    // Then parse every row in the body. The column width will be set such that any desired prefix or suffix can be included.
    // If a column is specified as fixed width, it is assumed that the width was properly set.
    for (const row of body)
        for (const col in columnFormat)
            if (!columnFormat[col].isFixedWidth)
                columnFormat[col].columnWidth = Math.max(
                    columnFormat[col].columnWidth,
                    row[col].length + columnFormat[col].prefix.length + columnFormat[col].suffix.length,
                );

    // Stringify the header information. Headers are center-padded if they are not the widest element in the column.
    const output = [
        headers.reduce((row, col) => {
            let text = col.label;
            const diff = columnFormat[col.key].columnWidth - text.length;
            if (diff < 0)
                // This was a fixed-width column that needs to be expanded.
                columnFormat[col.key].columnWidth = text.length;
            else if (diff > 0)
                // Use padStart and padEnd to center-align this not-the-widest element.
                text = text.padStart(Math.floor(diff / 2) + text.length).padEnd(columnFormat[col.key].columnWidth);

            row.push(text);
            return row;
        }, []).join(' | '),
    ];

    // If there is a underline string, add it.
    if (headerUnderline || headerUnderline === 0) {
        let text = String(headerUnderline).repeat(output[0].length / headerUnderline.length);
        text = text.substr(0, output[0].length);
        output.push(text);
    }

    // Add rows to the output.
    for (const row of body) {
        const rowText = [];
        // Fill the row's text based on the specified header order.
        for (let i = 0, len = headers.length; i < len; ++i) {
            const key = headers[i].key;
            let text = row[key].toString();
            const options = columnFormat[key];

            // If the convertToPercent flag is set, multiply the value by 100, and then drop required digits.
            // e.x. 0.123456 -> 12.3456
            // TODO: use Number.toLocaleString instead, with max fraction digits.
            if (options.convertToPercent) {
                text = parseFloat(text);
                if (!isNaN(text)) {
                    text = text * 100;
                    if (options.numDecimals === 0)
                        text = Math.round(text);
                    else if (!isNaN(parseInt(options.numDecimals, 10))) {
                        const factor = Math.pow(10, Math.abs(parseInt(options.numDecimals, 10)));
                        if (factor !== Infinity)
                            text = Math.round(text * factor) / factor;
                    }
                    // The float may have any number of decimals, so we should ensure that there is room for the prefix and suffix.
                    text = String(text).substr(0, options.columnWidth - options.suffix.length - options.prefix.length);
                }
                text = String(text);
            }

            // Add the desired prefix and suffix for this column, and then pad as desired.
            text = `${options.prefix}${text}${options.suffix}`;
            if (options.alignRight)
                text = text.padStart(options.columnWidth);
            else
                text = text.padEnd(options.columnWidth);
            rowText.push(text);
        }
        output.push(rowText.join(' | '));
    }
    return output.join('\n');
}

/**
 * Simple utility function to tokenize a string, preserving double quotes.
 * Returns an array of the detected words from the input string.
 *
 * @param {string} input A string to split into tokens.
 * @returns {string[]} array
 */
function splitString(input) {
    const tokens = [];
    const splitRegexp = /[^\s"]+|"([^"]*)"/gi;

    let match = '';
    do {
        match = splitRegexp.exec(input);
        if (match) {
            // If we captured a group (i.e. a quoted phrase), push that, otherwise push the match (i.e. a single word).
            tokens.push(match[1] ? match[1] : match[0]);
        }
    } while (match);
    return tokens;
}

/**
 * Returns a string ending that specifies the (human-comprehensible) amount of
 * time remaining before the given input.
 * Ex "in 35 days, 14 hours, and 1 minute"
 *
 * @param {DateTime} in_date The impending time that humans must be warned about.
 * @returns {string} A timestring that indicates the amount of time left before the given Date.
 */
function timeLeft(in_date) {
    const units = ['days', 'hours', 'minutes'];
    const remaining = in_date.diffNow(units);

    // Make a nice string, but only if there are more than 60 seconds remaining.
    if (remaining.as('milliseconds') < 60 * 1000)
        return 'in less than a minute';

    // Push any nonzero units into an array, removing "s" if appropriate (since unit is plural).
    const labels = [];
    units.forEach(unit => {
        const val = remaining.get(unit);
        if (val)
            labels.push(`${val.toLocaleString('en-US', { maximumFractionDigits: 0 })} ${(val !== 1) ? unit : unit.slice(0, -1)}`);
    });
    return `in ${oxfordStringifyValues(labels, 'and')}`;
}

exports.oxfordStringifyValues = oxfordStringifyValues;
exports.prettyPrintArrayAsString = prettyPrintArrayAsString;
exports.splitString = splitString;
exports.timeLeft = timeLeft;
