/**
 * Return a sorted list of approximate matches to the given input and container
 *
 * @param {string} input The text to match against
 * @param {Array<{ value: string, lowerValue: string, [x: string]: any }>} values An array of objects with a lowerValue property.
 * @returns Up to 10 values, sorted descending by their similarity to the input.
 */
function getSearchedEntity(input, values) {
    if (!input.length || !Array.isArray(values) || !values.length) {
        return [];
    }
    const lowered = input.toLowerCase();
    const matches = values.filter((v) => v.lowerValue.includes(lowered))
        .map((v) => ({
            entity: v,
            score: v.lowerValue.indexOf(lowered),
        }));
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
