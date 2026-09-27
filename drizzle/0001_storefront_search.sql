-- PHASE-05 — Arabic-aware storefront search (MASTER_PLAN §19; docs/phases/PHASE-05.md tasks 6–8).
--
-- pg_trgm enables the typo-tolerant (fuzzy) matching tier on real PostgreSQL/Neon.
-- DATABASE.md §6 baseline decision: "pg_trgm NOT included in initial migration …
-- PHASE-05 adds it only if it provides measurable search value on Neon" — the fuzzy
-- tier (task 8) is only practical with trigram similarity, so the extension is added
-- here as a committed migration. pg_trgm is a standard contrib extension supported
-- by Neon; CREATE EXTENSION IF NOT EXISTS keeps the migration re-runnable.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram GIN indexes back the fuzzy tier (similarity ranking). The exact/prefix/
-- substring tiers match via normalize-at-query-time expressions (Arabic-aware
-- translate()) which remain sequential scans at the current catalog scale —
-- expression indexes are a PHASE_11 performance concern, not a correctness one.
CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_short_description_trgm
  ON products USING gin (short_description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_description_trgm
  ON products USING gin (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_product_variants_sku_trgm
  ON product_variants USING gin (sku gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_attribute_values_value_trgm
  ON attribute_values USING gin (value gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_categories_name_trgm
  ON categories USING gin (name gin_trgm_ops);
