import { CronJob } from "cron";
import { ioc } from "@ioc";
import { LetterService } from "@services/LetterService";
import { logger } from "@utils/winston";
import { ProvisionService } from "@services/ProvisionService";
import { UserService } from "@services/UserService";
import moment from "moment";
import { RevenueService } from "@services/RevenueService";

export const uploadJob = new CronJob(process.env.CRON_UPLOAD, () => {
    const letterService = ioc.resolve(LetterService);
    letterService.batchSendScheduledLetters()
        .then(errors => logger.info(`UPLOAD CRON JOB COMPLETED WITH ${errors} ERRORS!`))
        .catch(() => logger.error("UPLOAD CRON JOB FAILED. CHECK LOGS!"));
}, null, false, "Europe/Rome");

export const queryJob = new CronJob(process.env.CRON_QUERY, () => {
    const letterService = ioc.resolve(LetterService);
    letterService.batchQueryLetters()
        .then(errors => logger.info(`QUERY CRON JOB COMPLETED WITH ${errors} ERRORS!`))
        .catch(err => logger.error("QUERY CRON JOB FAILED.", err));
}, null, false, "Europe/Rome");

export const revenuesJob = new CronJob(process.env.CRON_REVENUE, () => {
    const userService = ioc.resolve(UserService);
    const provisionService = ioc.resolve(ProvisionService);
    const revenueService = ioc.resolve(RevenueService);

    userService.findAll()
        .then(users => {
            users.forEach(user => {
                provisionService.calculateRevenue(user.id, {
                    month: moment().subtract(5, "minutes").month()
                }, true).then(revenue => {
                    revenueService.save(revenue)
                        .then(rev => logger.info(`[Revenues CRON Job] Saved revenue for user '${user.username}' for previous month.`, rev))
                      .catch(err => logger.error(`[Revenues CRON Job] Failed to save revenue for user '${user.username}'.`, err));
                }).catch(err => {
                    logger.error(`[Revenues CRON Job] Failed to calculate revenue for user '${user.username}'.`, err);
                });
            });
        })
        .catch(err => {
            logger.error("[Revenues CRON Job] Failed to retrieve all users.", err);
        });
});
