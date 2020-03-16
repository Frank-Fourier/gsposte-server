import uuid from "uuid/v4";
import generate from "nanoid/generate";
// @ts-ignore
import englishUppercase from "nanoid-dictionary/uppercase";

/**
 * Generates a pseudo-random time-based code that you can use for various purposes
 * The code will always have a length of 10
 */
export function generateRandomCode(): string {
    return generate(englishUppercase, 10);
}

/**
 * Generates a random truly-unique UUIDv4 (36 characters)
 * The seed is time-machine based
 */
export function generateUUID(): string {
    return uuid().toUpperCase();
}
