import uuid from "uuid/v4";

/**
 * Generates a pseudo-random time-based code that you can use for various purposes
 * The code will always have a length of 11
 */
export function generateRandomCode(): string {
    return (Math.floor(Math.random() * 10) + new Date().getTime()).toString(36).toUpperCase();
}

/**
 * Generates a random truly-unique UUIDv4 (36 characters)
 * The seed is time-machine based
 */
export function generateUUID(): string {
    return uuid();
}
