/**
 * Job pianificati (tassi BCE, snapshot del patrimonio, giroconti) nel processo
 * dell'API: e l'unico servizio che parla col database, quindi e anche l'unico
 * che li fa girare. `DISABLE_JOBS=true` li spegne.
 */
import { Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import { env } from "@api/lib/env";
import { startJobs } from "@api/jobs/jobs";

@Injectable()
export class JobsService implements OnApplicationBootstrap {
  async onApplicationBootstrap(): Promise<void> {
    if (env().DISABLE_JOBS) return;
    await startJobs();
  }
}
