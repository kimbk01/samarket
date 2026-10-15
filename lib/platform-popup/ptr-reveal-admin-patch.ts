/**
 * PTR 띠 광고 관리자 — 편집 폼 ↔ 저장 PATCH (변경된 필드만).
 *
 * 노출 중(active/scheduled) 캠페인은 서버가 소재·CTA·대상·기간·억제 변경을 "재검토"로 되돌린다
 * (`platformPopupMaterialEditRequiresReview`). 바뀌지 않은 필드까지 매번 보내면 이름만 고쳐도
 * 노출이 내려가므로, 저장 직전 상태와 비교해 바뀐 묶음만 보낸다.
 */

import { frequencyModeToDismissSuppressMode } from "@/lib/platform-popup/dismiss-ssot";
import type { PlatformPopupFrequencyMode } from "@/lib/platform-popup/presentation-contract";

export type PtrRevealAdminForm = {
  name: string;
  priority: number;
  title: string;
  ctaLabel: string;
  ctaType: "internal_page" | "external_url";
  ctaTarget: string;
  externalUrl: string;
  surfaces: string[];
  startLocal: string;
  endLocal: string;
  frequencyMode: PlatformPopupFrequencyMode;
  audienceMode: "all" | "allowlist";
  audienceUserIdsText: string;
};

export function parseAudienceUserIdsText(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** datetime-local(브라우저 로컬) → ISO. 비어 있으면 null. */
export function ptrRevealLocalInputToIso(v: string): string | null {
  if (!v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

/** 바뀐 필드 묶음만 담은 PATCH 본문 — 아무것도 안 바뀌었으면 빈 객체 */
export function buildPtrRevealAdminPatch(
  saved: PtrRevealAdminForm,
  next: PtrRevealAdminForm
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (next.name !== saved.name) body.name = next.name;
  if (next.priority !== saved.priority) body.priority = next.priority;
  if (next.title !== saved.title) body.title = next.title;
  if (next.ctaLabel !== saved.ctaLabel) body.ctaLabel = next.ctaLabel;

  const ctaChanged =
    next.ctaType !== saved.ctaType ||
    (next.ctaType === "internal_page"
      ? next.ctaTarget.trim() !== saved.ctaTarget.trim()
      : next.externalUrl.trim() !== saved.externalUrl.trim());
  if (ctaChanged) {
    body.ctaType = next.ctaType;
    body.ctaTarget = next.ctaType === "internal_page" ? next.ctaTarget : "";
    body.externalUrl = next.ctaType === "external_url" ? next.externalUrl : null;
  }

  if (!sameSet(next.surfaces, saved.surfaces)) body.surfaces = next.surfaces;

  if (next.startLocal !== saved.startLocal || next.endLocal !== saved.endLocal) {
    body.startAt = ptrRevealLocalInputToIso(next.startLocal);
    body.endAt = ptrRevealLocalInputToIso(next.endLocal);
  }

  if (next.frequencyMode !== saved.frequencyMode) {
    body.frequencyMode = next.frequencyMode;
    // 빈도 SSOT → 억제 모드 (팝업과 같은 매핑)
    body.suppressionMode = frequencyModeToDismissSuppressMode(next.frequencyMode);
  }

  const nextIds = parseAudienceUserIdsText(next.audienceUserIdsText);
  const savedIds = parseAudienceUserIdsText(saved.audienceUserIdsText);
  if (next.audienceMode !== saved.audienceMode || !sameSet(nextIds, savedIds)) {
    body.audienceMode = next.audienceMode;
    body.audienceUserIds = nextIds;
  }
  return body;
}
