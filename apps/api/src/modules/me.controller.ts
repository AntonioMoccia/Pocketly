/**
 * Chi sta usando l'app: l'utente della sessione e, se ne ha uno, il suo
 * household con il ruolo. Il frontend lo chiede a ogni pagina per sapere se
 * mandare al login, all'onboarding o avanti.
 */
import { Controller, Get } from "@nestjs/common";
import { CurrentUser, SessionOnly } from "../common/guards";
import { loadContext, type SessionUser } from "../common/context";

@Controller("me")
export class MeController {
  @SessionOnly()
  @Get()
  async me(@CurrentUser() user: SessionUser) {
    return loadContext(user.id);
  }
}
