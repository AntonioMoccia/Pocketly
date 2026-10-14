/**
 * Modelli di ripartizione (F1.6): le righe fisse del giorno di paga.
 */
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@api/db";
import { allocationTemplateLines, allocationTemplates } from "@api/db/schema";
import type { AllocationLineInput } from "@pocketly/domain/allocation";
import { validateTemplate } from "@pocketly/domain/allocation";
import type { IncomeKind } from "@pocketly/domain/income";
import { DomainError } from "./accounts";

export type TemplateSummary = {
  id: string;
  name: string;
  isDefault: boolean;
  /** Tipo di entrata per cui il modello si propone da solo. */
  incomeKind: IncomeKind | null;
  lineCount: number;
};

export type TemplateWithLines = {
  id: string;
  name: string;
  isDefault: boolean;
  incomeKind: IncomeKind | null;
  lines: AllocationLineInput[];
};

export async function listTemplates(householdId: string): Promise<TemplateSummary[]> {
  const rows = await db
    .select({
      id: allocationTemplates.id,
      name: allocationTemplates.name,
      isDefault: allocationTemplates.isDefault,
      incomeKind: allocationTemplates.incomeKind,
      lineId: allocationTemplateLines.id,
    })
    .from(allocationTemplates)
    .leftJoin(
      allocationTemplateLines,
      eq(allocationTemplateLines.templateId, allocationTemplates.id),
    )
    .where(eq(allocationTemplates.householdId, householdId))
    .orderBy(asc(allocationTemplates.name));

  const byId = new Map<string, TemplateSummary>();
  for (const row of rows) {
    const existing = byId.get(row.id);
    if (existing) {
      if (row.lineId) existing.lineCount += 1;
      continue;
    }
    byId.set(row.id, {
      id: row.id,
      name: row.name,
      isDefault: row.isDefault,
      incomeKind: row.incomeKind,
      lineCount: row.lineId ? 1 : 0,
    });
  }
  return [...byId.values()];
}

export async function getTemplate(
  householdId: string,
  templateId: string,
): Promise<TemplateWithLines | null> {
  const [template] = await db
    .select({
      id: allocationTemplates.id,
      name: allocationTemplates.name,
      isDefault: allocationTemplates.isDefault,
      incomeKind: allocationTemplates.incomeKind,
    })
    .from(allocationTemplates)
    .where(
      and(eq(allocationTemplates.id, templateId), eq(allocationTemplates.householdId, householdId)),
    )
    .limit(1);
  if (!template) return null;
  return { ...template, lines: await templateLines(templateId) };
}

export async function templateLines(templateId: string): Promise<AllocationLineInput[]> {
  const rows = await db
    .select()
    .from(allocationTemplateLines)
    .where(eq(allocationTemplateLines.templateId, templateId))
    .orderBy(asc(allocationTemplateLines.priority), asc(allocationTemplateLines.label));

  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    kind: row.kind,
    envelopeId: row.envelopeId,
    amountCents: row.amount,
    percentBps: row.percentBps,
    percentBasis: row.percentBasis,
    priority: row.priority,
  }));
}

export async function defaultTemplate(householdId: string): Promise<TemplateWithLines | null> {
  const [row] = await db
    .select({ id: allocationTemplates.id })
    .from(allocationTemplates)
    .where(
      and(eq(allocationTemplates.householdId, householdId), eq(allocationTemplates.isDefault, true)),
    )
    .limit(1);
  return row ? getTemplate(householdId, row.id) : null;
}

/**
 * Modello da proporre per un tipo di entrata: quello legato al tipo, se c'e,
 * altrimenti il predefinito. Una vendita su Vinted non deve ricevere le
 * righe dello stipendio solo perche e l'unico modello marcato.
 */
export async function templateForKind(
  householdId: string,
  kind: IncomeKind,
): Promise<TemplateWithLines | null> {
  const [row] = await db
    .select({ id: allocationTemplates.id })
    .from(allocationTemplates)
    .where(
      and(eq(allocationTemplates.householdId, householdId), eq(allocationTemplates.incomeKind, kind)),
    )
    .limit(1);
  return row ? getTemplate(householdId, row.id) : defaultTemplate(householdId);
}

export type TemplateInput = {
  name: string;
  isDefault: boolean;
  incomeKind: IncomeKind | null;
  lines: AllocationLineInput[];
};

export async function saveTemplate(
  householdId: string,
  input: TemplateInput,
  templateId?: string,
): Promise<string> {
  const errors = validateTemplate(input.lines).filter((issue) => issue.level === "error");
  if (errors.length > 0) {
    throw new DomainError(errors[0]?.code ?? "validation");
  }

  return db.transaction(async (tx) => {
    let id = templateId;
    if (id) {
      const updated = await tx
        .update(allocationTemplates)
        .set({ name: input.name.trim(), isDefault: input.isDefault, incomeKind: input.incomeKind })
        .where(
          and(eq(allocationTemplates.id, id), eq(allocationTemplates.householdId, householdId)),
        )
        .returning({ id: allocationTemplates.id });
      if (updated.length === 0) throw new DomainError("notFound");
      await tx
        .delete(allocationTemplateLines)
        .where(eq(allocationTemplateLines.templateId, id));
    } else {
      const [created] = await tx
        .insert(allocationTemplates)
        .values({
          householdId,
          name: input.name.trim(),
          isDefault: input.isDefault,
          incomeKind: input.incomeKind,
        })
        .returning({ id: allocationTemplates.id });
      if (!created) throw new DomainError("notFound");
      id = created.id;
    }

    if (input.lines.length > 0) {
      await tx.insert(allocationTemplateLines).values(
        input.lines.map((line, index) => ({
          householdId,
          templateId: id!,
          label: line.label.trim(),
          kind: line.kind,
          envelopeId: line.envelopeId,
          amount: line.kind === "fixed" ? line.amountCents : 0,
          percentBps: line.kind === "percent" ? line.percentBps : 0,
          percentBasis: line.percentBasis,
          priority: line.priority === 0 ? index : line.priority,
        })),
      );
    }

    // Un solo modello predefinito per household.
    if (input.isDefault) {
      await tx
        .update(allocationTemplates)
        .set({ isDefault: false })
        .where(
          and(
            eq(allocationTemplates.householdId, householdId),
            eq(allocationTemplates.isDefault, true),
          ),
        );
      await tx
        .update(allocationTemplates)
        .set({ isDefault: true })
        .where(eq(allocationTemplates.id, id!));
    }

    // Un solo modello per tipo di entrata: l'ultimo scelto vince.
    if (input.incomeKind) {
      await tx
        .update(allocationTemplates)
        .set({ incomeKind: null })
        .where(
          and(
            eq(allocationTemplates.householdId, householdId),
            eq(allocationTemplates.incomeKind, input.incomeKind),
            ne(allocationTemplates.id, id!),
          ),
        );
    }

    return id!;
  });
}

export async function deleteTemplate(householdId: string, templateId: string): Promise<void> {
  const result = await db
    .delete(allocationTemplates)
    .where(
      and(eq(allocationTemplates.id, templateId), eq(allocationTemplates.householdId, householdId)),
    )
    .returning({ id: allocationTemplates.id });
  if (result.length === 0) throw new DomainError("notFound");
}

export async function duplicateTemplate(
  householdId: string,
  templateId: string,
  newName: string,
): Promise<string> {
  const source = await getTemplate(householdId, templateId);
  if (!source) throw new DomainError("notFound");
  return saveTemplate(householdId, {
    name: newName,
    isDefault: false,
    incomeKind: null,
    lines: source.lines,
  });
}
