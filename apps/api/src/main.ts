/**
 * Avvio dell'API di Pocketly.
 *
 * Better Auth riceve le richieste grezze su `/api/auth/*`: legge il corpo da
 * se, quindi va montato prima del parser JSON di Nest. Tutto il resto vive
 * sotto `/api/v1`.
 */
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { toNodeHandler } from "better-auth/node";
import { env } from "@api/lib/env";
import type { NextFunction, Request, Response } from "express";
import { auth, CLIENT_IP_HEADER } from "./auth/auth";
import { AppModule } from "./app.module";
import { ErrorsFilter } from "./common/errors.filter";

async function bootstrap() {
  // Fallisce subito, con un messaggio chiaro, se manca la configurazione.
  env();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger: ["error", "warn", "log"],
  });

  // Le app web su un'altra origine (non il sito, che passa dal proxy) vanno
  // elencate esplicitamente. I client nativi non hanno bisogno di CORS.
  const corsOrigins = (process.env.API_CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (corsOrigins.length > 0) {
    app.enableCors({
      origin: corsOrigins,
      allowedHeaders: ["authorization", "content-type"],
      exposedHeaders: ["set-auth-token"],
    });
  }

  // Indirizzo del client. Le richieste arrivano dal frontend (che inoltra
  // quello del browser in `x-forwarded-for`), da un reverse proxy o
  // direttamente da un'app: Express risale la catena fermandosi al primo
  // indirizzo che non e un proxy fidato. Il risultato va in un'intestazione
  // interna, riscritta sempre, che e l'unica letta da Better Auth per i limiti
  // ai tentativi e per le sessioni: un client non puo dichiararsi un altro IP.
  const http = app.getHttpAdapter().getInstance();
  http.set("trust proxy", process.env.API_TRUSTED_PROXIES ?? "loopback, uniquelocal");
  http.use((request: Request, _response: Response, next: NextFunction) => {
    request.headers[CLIENT_IP_HEADER] = request.ip ?? request.socket.remoteAddress ?? "";
    next();
  });

  http.all("/api/auth/{*splat}", toNodeHandler(auth));
  // Gli estratti conto CSV arrivano come testo nel corpo JSON, e la conferma
  // rimanda l'anteprima intera: stesso tetto delle Server Action del frontend.
  app.useBodyParser("json", { limit: "30mb" });
  app.setGlobalPrefix("api/v1");
  app.useGlobalFilters(new ErrorsFilter());
  app.enableShutdownHooks();

  const port = Number(process.env.API_PORT ?? 4000);
  const host = process.env.API_HOST ?? "127.0.0.1";
  await app.listen(port, host);
  console.log(`Pocketly API: in ascolto su http://${host}:${port}`);
}

void bootstrap();
