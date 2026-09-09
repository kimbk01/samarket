# DIBAY — Fail-Fast Existing-Live Schema Authority Convention

**Status:** ADOPTED (Owner decision YES — CUT 7-E)  
**Scope:** TABLE SCHEMA AUTHORITY only (global governance, not payment-only)  
**Companion rule:** `.cursor/rules/dibay-existing-live-schema-authority-convention.mdc`

## 0. Why this exists

When:

- a **live** Postgres table already exists, and
- repository **CREATE** authority is missing,

do **not**:

- invent `CREATE TABLE IF NOT EXISTS` as authority close (hides drift),
- silent catch-up `ALTER` / policy create toward a “desired” shape,
- invent a second migration philosophy ad hoc.

Adopt this convention instead:

| Outcome | Meaning | Action |
|---|---|---|
| **MATCH** | live fingerprint == repo expected fingerprint | **NO-OP / PASS** |
| **DRIFT** | any compared field differs | **FAIL-FAST** (no auto-fix) |
| **EXTRA** | live has unexpected app-managed object | **FAIL-FAST** |
| **MISSING** | expected table absent on live | **BLOCK** (no auto-CREATE on recovery path) |

**ASSERT BEFORE MUTATE.**  
Repository learns the proven live contract. Live is not mutated by recovery.

## 1. Vocabulary (hard separation)

| Term | Meaning |
|---|---|
| **SCHEMA CREATION MIGRATION** | Introduces a table that must not yet exist (or is greenfield). May contain `CREATE TABLE`. |
| **EXISTING-LIVE AUTHORITY RECOVERY** | Repo records + asserts exact existing live contract. **No DDL.** |
| **REPAIR** | Live DDL toward expected shape. **Out of scope for this convention.** |

Recovery ≠ Creation ≠ Repair ≠ Migration apply.

Placing an expected fingerprint in the repo does **not** mean live DDL ran.

## 2. Scope

### In scope (TABLE SCHEMA AUTHORITY)

- columns (name, type, nullability, default, identity/generated)
- PK / FK / UNIQUE / CHECK
- explicit indexes
- RLS enabled / forced
- policies
- triggers (non-internal)

### Out of scope (do not expand in this convention)

- functions / RPCs
- views / materialized views
- extensions
- sequences (except as column default expression text via catalog)
- storage policies
- cron
- realtime publications
- grants / privileges (document separately if ever needed; not part of v1 compare set)

## 3. Expected fingerprint format (chosen)

**Format B — versioned JSON schema fingerprint**

Canonical path:

```text
supabase/schema-authority/<schema>/<table>/v<N>.fingerprint.json
```

Example:

```text
supabase/schema-authority/public/store_payments/v1.fingerprint.json
```

Rationale:

- reviewable diffs in PR
- deterministic, no hidden mutation
- Postgres/Supabase-agnostic storage
- CI-usable later without ORM/DSL/new package
- no SQL migration file that looks like DDL

**Rejected for this convention:**

| Option | Why not |
|---|---|
| A. SQL assertion migration as sole authority | Easy to confuse with DDL migrations; harder to diff |
| C. SQL + generated fingerprint | Extra generation step; dual authority risk |
| D. TS contract as sole authority | Weaker review for DB operators; drifts from catalog forms |
| E. ad-hoc paste scripts / catch-up SQL | Mutation-oriented; already proven UNSAFE for authority close |

Optional later: a thin TS type for the JSON shape living next to the verifier — **not** a second source of truth.

## 4. Fingerprint JSON shape (v1)

```json
{
  "convention": "dibay.existing_live_schema_authority",
  "convention_version": 1,
  "schema": "public",
  "table": "store_payments",
  "contract_version": 1,
  "metadata": {
    "source": "LIVE_EXACT_FINGERPRINT",
    "verified_at": "2026-09-10T00:00:00.000Z",
    "verified_environment": "production",
    "origin": "UNKNOWN"
  },
  "columns": [],
  "primary_key": null,
  "foreign_keys": [],
  "uniques": [],
  "checks": [],
  "indexes": [],
  "rls": { "enabled": true, "forced": false },
  "policies": [],
  "triggers": []
}
```

### 4.1 Column object

```json
{
  "name": "order_id",
  "udt": "uuid",
  "nullable": false,
  "default_norm": null,
  "is_identity": false,
  "identity_generation": null,
  "is_generated": "NEVER",
  "generation_expression_norm": null
}
```

