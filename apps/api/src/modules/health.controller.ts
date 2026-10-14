/**
 * Sonda di salute per Docker e per i reverse proxy: controlla che il database
 * risponda, non solo che il processo sia vivo.
 */
import { Controller, Get, HttpException, HttpStatus } from "@nestjs/common";
import { sql } from "@api/db";
import { env } from "@api/lib/env";
import { Public } from "../common/guards";

@Controller()
export class HealthController {
  @Public()
  @Get("health")
  async check() {
    try {
      await sql`select 1`;
      return { status: "ok", time: new Date().toISOString() };
    } catch {
      throw new HttpException({ code: "databaseUnavailable" }, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /** Edizione e politica di iscrizione, mostrate nelle impostazioni. */
  @Public()
  @Get("instance")
  instance() {
    return { edition: env().EDITION, signup: env().SIGNUP };
  }
}
