/** Postgres / PostgREST unique constraint violation (concurrent insert race). */
export function isPostgresUniqueViolation(error: unknown): boolean {
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";
  return code === "23505" || /duplicate key|unique constraint/i.test(message);
}
