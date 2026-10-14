ALTER TABLE "accounts" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_default_pocket_unique" ON "accounts" USING btree ("parent_id") WHERE "accounts"."is_default";--> statement-breakpoint
-- Un Pocket sta sempre direttamente sotto un conto principale: le catene di
-- Pocket annidati si appendono alla loro radice. Il limite di profondita
-- protegge da eventuali cicli lasciati da dati vecchi.
WITH RECURSIVE chain AS (
	SELECT a.id, a.parent_id AS ancestor, 1 AS depth
	FROM accounts a
	WHERE a.parent_id IS NOT NULL
	UNION ALL
	SELECT c.id, p.parent_id, c.depth + 1
	FROM chain c
	JOIN accounts p ON p.id = c.ancestor
	WHERE p.parent_id IS NOT NULL AND c.depth < 32
)
UPDATE accounts a
SET parent_id = roots.ancestor
FROM (
	SELECT c.id, c.ancestor
	FROM chain c
	JOIN accounts r ON r.id = c.ancestor
	WHERE r.parent_id IS NULL
) roots
WHERE a.id = roots.id AND a.parent_id <> roots.ancestor;
--> statement-breakpoint
-- Ogni conto principale riceve il suo Pocket di default, con le stesse
-- proprieta del conto: categoria, valuta, liquidita, intestatario.
INSERT INTO accounts (
	household_id, institution_id, parent_id, is_default, name, type, category,
	currency, liquid, owner_user_id, archived, sort_order
)
SELECT
	a.household_id, a.institution_id, a.id, true, 'Principale', a.type, a.category,
	a.currency, a.liquid, a.owner_user_id, a.archived, -1
FROM accounts a
WHERE a.parent_id IS NULL
	AND NOT EXISTS (SELECT 1 FROM accounts d WHERE d.parent_id = a.id AND d.is_default);
--> statement-breakpoint
-- I saldi registrati sul conto passano al Pocket di default. Se a quella data
-- il saldo del conto era almeno la somma degli altri Pocket, era il totale
-- letto in banca: al Pocket di default va solo la differenza. Altrimenti era
-- gia il saldo fuori dai Pocket e passa cosi com'e.
UPDATE balance_snapshots s
SET account_id = moved.default_id, amount = moved.amount
FROM (
	SELECT
		s.id,
		d.id AS default_id,
		CASE
			WHEN pockets.total > 0 AND s.amount >= pockets.total THEN s.amount - pockets.total
			ELSE s.amount
		END AS amount
	FROM balance_snapshots s
	JOIN accounts a ON a.id = s.account_id AND a.parent_id IS NULL
	JOIN accounts d ON d.parent_id = a.id AND d.is_default
	CROSS JOIN LATERAL (
		SELECT coalesce(sum(latest.amount), 0) AS total
		FROM accounts p
		CROSS JOIN LATERAL (
			SELECT ps.amount
			FROM balance_snapshots ps
			WHERE ps.account_id = p.id AND ps.date <= s.date
			ORDER BY ps.date DESC, ps.created_at DESC
			LIMIT 1
		) latest
		WHERE p.parent_id = a.id AND NOT p.is_default
	) pockets
) moved
WHERE s.id = moved.id;
