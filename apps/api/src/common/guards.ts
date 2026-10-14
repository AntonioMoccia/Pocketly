/**
 * Accesso agli endpoint.
 *
 * Ogni endpoint richiede una sessione e un household, salvo dove un decoratore
 * dice altrimenti:
 *  - `@Public()`: nessuna sessione (salute, politica di iscrizione);
 *  - `@SessionOnly()`: basta la sessione, l'household puo mancare (onboarding);
 *  - `@Writable()`: owner e member scrivono, viewer e di sola lettura;
 *  - `@OwnerOnly()`: solo owner (impostazioni dell'household, inviti, membri).
 */
import {
  createParamDecorator,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import {
  loadContext,
  sessionFromHeaders,
  type RequestContext,
  type SessionUser,
} from "./context";

const ACCESS = "pocketly:access";
type Access = "public" | "session" | "household" | "writable" | "owner";

export const Public = () => SetMetadata(ACCESS, "public" satisfies Access);
export const SessionOnly = () => SetMetadata(ACCESS, "session" satisfies Access);
export const Writable = () => SetMetadata(ACCESS, "writable" satisfies Access);
export const OwnerOnly = () => SetMetadata(ACCESS, "owner" satisfies Access);

type PocketlyRequest = Request & {
  pocketly?: {
    user: SessionUser;
    context: RequestContext | null;
  };
};

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(execution: ExecutionContext): Promise<boolean> {
    const access =
      this.reflector.getAllAndOverride<Access>(ACCESS, [
        execution.getHandler(),
        execution.getClass(),
      ]) ?? "household";
    if (access === "public") return true;

    const request = execution.switchToHttp().getRequest<PocketlyRequest>();
    const session = await sessionFromHeaders(request.headers);
    if (!session?.user) throw new UnauthorizedException({ code: "unauthenticated" });

    const loaded = await loadContext(session.user.id);
    const context =
      loaded.household && loaded.role
        ? { user: loaded.user, household: loaded.household, role: loaded.role }
        : null;
    request.pocketly = { user: loaded.user, context };

    if (access === "session") return true;
    if (!context) throw new ForbiddenException({ code: "noHousehold" });
    if (access === "writable" && context.role === "viewer") {
      throw new ForbiddenException({ code: "unauthorized" });
    }
    if (access === "owner" && context.role !== "owner") {
      throw new ForbiddenException({ code: "unauthorized" });
    }
    return true;
  }
}

/** Contesto completo: utente, household e ruolo. */
export const Ctx = createParamDecorator((_data: unknown, execution: ExecutionContext) => {
  const request = execution.switchToHttp().getRequest<PocketlyRequest>();
  const context = request.pocketly?.context;
  if (!context) throw new ForbiddenException({ code: "noHousehold" });
  return context;
});

/** Solo l'utente della sessione, per gli endpoint `@SessionOnly()`. */
export const CurrentUser = createParamDecorator((_data: unknown, execution: ExecutionContext) => {
  const request = execution.switchToHttp().getRequest<PocketlyRequest>();
  const user = request.pocketly?.user;
  if (!user) throw new UnauthorizedException({ code: "unauthenticated" });
  return user;
});
