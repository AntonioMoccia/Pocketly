import { Module } from "@nestjs/common";
import { PaydayController } from "./payday.controller";

@Module({ controllers: [PaydayController] })
export class PaydayModule {}
