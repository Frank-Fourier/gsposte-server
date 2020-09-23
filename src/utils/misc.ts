/**
 * MISC UTILITY FUNCTIONS
 */

/**
 * Groups an array by a specific key.
 * Returns an object where each key has its own grouped array.
 * Example usage:
 *
 * @param array {Array<T>} Array to group
 * @param property {(x: T) => string} Function which returns the key to group by
 * @returns {{ [key: string]: Array<T> }} Grouped by key arrays
 * @example lettersByKind = groupBy<LetterDocument>(letters, l => l.kind);
 */
export function groupBy<T>(array: Array<T>, property: (x: T) => string): { [key: string]: Array<T> } {
    return array.reduce((memo: { [key: string]: Array<T> }, x: T) => {
        if (!memo[property(x)]) memo[property(x)] = [];
        memo[property(x)].push(x);
        return memo;
    }, {});
}

/**
 * Insert an object into another object based on a condition.
 *
 * @param condition {boolean} Condition to respect
 * @param obj {object} Object to insert
 * @param defaultValue {any} Default value to insert if the condition is falsy. Defaults to {}
 * @returns {object} Object ready to be inserted via the rest operator
 * @example
 * {
 *     ...insert(needsApples, { apples: 2 }),
 *     oranges: 1
 * }
 */
export function insert(condition: boolean, obj: object, defaultValue?: any): object {
    return condition ? obj : (defaultValue || {})
}

/**
 * Formats a currency based on the default italian locale.
 *
 * @param price {number} Price to format
 * @returns {string} Formatted price
 * @example formatted = formatCurrency(34.1256); // formatted = "34,125 €"
 */
export function formatCurrency(price: number): string {
    const [ int, decimal ] = price.toFixed(2).split(".");
    return `${int},${decimal?.padEnd(2, "0") || "00"} €`;
}
