/**
 * D-2 (Owner 결정 · 「설계안대로」 2026-11-04): 「다시 보지 않기」(CAMPAIGN 숨김)가 풀리는 것은
 * **이미지 교체 + CTA 목적지 변경** 두 가지뿐이다. 제목·본문·버튼 문구 수정은 revision 을 바꾸지 않는다.
 *
 * revision = `<소재 기준값>~d<목적지 해시>`
 * - 소재 기준값: 팝업 = 노출 소재 id · PTR = 띠 3종 소재 id 이음(`ptrRevealCampaignRevision`) — 이미지를 바꾸면 새 소재 행이라 바뀐다
 * - 목적지 해시: 정규화한 CTA 주소(`normalizePlatformPopupCta().href`)의 FNV-1a 32bit
 *
 * 예전(이 변경 전) 숨김 행은 `~d` 없이 소재 기준값만 저장했다. 그 행은 소재 기준값만 비교한다 —
 * 이미 숨긴 회원은 그대로 숨겨지고(새 소재일 때만 다시 보임), 목적지 변경 초기화는 이후 숨긴 행부터 적용된다.
 */

import { normalizePlatformPopupCta, type PlatformPopupCtaInput } from "@/lib/platform-popup/cta";

const DEST_SEP = "~d";

function fnv1a32Hex(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** 목적지 해시 — 같은 목적지면 같은 값. 형식이 틀린 CTA 는 원문 3칸으로 해시한다(노출은 어차피 막힘) */
export function platformPopupDestinationRevisionHash(cta: PlatformPopupCtaInput): string {
  const n = normalizePlatformPopupCta(cta);
  const key = n.ok
    ? `${n.value.ctaType}|${n.value.href}`
    : `${String(cta.ctaType ?? "")}|${String(cta.ctaTarget ?? "")}|${String(cta.externalUrl ?? "")}`;
  return fnv1a32Hex(key);
}

export function withPlatformPopupDestinationRevision(
  creativeRevision: string | null | undefined,
  cta: PlatformPopupCtaInput
): string | null {
  const base = String(creativeRevision ?? "").trim();
  if (!base) return null;
  return `${base}${DEST_SEP}${platformPopupDestinationRevisionHash(cta)}`;
}

/** 저장된 숨김 revision 이 지금 revision 과 같은 판인지 (예전 형식 = 소재 기준값만 비교) */
export function platformPopupRevisionMatches(stored: string, current: string): boolean {
  const a = stored.trim();
  const b = current.trim();
  if (a === b) return true;
  if (a.includes(DEST_SEP)) return false;
  const i = b.indexOf(DEST_SEP);
  return i > 0 && b.slice(0, i) === a;
}
