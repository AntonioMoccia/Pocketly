import { Module } from "@nestjs/common";
import { CategoriesController } from "./categories.controller";
import { ImportController } from "./import.controller";
import { TransactionsController } from "./transactions.controller";

@Module({ controllers: [TransactionsController, CategoriesController, ImportController] })
export class TransactionsModule {}
