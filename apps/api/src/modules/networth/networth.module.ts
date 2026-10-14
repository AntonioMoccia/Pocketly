import { Module } from "@nestjs/common";
import { NetWorthController } from "./networth.controller";

@Module({ controllers: [NetWorthController] })
export class NetWorthModule {}
