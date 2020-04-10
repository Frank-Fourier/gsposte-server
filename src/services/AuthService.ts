import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { UserService } from "./UserService";
import { ExtractJwt, Strategy, VerifiedCallback } from "passport-jwt";
import { Handler as ExpressHandler, Request } from "express";
import { UserDocument, UserRoles } from "@models/UserModel";
import passport from "passport";
import httpErrors from "http-errors";
import moment from "moment";
import jwt from "jwt-simple";
import { comparePasswords } from "@utils/crypto";
import { TvUserService } from "@services/tv/TvUserService";
import { TvUserDocument } from "@models/tv/TvUserModel";

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
 *         example: system
 *       password:
 *         type: string
 *         example: FistsOfJustice!
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

    @inject(UserService) private userService: UserService;
    @inject(TvUserService) private tvUserService: TvUserService;

    private getTokenStrategy(): Strategy {
        return new Strategy({
            secretOrKey: process.env.JWT_SECRET,
            jwtFromRequest: ExtractJwt.fromAuthHeaderWithScheme("jwt"),
            passReqToCallback: true
        }, (req: Request, payload: JwtToken, done: VerifiedCallback) => {
            (async () => {
                try {
                    const user = await this.userService.findById(payload.userId);
                    if (!user) {
                        return done(null, null, { error: "User by token not found!" });
                    }
                    if (user && !user.active) {
                        return done(null, null, { error: "User is not active!" });
                    }
                    return done(null, user);
                } catch (err) {
                    return done(null, null, err);
                }
            })();
        });
    }

    private getTvTokenStrategy(): Strategy {
        return new Strategy({
            secretOrKey: process.env.JWT_SECRET,
            jwtFromRequest: ExtractJwt.fromAuthHeaderWithScheme("jwt"),
            passReqToCallback: true
        }, (req: Request, payload: JwtToken, done: VerifiedCallback) => {
            (async () => {
                try {
                    const user = await this.tvUserService.findById(payload.userId);
                    if (!user) {
                        return done(null, null, {error: "TV user by token not found!"});
                    }
                    return done(null, user);
                } catch (err) {
                    return done(null, null, err);
                }
            })();
        });
    }

    public getPassportMiddleware(): ExpressHandler {
        passport.use("jwt", this.getTokenStrategy());
        passport.use("jwt_tv", this.getTvTokenStrategy());
        return passport.initialize();
    }

    public createToken(user: UserDocument | TvUserDocument): string {
        const expires = moment().utc().add({ weeks: 1 }).unix();
        const token: JwtToken = {
            exp: expires,
            userId: user.id,
        };
        const encoded = jwt.encode(token, process.env.JWT_SECRET);

        return `JWT ${encoded}`;
    }

    public decodeToken(token: string): JwtToken {
        if (!token) {
            throw new httpErrors.BadRequest("Empty token!");
        }

        const split = token.split(" ");
        if (split.length !== 2) {
            throw new httpErrors.BadRequest("Invalid encoded token!");
        }

        return jwt.decode(split[1], process.env.JWT_SECRET);
    }

    public async login(payload: LoginPayload): Promise<string> {
        try {
            // Grab the first user that has either payload username or payload email
            const user = await this.userService.findOne({
                $or: [
                    { username: payload.usernameOrEmail },
                    { email: payload.usernameOrEmail }
                ]
            });
            await this.comparePasswords(user.password, payload.password);
            return this.createToken(user);
        } catch (err) {
            throw new httpErrors.Unauthorized("Invalid username or password!");
        }
    }

    public async tvLogin(payload: LoginPayload): Promise<string> {
        try {
            // Grab the first user that has either payload username or payload email
            const user = await this.tvUserService.findOne({
                $or: [
                    { username: payload.usernameOrEmail },
                    { email: payload.usernameOrEmail }
                ]
            });
            await this.comparePasswords(user.password, payload.password);
            return this.createToken(user);
        } catch (err) {
            throw new httpErrors.Unauthorized("Invalid username or password!");
        }
    }

    public async getUserByToken(token: string): Promise<UserDocument> {
        try {
            return await this.userService.findById(this.decodeToken(token).userId);
        } catch (err) {
            throw new httpErrors.NotFound(err);
        }
    }
    public async getTvUserByToken(token: string): Promise<TvUserDocument> {
        try {
            return await this.tvUserService.findById(this.decodeToken(token).userId);
        } catch (err) {
            throw new httpErrors.NotFound(err);
        }
    }

    public async getUserFromRequest(req: Request): Promise<UserDocument> {
        return this.getUserByToken(req.headers.authorization);
    }
    public async getTvUserFromRequest(req: Request): Promise<TvUserDocument> {
        return this.getTvUserByToken(req.headers.authorization);
    }

    public async roleOnly(req: Request, role: UserRoles) {
        const user = await this.getUserFromRequest(req);
        if (!user.isAdmin() && !user.roles.includes(role)) { // Admins can go regardless
            throw new httpErrors.Forbidden(`This call can only be made by ${role}. Your roles are ${user.roles}`);
        }
    }

    public async adminOnly(req: Request) {
        const user = await this.getUserFromRequest(req);
        if (!user.isAdmin()) {
            throw new httpErrors.Forbidden("Only admins can make this call. You are not an admin.");
        }
    }

    private async comparePasswords(password: string, candidate: string) {
        if (!await comparePasswords(password, candidate)) {
            throw new httpErrors.Unauthorized("Invalid username or password!");
        }
    }

}
