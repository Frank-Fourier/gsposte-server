import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { UserService } from "./UserService";
import { Strategy, ExtractJwt, VerifiedCallback } from "passport-jwt";
import { Request } from "express";
import { Handler as ExpressHandler } from "express";
import { UserDocument } from "../models/UserModel";
import passport from "passport";
import httpErrors from "http-errors";
import moment from "moment";
import jwt from "jwt-simple";
import { comparePasswords } from "../utils/crypto";

export interface JwtToken {
    exp: number
    userId: string
}

/**
 * @swagger
 *
 * definitions:
 *   LoginPayload:
 *     type: object
 *     required:
 *       - usernameOrEmail
 *       - password
 *     properties:
 *       usernameOrEmail:
 *         type: string
 *         example: GiovanniOr2
 *       password:
 *         type: string
 *         example: okokok!
 *         format: password
 */
export interface LoginPayload {
    usernameOrEmail: string
    password: string
}

/**
 * @swagger
 *
 * securityDefinitions:
 *   JWT:
 *      description: "JWT Token"
 *      type: "apiKey"
 *      name: "Authorization"
 *      in: "header"
 */
@provide(AuthService)
export class AuthService {

    constructor(
        @inject(UserService) private userService: UserService
    ) {}

    private getStrategy(): Strategy {
        return new Strategy({
            secretOrKey: process.env.JWT_SECRET,
            jwtFromRequest: ExtractJwt.fromExtractors([
                ExtractJwt.fromAuthHeaderWithScheme("jwt"),
            ]),
            passReqToCallback: true
        }, (req: Request, payload: JwtToken, done: VerifiedCallback) => {
            this.userService.findById(payload.userId)
                .then(user => {
                    if (!user) return done(null, false, { message: "User by token not found!" });
                    return done(null, user);
                })
                .catch(err => done(err));
        });
    }

    public getPassportMiddleware(): ExpressHandler {
        passport.use("jwt", this.getStrategy());
        return passport.initialize();
    }

    public createToken(user: UserDocument): string {
        const expires = moment().utc().add({ months: 1 }).unix();
        const token: JwtToken = {
            exp: expires,
            userId: user._id,
        };
        const encodedToken = jwt.encode(token, process.env.JWT_SECRET);

        return `JWT ${encodedToken}`;
    }

    public decodeToken(encodedToken: string): JwtToken {
        const split = encodedToken.split(" ");
        if (split.length !== 2) {
            throw new httpErrors.BadRequest("Invalid encoded token!");
        }

        return jwt.decode(split[1], process.env.JWT_SECRET);
    }

    public async login(payload: LoginPayload): Promise<string> {
        const user = await this.userService.queryOne({ $or: [
            { username: payload.usernameOrEmail },
            { email: payload.usernameOrEmail }
        ]}).exec();

        if (!user || !await comparePasswords(user.password, payload.password)) {
            throw new httpErrors.Unauthorized("Invalid username or password!");
        }

        return this.createToken(user);
    }

    public async getUserByToken(encodedToken: string): Promise<UserDocument> {
        try {
            return await this.userService.findById(
                this.decodeToken(encodedToken).userId
            );
        } catch (err) {
            throw new httpErrors.NotFound(err);
        }
    }

}
