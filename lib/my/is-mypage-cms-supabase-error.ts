type SupabaseErrorLike = {
  message?: string | null;
  code?: string | null;
  status?: number | null;
};

/** PostgREST 404 / schema-cache — `my_page_*` CMS 테이블 미배포 환경. */
export function isMypageCmsTableMissingError(error: SupabaseErrorLike | null | undefined): boolean {
  if (!error) return false;
  const code = String(error.code ?? "");
  const message = String(error.message ?? "");
  const status = Number(error.status ?? 0);
  if (status === 404) return true;
  if (code === "PGRST205" || code === "42P01") return true;
  return /could not find the table|does not exist|schema cache/i.test(message);
}

export function hasMypageCmsTableMissingError(
  ...errors: Array<SupabaseErrorLike | null | undefined>
): boolean {
  return errors.some((error) => isMypageCmsTableMissingError(error));
}
