/**
 * Decimal adjustment of a number.
 *
 * @param {string} type The type of adjustment.
 * @param {number} value The number.
 * @param {number} exp The exponent (the 10 logarithm of the adjustment base).
 * @returns {number} The adjusted value.
 */
export function decimalAdjust(type: "round" | "floor" | "ceil", value: any, exp: number) {
    const math = Math as any;

    // If the exp is undefined or zero...
    if (typeof exp === 'undefined' || +exp === 0) {
        return math[type](value);
    }
    value = +value;
    exp = +exp;

    // If the value is not a number or the exp is not an integer...
    if (isNaN(value) || !(typeof exp === 'number' && exp % 1 === 0)) {
        return NaN;
    }

    // Shift
    value = value.toString().split('e');
    value = math[type](+(value[0] + 'e' + (value[1] ? (+value[1] - exp) : -exp)));

    // Shift back
    value = value.toString().split('e');
    return +(value[0] + 'e' + (value[1] ? (+value[1] + exp) : exp));
}

export function preciseRound(value: number, exp: number) {
    return decimalAdjust("round", value, exp);
}

export function preciseFloor(value: number, exp: number) {
    return decimalAdjust("floor", value, exp);
}

export function preciseCeil(value: number, exp: number) {
    return decimalAdjust("ceil", value, exp);
}
