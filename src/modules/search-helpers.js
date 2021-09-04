/**
 * Return a sorted list of approximate matches to the given input and container
 *
 * @param {string} input The text to match against
 * @param {Array} values An array of objects with a lowerValue property.
 * @returns {Array <number>[]} Up to 10 indices and their search score.
 */
function getSearchedEntity(input, values) {
    if (!input.length || !Array.isArray(values) || !values || !values.length)
        return [];

    const matches = values.filter(v => v.lowerValue.includes(input.toLowerCase())).map(v => {
        return { entity: v, score: v.lowerValue.indexOf(input.toLowerCase()) };
    });
    matches.sort((a, b) => {
        const r = a.score - b.score;
        // Sort lexicographically if the scores are equal.
        return r ? r : a.entity.value.localeCompare(b.entity.value, { sensitivity: 'base' });
    });
    // Keep only the top 10 results.
    matches.splice(10);
    return matches.map(m => m.entity);
}

module.exports.getSearchedEntity = getSearchedEntity;