import { CronJob } from "cron";
import { ioc } from "@ioc";
import { LetterService } from "@services/LetterService";
import { logger } from "@utils/winston";

export const uploadJob = new CronJob(process.env.CRON_UPLOAD, () => {
    const letterService = ioc.resolve(LetterService);
    letterService.batchSendScheduledLetters()
        .then(errors => logger.info(`UPLOAD CRON JOB COMPLETED WITH ${errors} ERRORS!`))
        .catch(() => logger.error("UPLOAD CRON JOB FAILED. CHECK LOGS!"));
}, null, false, "Europe/Rome");

export const queryJob = new CronJob(process.env.CRON_QUERY, () => {
    const letterService = ioc.resolve(LetterService);
    letterService.batchQueryLetters()
        .then(() => logger.info("QUERY CRON JOB COMPLETED!"))
        .catch(() => logger.error("QUERY CRON JOB FAILED. CHECK LOGS!"));
}, null, false, "Europe/Rome");