- **Authority key:** `name` (set equality).
- **Column ordinal / physical order:** **NOT authority** (PostgREST/app bind by name; reordering alone is not product drift).
- `data_type` vs `udt`: compare **`udt`** (e.g. `int8`, `timestamptz`, `jsonb`) after catalog read.
- Defaults: store **normalized** catalog form (`default_norm`), never raw migration SQL text.

### 4.2 PK / UNIQUE

```json
{
  "name": "store_payments_pkey",
  "columns": ["id"],
  "deferrable": false,
  "initially_deferred": false
}
```

- Constraint **name is authority** for application-managed objects.
- Column **order** inside the constraint is authority.

### 4.3 FK

```json
{
  "name": "store_payments_order_id_fkey",
  "columns": ["order_id"],
  "ref_schema": "public",
  "ref_table": "store_orders",
  "ref_columns": ["id"],
  "on_update": "NO ACTION",
  "on_delete": "RESTRICT",
  "deferrable": false,
  "initially_deferred": false
}
```

Use catalog `confupdtype` / `confdeltype` mapped to stable tokens:  
`NO ACTION` | `RESTRICT` | `CASCADE` | `SET NULL` | `SET DEFAULT`.

### 4.4 CHECK

```json
{
  "name": "store_payments_amount_check",
  "expression_norm": "CHECK ((amount >= 0))"
}
```

- Prefer `pg_get_constraintdef(oid)` output as `expression_norm`.
- Ignore Postgres NOT-NULL “CHECK” stubs that are not named application CHECKs  
  (see §7 system exclusion). Only `contype = 'c'` with real named application checks,  
  or exclude names matching `*_not_null` / attnotnull-backed synthetic rows.

### 4.5 Explicit index

```json
{
  "name": "idx_store_payments_provider_id",
  "method": "btree",
  "unique": false,
  "columns_norm": ["provider_payment_id"],
  "predicate_norm": "(provider_payment_id IS NOT NULL)",
  "definition_norm": "CREATE INDEX idx_store_payments_provider_id ON public.store_payments USING btree (provider_payment_id) WHERE (provider_payment_id IS NOT NULL)"
}
```

**Constraint-backed indexes** (PK/UNIQUE indexes) are **not** listed under `indexes`.  
They are covered by PK/UNIQUE authority. Listing them again as EXTRA is a false positive — excluded (§7).

### 4.6 RLS / policies / triggers

```json
"rls": { "enabled": true, "forced": false },
"policies": [],
"triggers": []
```

Empty `policies: []` with `rls.enabled: true` is a **valid** exact contract  
(e.g. service_role writers + default-deny for RLS subjects).

Policy object:

```json
{
  "name": "…",
  "command": "SELECT",
  "roles": ["authenticated"],
  "permissive": true,
  "using_norm": "…",
  "with_check_norm": null
}
```

Trigger object (non-internal only):

```json
{
  "name": "…",
  "timing": "AFTER",
  "events": ["INSERT"],
  "level": "ROW",
  "enabled": "O",
  "function_schema": "public",
  "function_name": "…",
  "when_norm": null
}
```

## 5. Catalog sources (minimum)

Read-only:

- `pg_class` / `pg_namespace` — existence, `relrowsecurity`, `relforcerowsecurity`
- `pg_attribute` + `pg_type` / `format_type` — columns, nullability, identity/generated
- `pg_attrdef` / `pg_get_expr` — defaults
- `pg_constraint` / `pg_get_constraintdef` — PK/FK/UNIQUE/CHECK
- `pg_index` / `pg_get_indexdef` — indexes; skip indexes where `indisprimary` or uniqueness is solely the constraint backing index tied to a constraint OID
- `pg_policy` / `pg_policies` or `pg_get_expr` on policy quals
- `pg_trigger` — `NOT tgisinternal`

No user row/data reads.

## 6. Exactness rules

| Axis | Compare | Notes |
|---|---|---|
| Columns | name set + udt + nullable + default_norm + identity/generated | Ordinal **out** |
| PK | name + columns order + deferrable flags | |
| FK | name + cols + ref + ON UPDATE/DELETE + deferrable | |
| UNIQUE | name + columns order + deferrable | |
| CHECK | name + expression_norm | Catalog form, not migration text |
| Indexes | name + method + unique + columns/expr + predicate | Explicit only |
| RLS | enabled + forced separately | |
| Policies | full set equality by name; each field exact | Empty set allowed |
| Triggers | full set equality; non-internal only | |

### Normalization (false-drift control)

- Prefer **catalog-rendered** forms (`pg_get_constraintdef`, `pg_get_indexdef`, `pg_get_expr`).
- Do **not** compare against hand-written migration SQL strings.
- Treat equivalent catalog spellings as equal only when normalized strings match after:
  - trim
  - collapse insignificant whitespace
  - stable role-array sort for policies
