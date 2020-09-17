import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { StatsService } from "@services/StatsService";
import { Request, Response } from "express";
import { AuthService } from "@services/AuthService";
import { Forbidden } from "http-errors";

@provide(StatsController)
export class StatsController {

    @inject(AuthService) private authService: AuthService;
    @inject(StatsService) private statsService: StatsService;

    public async fetchStatsForUser(req: Request, res: Response) {
        const user = await this.authService.getUserFromRequest(req);
        if (user.id !== req.params.id && !user.isAdmin()) {
            throw new Forbidden("You are not allowed to request stats for other users!");
        }

        const stats = await this.statsService.fetchStats(user, !!req.params.year ? parseInt(req.params.year) : null);
        return res.status(200).send(stats);
    }

    public async fetchSystemSpentStats(req: Request, res: Response) {
        const user = await this.authService.getUserFromRequest(req);
        if (!user.isAdmin()) {
            throw new Forbidden("You are not allowed to access this data.");
        }

        const systemStats = await this.statsService.fetchSystemSpentStats(!!req.params.year ? parseInt(req.params.year) : null);
        return res.status(200).send(systemStats);
    }

}
