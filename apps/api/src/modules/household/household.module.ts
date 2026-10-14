import { Module } from "@nestjs/common";
import { HouseholdController } from "./household.controller";

@Module({ controllers: [HouseholdController] })
export class HouseholdModule {}
