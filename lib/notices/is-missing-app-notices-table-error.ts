/**
 * True only when `app_notices` relation/table is missing.
 * Must NOT treat missing-column errors (e.g. starts_at/ends_at) as table-missing.
 */
export function isMissingAppNoticesTableError(message: string): boolean {
  const m = String(message ?? "").toLowerCase();
  if (!m.includes("app_notices")) return false;
  // Column absence: "column app_notices.starts_at does not exist"
  // or "Could not find the 'ends_at' column of 'app_notices' in the schema cache"
  if (/\bcolumn\b/.test(m)) return false;
  return (
    /relation ["']?public\.app_notices["']? does not exist/.test(m) ||
    /relation ["']?app_notices["']? does not exist/.test(m) ||
    /could not find the table ['"][^'"]*app_notices['"]/.test(m)
  );
}
