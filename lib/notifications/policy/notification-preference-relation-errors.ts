/**
 * Shared missing-relation detection for P2-A6 preference tables.
 * Production apply may be NOT_PROVEN — consumers must treat absence as no-row.
 */

export function isMissingPreferenceRelationError(
  error: { code?: string; message?: string } | null | undefined
): boolean {
  if (!error) return false;
  const code = String(error.code ?? "");
  const message = String(error.message ?? "");
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    /could not find the table|relation .* does not exist|schema cache/i.test(message)
  );
}
