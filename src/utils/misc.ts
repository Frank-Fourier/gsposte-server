export function groupBy<T>(array: Array<T>, property: (x: T) => string): { [key: string]: Array<T> } {
    return array.reduce((memo: { [key: string]: Array<T> }, x: T) => {
        if (!memo[property(x)]) memo[property(x)] = [];
        memo[property(x)].push(x);
        return memo;
    }, {});
}

export function insert(condition: boolean, obj: object, defaultValue?: any) {
    return condition ? obj : (defaultValue || {})
}
