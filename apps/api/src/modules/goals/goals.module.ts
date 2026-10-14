import { Module } from "@nestjs/common";
import { GoalsController } from "./goals.controller";
import { InvestmentsController } from "./investments.controller";

@Module({ controllers: [GoalsController, InvestmentsController] })
export class GoalsModule {}
