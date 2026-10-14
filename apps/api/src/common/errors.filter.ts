/**
 * Traduzione degli errori in risposte JSON con un codice stabile.
 *
 * Il client riceve sempre `{ code }`: e il codice, non il messaggio, che il
 * frontend trasforma in un testo tradotto. Il dettaglio degli errori
 * inattesi resta nei log del server.
 */
import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Response } from "express";
import { ZodError } from "zod";
import { AuthorizationError, CannotCloseError, DomainError } from "@pocketly/domain/errors";

export type ApiErrorBody = {
  code: string;
  fieldErrors?: Record<string, string>;
  reason?: string;
  detail?: Record<string, unknown>;
};

@Catch()
export class ErrorsFilter implements ExceptionFilter {
  private readonly logger = new Logger("API");

  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const [status, body] = this.translate(error);
    response.status(status).json(body);
  }

  private translate(error: unknown): [number, ApiErrorBody] {
    if (error instanceof DomainError) {
      const status =
        error.code === "notFound" || error.code === "accountNotFound"
          ? 404
          : error.code === "tooManyAttempts"
            ? 429
            : 400;
      return [status, { code: error.code }];
    }
    if (error instanceof AuthorizationError) return [HttpStatus.FORBIDDEN, { code: "unauthorized" }];
    if (error instanceof CannotCloseError) {
      return [HttpStatus.CONFLICT, { code: "cannotClose", reason: error.reason, detail: error.detail }];
    }
    if (error instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of error.issues) {
        const key = issue.path.join(".");
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      return [HttpStatus.BAD_REQUEST, { code: "validation", fieldErrors }];
    }
    if (error instanceof HttpException) {
      const payload = error.getResponse();
      const code =
        typeof payload === "object" && payload !== null && "code" in payload
          ? String((payload as { code: unknown }).code)
          : error.getStatus() === 404
            ? "notFound"
            : "httpError";
      return [error.getStatus(), { code }];
    }
    this.logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    return [HttpStatus.INTERNAL_SERVER_ERROR, { code: "serverError" }];
  }
}
