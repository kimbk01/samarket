/**
 * 5-A AB-01·AB-02 — 관리자 매장 유형·노출 배지 (순수 · 클라이언트 안전).
 * 「매장 운영」 표·카드가 같은 문구·톤을 쓴다.
 */
export type AdminStoreBadgeTone = "neutral" | "success" | "warning" | "danger" | "progress";

export function adminStoreKindBadge(
  kind: string | null | undefined,
  ko: boolean
): { tone: AdminStoreBadgeTone; label: string } | null {
  if (kind === "sample") return { tone: "warning", label: ko ? "샘플" : "Sample" };
  if (kind === "legacy_test") return { tone: "danger", label: ko ? "테스트" : "Test" };
  if (kind === "real") return { tone: "neutral", label: ko ? "실매장" : "Real" };
  return null;
}

export function adminStoreVisibilityBadge(
  visible: boolean,
  ko: boolean
): { tone: AdminStoreBadgeTone; label: string } {
  return visible
    ? { tone: "success", label: ko ? "노출 중" : "Visible" }
    : { tone: "neutral", label: ko ? "숨김" : "Hidden" };
}