- Do not invent semantic SQL equivalence beyond catalog normalization in v1  
  (if catalog renders differ → **DRIFT**; tighten normalizer later with Owner note, not silent pass).

## 7. System / internal exclusion

**Never EXTRA / DRIFT as application objects:**

- indexes that solely back PK/UNIQUE constraints already listed
- `tgisinternal` triggers
- non-`public` (or non-declared schema) system catalogs
- information_schema / synthetic NOT NULL check names that are attribute nullability, not application CHECKs

**Names are authority** for application-managed constraints, indexes, policies, triggers  
(live named objects such as `store_payments_order_id_key`).

## 8. Diff categories (required on FAIL)

Emit structured diffs — never only `schema mismatch`:

```text
TABLE_MISSING
COLUMN_MISSING | COLUMN_EXTRA | COLUMN_TYPE_MISMATCH
NULLABILITY_MISMATCH | DEFAULT_MISMATCH
PK_MISMATCH
FK_MISMATCH
UNIQUE_MISMATCH | UNIQUE_MISSING | UNIQUE_EXTRA
CHECK_MISMATCH | CHECK_MISSING | CHECK_EXTRA
INDEX_MISSING | INDEX_EXTRA | INDEX_MISMATCH
RLS_ENABLED_MISMATCH | RLS_FORCED_MISMATCH
POLICY_MISSING | POLICY_EXTRA | POLICY_MISMATCH
TRIGGER_MISSING | TRIGGER_EXTRA | TRIGGER_MISMATCH
```

Report shape:

```text
TABLE: <schema.table>
DIFF: <CATEGORY>
EXPECTED: <…>
ACTUAL: <…>
```

## 9. Canonical execution path

**Single authority path (v1):**

```text
node scripts/verify-schema-authority.mjs
  → load expected JSON under supabase/schema-authority/**
  → read-only pooler/catalog inspect
  → MATCH → exit 0
  → else print structured diffs → exit ≠ 0
```

| Context | Role |
|---|---|
| Local / operator | **Canonical** |
| CI | Allowed later to call the same script — **not required in CUT 7-E** |
| Migration precondition | **Forbidden** as primary authority (migrations are mutation vehicles) |

Production safety: SELECT/catalog only. **No DDL** in the verifier.

Package script name (when implemented): `verify:schema-authority`.

## 10. Recovery eligibility (including UNKNOWN origin)

Authority recovery is allowed when **all** hold:

1. LIVE EXACT FINGERPRINT proven (catalog)
2. Active intended product contract proven (writers/readers) — for product tables
3. Owner approval for introducing recovery fingerprints / convention use
4. CREATION ORIGIN may be `UNKNOWN`

MISSING live table → **BLOCK**; write a **creation** migration on a separate path — not this convention.

## 11. Forbidden under this convention

- `CREATE TABLE` / `ALTER` / `DROP` / index/policy/trigger DDL in recovery artifacts
- `CREATE TABLE IF NOT EXISTS` as “authority closed”
- silent ALTER catch-up as recovery
- auto-repair live toward fingerprint
- auto-CREATE on MISSING
- new ORM / DSL / external schema framework / new DB package
- expanding scope to functions/views/etc. without a new Owner decision

## 12. Payment sample representability (design check only)

Using CUT 7-C proven live fingerprint — **no files written in CUT 7-E**:

| Table | Representable? |
|---|---|
| `store_payments` | **YES** — columns, PK, FK ON DELETE RESTRICT, UNIQUE(order_id)+UNIQUE(provider_payment_id), CHECKs, explicit partial index, RLS on/forced off, policies `[]`, triggers `[]` |
| `store_payment_events` | **YES** — columns, PK, FK ON DELETE SET NULL, no UNIQUE/CHECK, two explicit indexes, RLS on/forced off, policies `[]`, triggers `[]` |
| RLS ON + policy 0 | **YES** — `rls.enabled=true`, `policies:[]` |

## 13. Implementation sequence (after this definition)

1. **CUT 7-E (this doc):** convention DEFINED  
2. **Later CUT (e.g. 7-F):** implement verifier + payment `v1.fingerprint.json` only  
3. Still separate Owner gate for Production apply of any **creation** migration if MISSING  
4. Recovery path never applies DDL

## 14. Decision

**CONVENTION DESIGN: CLOSED**  
**READY FOR PAYMENT ANCHOR: YES** (fingerprint files + verifier only; no live DDL)
