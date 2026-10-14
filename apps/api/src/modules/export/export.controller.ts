/**
 * Export di tutti i dati dell'household (F1.14).
 *
 * JSON per il backup completo e il reimport, CSV per chi vuole guardarli in un
 * foglio di calcolo. I dati escono solo per l'household di chi chiede.
 */
import { Controller, Get, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "@api/db";
import {
  accounts,
  allocationTemplateLines,
  allocationTemplates,
  allocations,
  balanceSnapshots,
  categories,
  contributions,
  envelopeMoves,
  envelopes,
  goalAccounts,
  goals,
  householdMembers,
  households,
  incomeEvents,
  institutions,
  netWorthSnapshots,
  rules,
  transactions,
  transferTodos,
} from "@api/db/schema";
import { today } from "@pocketly/domain/date";
import { Ctx } from "../../common/guards";
import type { RequestContext } from "../../common/context";

@Controller("export")
export class ExportController {
  @Get()
  async download(
    @Ctx() ctx: RequestContext,
    @Res() response: Response,
    @Query("format") format?: string,
  ) {
    const id = ctx.household.id;

    const [
      household,
      members,
      institutionRows,
      accountRows,
      balanceRows,
      envelopeRows,
      moveRows,
      todoRows,
      incomeRows,
      allocationRows,
      templateRows,
      templateLineRows,
      goalRows,
      goalAccountRows,
      contributionRows,
      snapshotRows,
      categoryRows,
      ruleRows,
      transactionRows,
    ] = await Promise.all([
      db.select().from(households).where(eq(households.id, id)),
      db.select().from(householdMembers).where(eq(householdMembers.householdId, id)),
      db.select().from(institutions).where(eq(institutions.householdId, id)),
      db.select().from(accounts).where(eq(accounts.householdId, id)),
      db.select().from(balanceSnapshots).where(eq(balanceSnapshots.householdId, id)),
      db.select().from(envelopes).where(eq(envelopes.householdId, id)),
      db.select().from(envelopeMoves).where(eq(envelopeMoves.householdId, id)),
      db.select().from(transferTodos).where(eq(transferTodos.householdId, id)),
      db.select().from(incomeEvents).where(eq(incomeEvents.householdId, id)),
      db.select().from(allocations).where(eq(allocations.householdId, id)),
      db.select().from(allocationTemplates).where(eq(allocationTemplates.householdId, id)),
      db.select().from(allocationTemplateLines).where(eq(allocationTemplateLines.householdId, id)),
      db.select().from(goals).where(eq(goals.householdId, id)),
      db.select().from(goalAccounts),
      db.select().from(contributions).where(eq(contributions.householdId, id)),
      db.select().from(netWorthSnapshots).where(eq(netWorthSnapshots.householdId, id)),
      db.select().from(categories).where(eq(categories.householdId, id)),
      db.select().from(rules).where(eq(rules.householdId, id)),
      db.select().from(transactions).where(eq(transactions.householdId, id)),
    ]);

    const stamp = today();

    if (format === "csv") {
      const files: Record<string, unknown[]> = {
        accounts: accountRows,
        balance_snapshots: balanceRows,
        envelopes: envelopeRows,
        income_events: incomeRows,
        allocations: allocationRows,
        goals: goalRows,
        contributions: contributionRows,
        net_worth_snapshots: snapshotRows,
        transactions: transactionRows,
      };
      // Un CSV solo, con una sezione per tabella: resta leggibile in un foglio
      // di calcolo senza bisogno di uno zip.
      const parts: string[] = [];
      for (const [name, rows] of Object.entries(files)) {
        parts.push(`# ${name}`);
        parts.push(toCsv(rows as Record<string, unknown>[]));
        parts.push("");
      }
      response
        .status(200)
        .setHeader("Content-Type", "text/csv; charset=utf-8")
        .setHeader("Content-Disposition", `attachment; filename="pocketly-${stamp}.csv"`)
        .send(parts.join("\n"));
      return;
    }

    // La tabella dei collegamenti non ha l'household: si filtra sugli obiettivi.
    const goalIds = new Set(goalRows.map((goal) => goal.id));

    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      household: household[0] ?? null,
      members,
      institutions: institutionRows,
      accounts: accountRows,
      balanceSnapshots: balanceRows,
      envelopes: envelopeRows,
      envelopeMoves: moveRows,
      transferTodos: todoRows,
      incomeEvents: incomeRows,
      allocations: allocationRows,
      allocationTemplates: templateRows,
      allocationTemplateLines: templateLineRows,
      goals: goalRows,
      goalAccounts: goalAccountRows.filter((row) => goalIds.has(row.goalId)),
      contributions: contributionRows,
      netWorthSnapshots: snapshotRows,
      categories: categoryRows,
      rules: ruleRows,
      transactions: transactionRows,
    };

    response
      .status(200)
      .setHeader("Content-Type", "application/json; charset=utf-8")
      .setHeader("Content-Disposition", `attachment; filename="pocketly-${stamp}.json"`)
      .send(JSON.stringify(payload, null, 2));
  }
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]!);
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    const text =
      value instanceof Date
        ? value.toISOString()
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join(",")),
  ].join("\n");
}
