/** NEXT_PUBLIC_SUPABASE_URL 에서 호스트·프로젝트 ref만 추출 (비밀값 없음) */
export function parseSupabasePublicUrl(
  raw: string
): { host: string; projectRef: string } | null {
  try {
    const u = new URL(raw.trim());
    const host = u.hostname.toLowerCase();
    const m = host.match(/^([a-z0-9-]+)\.supabase\.co$/);
    if (m) return { host, projectRef: m[1] };
    return { host, projectRef: host };
  } catch {
    return null;
  }
}
