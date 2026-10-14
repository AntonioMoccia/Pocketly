import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AccessGuard } from "./common/guards";
import { JobsService } from "./jobs.service";
import { HealthController } from "./modules/health.controller";
import { MeController } from "./modules/me.controller";
import { AuthController } from "./modules/auth/auth.controller";
import { SessionsController, TokenController } from "./modules/auth/token.controller";
import { AccountsController } from "./modules/accounts/accounts.controller";
import { PaydayModule } from "./modules/payday/payday.module";
import { FxModule } from "./modules/fx/fx.module";
import { NetWorthModule } from "./modules/networth/networth.module";
import { EnvelopesModule } from "./modules/envelopes/envelopes.module";
import { TransactionsModule } from "./modules/transactions/transactions.module";
import { GoalsModule } from "./modules/goals/goals.module";
import { HouseholdModule } from "./modules/household/household.module";
import { TemplatesModule } from "./modules/templates/templates.module";
import { OnboardingModule } from "./modules/onboarding/onboarding.module";
import { NotionModule } from "./modules/notion/notion.module";
import { ExportModule } from "./modules/export/export.module";

@Module({
  imports: [
    PaydayModule,
    FxModule,
    NetWorthModule,
    EnvelopesModule,
    TransactionsModule,
    GoalsModule,
    HouseholdModule,
    TemplatesModule,
    OnboardingModule,
    NotionModule,
    ExportModule,
  ],
  controllers: [
    HealthController,
    MeController,
    AuthController,
    TokenController,
    SessionsController,
    AccountsController,
  ],
  providers: [{ provide: APP_GUARD, useClass: AccessGuard }, JobsService],
})
export class AppModule {}
