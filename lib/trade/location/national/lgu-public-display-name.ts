/**
 * 시/군 표시 이름 하나 — 「City of Manila」 → 「Manila City」 (주소 SSOT 5단계 2026-11-09).
 * 전국 PSGC 데이터는 139곳이 「City of X」 형식이고, 거래 rollup·주소 화면은 「X City」 형식이라
 * 같은 시/군이 화면마다 다르게 보였다(거래 카드·거래 지역 선택 「City of Bacoor」 / 주소 「Bacoor City」).
 * 화면으로 나가는 시/군 이름은 모두 이 함수를 거친다. 판정·검색(정규화 이름)에는 쓰지 않는다.
 */
export function formatLguPublicDisplayName(raw: string | null | undefined): string {
  const t = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const m = t.match(/^City of (.+)$/i);
  return m ? `${m[1]!.trim()} City` : t;
}
