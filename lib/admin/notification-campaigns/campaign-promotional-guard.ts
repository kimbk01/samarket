/**
 * 공지·시스템 캠페인으로 광고를 보내는 우회 차단 (Owner 2026-11-05 · 알림 설정 HARD LOCK 제한 재개).
 *
 * 광고성(혜택·이벤트·할인) 내용은 「마케팅」 유형으로만 보낸다 — 마케팅은 직접 동의 회원에게만 간다.
 * 공지·시스템은 동의 없이 전원에게 가므로 아래 세 겹을 모두 통과해야 저장·발송된다.
 *  1) 구조: 이벤트 목적지·마케팅 게시판 글은 공지·시스템에 묶을 수 없다 (`campaign-source-authority`).
 *  2) 확인: 작성자가 「광고 내용 없음」을 확인한 기록(`target_payload.non_promotional_attested`) — 저장 때 남고 감사 기록에 실린다.
 *  3) 보조 검사: 제목·내용의 광고 표지어. 키워드 검사만으로 안전하다고 보지 않는다(1·2 가 본 판정).
 * 발송 직전(즉시·예약·반복·테스트)에도 같은 판정을 다시 한다 — 이전에 저장된 초안도 확인 없이는 나가지 않는다.
 */

export const NON_PROMOTIONAL_ATTESTATION_KEY = "non_promotional_attested";

export type NonPromotionalGuardError =
  | "non_promotional_attestation_required"
  | "promotional_content_requires_marketing_type";

const PROMOTIONAL_MARKERS: readonly RegExp[] = [
  /광고/,
  /할인/,
  /쿠폰/,
  /이벤트/,
  /무료/,
  /특가/,
  /세일/,
  /프로모션/,
  /경품/,
  /적립/,
  /혜택/,
  /\bpromo(tion|tional)?s?\b/i,
  /\bdiscounts?\b/i,
  /\bcoupons?\b/i,
  /\bsale\b/i,
  /\bfree\b/i,
  /\bgiveaways?\b/i,
  /\bevents?\b/i,
  /\bad\b/i,
];

export function readNonPromotionalAttestation(payload: unknown): boolean {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      !Array.isArray(payload) &&
      (payload as Record<string, unknown>)[NON_PROMOTIONAL_ATTESTATION_KEY] === true
  );
}

export function findPromotionalMarkers(...texts: Array<string | null | undefined>): string[] {
  const joined = texts.map((t) => String(t ?? "")).join("\n");
  const hits: string[] = [];
  for (const re of PROMOTIONAL_MARKERS) {
    const m = re.exec(joined);
    if (m) hits.push(m[0]);
  }
  return hits;
}

export function evaluateNonPromotionalCampaign(input: {
  type?: string | null;
  title?: string | null;
  body?: string | null;
  target_payload?: unknown;
}): { ok: true } | { ok: false; error: NonPromotionalGuardError; markers?: string[] } {
  const typ = String(input.type ?? "").trim().toLowerCase();
  if (typ !== "notice" && typ !== "system") return { ok: true };
  if (!readNonPromotionalAttestation(input.target_payload)) {
    return { ok: false, error: "non_promotional_attestation_required" };
  }
  const markers = findPromotionalMarkers(input.title, input.body);
  if (markers.length > 0) {
    return { ok: false, error: "promotional_content_requires_marketing_type", markers };
  }
  return { ok: true };
}
