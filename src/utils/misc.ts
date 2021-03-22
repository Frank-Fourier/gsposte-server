/**
 * MISC UTILITY FUNCTIONS
 */

import { Document, Schema } from "mongoose";

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
export function insert(condition: boolean, obj: any, defaultValue?: any): any {
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
    return `€ ${int},${decimal?.padEnd(2, "0") || "00"}`;
}

/**
 * If the argument is a non-populated object id, returns its string representation.
 * Otherwise, returns its id directly
 *
 * @param docOrId {ObjectId | Document}
 * @returns {string}
 */
export function getDocumentId(docOrId: Schema.Types.ObjectId | Document | any): string {
    return docOrId instanceof Schema.Types.ObjectId ? docOrId.toString() : (docOrId as Document).id.toString()
}
