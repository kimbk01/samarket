/**
 * 홈 위쪽 칸 배치 — 슈퍼앱 개편 설계 §2 (Owner 「제안대로 승인」 2026-11-26).
 * 홈 칸 폭 600 이상: 2열 **정확히 반반**. 1행 = 배너 | 서비스, 2행 = telRING | 정보 띠 + 내 진행 중(세로로 쌓음).
 * 보이는 칸에 맞춰 `grid-template-areas` 를 만든다 — 한쪽이 없으면 남은 칸이 두 열을 차지(빈 반쪽 없음).
 * 600 미만(휴대폰)은 이 값을 쓰지 않고 DOM 순서대로 한 줄(정보 띠 → 배너 → 서비스 → telRING → 내 진행 중).
 */
export type HomeTopPresence = { banner: boolean; services: boolean; telring: boolean; info: boolean; my: boolean };

export function resolveHomeTopAreas(p: HomeTopPresence): { areas: string; cols: string } | null {
  const rows: [string, string][] = [];
  if (p.banner && p.services) rows.push(["banner", "svc"]);
  else if (p.banner) rows.push(["banner", "banner"]);
  else if (p.services) rows.push(["svc", "svc"]);

  const right = [p.info ? "info" : null, p.my ? "my" : null].filter((x): x is string => x != null);
  if (p.telring) {
    if (right.length === 0) rows.push(["ring", "ring"]);
    for (const r of right) rows.push(["ring", r]);
  } else if (right.length === 2) {
    rows.push(["info", "my"]);
  } else if (right.length === 1) {
    rows.push([right[0]!, right[0]!]);
  }
  if (rows.length === 0) return null;
  return {
    areas: rows.map(([a, b]) => `"${a} ${b}"`).join(" "),
    cols: "minmax(0, 1fr) minmax(0, 1fr)",
  };
}
