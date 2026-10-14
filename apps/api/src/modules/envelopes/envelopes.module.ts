import { Module } from "@nestjs/common";
import { EnvelopesController } from "./envelopes.controller";

@Module({ controllers: [EnvelopesController] })
export class EnvelopesModule {}
