/** Asia/Manila is UTC+8 with no DST. DB stores ISO timestamps. */

export function isoToManilaLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms + 8 * 3600 * 1000).toISOString().slice(0, 16);
}

export function manilaLocalToIso(local: string): string | null {
  const trimmed = local.trim();
  if (!trimmed) return null;
  const ms = Date.parse(`${trimmed}:00+08:00`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function formatAdminSchedule(iso: string | null, timezone: string): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  try {
    return new Intl.DateTimeFormat("en-PH", {
      timeZone: timezone || "Asia/Manila",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(ms));
  } catch {
    return iso;
  }
}
