ALTER TYPE "public"."income_kind" ADD VALUE 'sale' BEFORE 'other';--> statement-breakpoint
ALTER TYPE "public"."income_kind" ADD VALUE 'refund' BEFORE 'other';--> statement-breakpoint
ALTER TYPE "public"."income_kind" ADD VALUE 'gift' BEFORE 'other';--> statement-breakpoint
ALTER TABLE "allocation_templates" ADD COLUMN "income_kind" "income_kind";--> statement-breakpoint
-- Le vendite (Vinted, usato) diventano una categoria di entrata predefinita.
-- La lingua si deduce dall'albero gia creato all'onboarding.
INSERT INTO categories (household_id, name, kind, sort_order, color)
SELECT c.household_id, CASE WHEN c.name = 'Salary' THEN 'Sales' ELSE 'Vendite' END, 'income', c.sort_order + 2, 3
FROM categories c
WHERE c.kind = 'income' AND c.parent_id IS NULL AND c.name IN ('Stipendio', 'Salary')
  AND NOT EXISTS (
    SELECT 1 FROM categories o
    WHERE o.household_id = c.household_id AND o.name IN ('Vendite', 'Sales')
  );
