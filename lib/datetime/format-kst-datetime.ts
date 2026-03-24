const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * 한국 표준시(KST, UTC+9) 기준 시각 문자열.
 * Node와 브라우저의 `toLocaleString("ko-KR")` 차이(PM vs 오후 등)로 인한 하이드레이션 불일치를 피합니다.
 */
export function formatKstDatetimeLong(iso: string | null | undefined): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return "—";
  const u = new Date(new Date(iso).getTime() + KST_OFFSET_MS);
  const y = u.getUTCFullYear();
  const mo = u.getUTCMonth() + 1;
  const day = u.getUTCDate();
  const h24 = u.getUTCHours();
  const mi = u.getUTCMinutes();
  const sec = u.getUTCSeconds();
  const ap = h24 < 12 ? "오전" : "오후";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return `${y}. ${mo}. ${day}. ${ap} ${h12}:${pad2(mi)}:${pad2(sec)}`;
}
