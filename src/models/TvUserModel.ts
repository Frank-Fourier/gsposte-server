import { Decoder, object, optional, string } from "@mojotech/json-type-validation";

/**
 * @swagger
 *
 * definitions:
 *   TvUser:
 *     type: object
 *     required:
 *       - username
 *     properties:
 *       username:
 *         type: string
 *         example: UtenteTV
 *       email:
 *         type: string
 *         example: silvio.troia@gmail.com
 *       password:
 *         type: string
 *         example: DamnRight
 */
export interface TvUser {
    username: string
    email?: string
    password?: string
}
export const tvUserDecoder: Decoder<TvUser> = object({
    user: optional(string()),
    username: string(),
    email: optional(string()),
    password: optional(string()),
});
