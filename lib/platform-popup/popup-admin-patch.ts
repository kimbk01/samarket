/**
 * 광고 표면 연동 P-1·P-9 (2026-11-04) — 팝업·PTR 관리자 저장 PATCH 정본.
 *
 * - 팝업 상세도 PTR(`ptr-reveal-admin-patch.ts`)처럼 **처음 불러온 값과 비교해 바뀐 묶음만** 보낸다.
 *   예전에는 매번 모든 칸을 보내 이름만 고쳐도 노출 중 팝업이 다시 승인 대기로 내려갔다.
 * - 재검토 묶음 판정(`platformPopupPatchReviewGroups`)은 서버 writer 와 화면 확인창이 **같은 함수**를 쓴다.
 */

import { frequencyModeToDismissSuppressMode } from "@/lib/platform-popup/dismiss-ssot";
import type { PlatformPopupMaterialField } from "@/lib/platform-popup/admin-campaign-authority";

export type PlatformPopupReviewGroup = PlatformPopupMaterialField;

/**
 * PATCH 본문(camelCase) → 바뀌면 재검토가 필요한 묶음.
 * 서버 writer 와 같은 「값이 왔는가」 기준 — null 이면 안 온 것으로 보는 칸은 `!= null`, 비우기가 뜻이 있는 칸은 `in`.
 * `operatorPopup`(사장님 신청 없는 운영자 광고)은 기간 변경만으로 재검토하지 않는다 (E-2 · Owner 2026-11-04).
 */
export function platformPopupPatchReviewGroups(
  body: Record<string, unknown>,
  opts: { operatorPopup: boolean }
): Set<PlatformPopupReviewGroup> {
  const has = (k: string) => k in body;
  const set = (k: string) => body[k] != null;
  const out = new Set<PlatformPopupReviewGroup>();
  if (Array.isArray(body.surfaces) && body.surfaces.length > 0) out.add("surfaces");
  if (set("audienceMode") || has("audienceUserIds")) out.add("surfaces");
  if (!opts.operatorPopup && (has("startAt") || has("endAt") || set("timezone"))) out.add("schedule");
  if (set("suppressionMode") || has("suppressionDurationSeconds")) out.add("suppression");
  if (set("ctaType") || set("ctaTarget") || has("externalUrl") || has("ctaLabel")) out.add("cta");
  if (set("presentationType") || has("title") || has("body") || has("altText")) out.add("creative");
  if (body.creativeMode === "artwork" || body.creativeMode === "card") out.add("creative");
  return out;
}

/** 노출 중(active·scheduled) 캠페인에 이 PATCH 를 보내면 다시 승인이 필요해지는가 */
export function platformPopupPatchWouldRevertToReview(
  body: Record<string, unknown>,
  opts: { status: string | null | undefined; operatorPopup: boolean }
): boolean {
  const live = opts.status === "active" || opts.status === "scheduled";
  return live && platformPopupPatchReviewGroups(body, opts).size > 0;
}

export type PlatformPopupAdminForm = {
  name: string;
  priority: number;
  timezone: string;
  /** 이미 ISO 로 바꾼 값(캠페인 시간대 벽시계 → ISO) */
  startAt: string | null;
  endAt: string | null;
  surfaces: string[];
  suppressionMode: string;
  suppressionDurationSeconds: number | null;
  presentationType: string;
  frequencyMode: string;
  creativeMode: "card" | "artwork";
  ctaType: string;
  ctaTarget: string;
  externalUrl: string | null;
  ctaLabel: string | null;
  title: string | null;
  body: string | null;
  altText: string | null;
};

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

const norm = (v: string | null | undefined) => (v ?? "").trim();

/** 바뀐 묶음만 담은 팝업 PATCH 본문 — 아무것도 안 바뀌었으면 빈 객체 */
export function buildPlatformPopupAdminPatch(
  saved: PlatformPopupAdminForm,
  next: PlatformPopupAdminForm
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (next.name !== saved.name) body.name = next.name;
  if (next.priority !== saved.priority) body.priority = next.priority;

  if (
    next.timezone !== saved.timezone ||
    (next.startAt ?? null) !== (saved.startAt ?? null) ||
    (next.endAt ?? null) !== (saved.endAt ?? null)
  ) {
    body.timezone = next.timezone;
    body.startAt = next.startAt;
    body.endAt = next.endAt;
  }

  if (!sameSet(next.surfaces, saved.surfaces)) body.surfaces = next.surfaces;

  if (
    next.suppressionMode !== saved.suppressionMode ||
    next.suppressionDurationSeconds !== saved.suppressionDurationSeconds
  ) {
    body.suppressionMode = next.suppressionMode;
    body.suppressionDurationSeconds = next.suppressionDurationSeconds;
  }

  if (next.presentationType !== saved.presentationType) body.presentationType = next.presentationType;

  if (next.frequencyMode !== saved.frequencyMode) {
    body.frequencyMode = next.frequencyMode;
    // 빈도 SSOT → 억제 모드 (PTR 과 같은 매핑)
    body.suppressionMode = frequencyModeToDismissSuppressMode(next.frequencyMode);
  }

  if (next.creativeMode !== saved.creativeMode) body.creativeMode = next.creativeMode;

  if (
    next.ctaType !== saved.ctaType ||
    norm(next.ctaTarget) !== norm(saved.ctaTarget) ||
    norm(next.externalUrl) !== norm(saved.externalUrl)
  ) {
    body.ctaType = next.ctaType;
    body.ctaTarget = next.ctaTarget;
    body.externalUrl = next.externalUrl?.trim() ? next.externalUrl : null;
  }

  if (norm(next.ctaLabel) !== norm(saved.ctaLabel)) body.ctaLabel = norm(next.ctaLabel) || null;
  if (norm(next.title) !== norm(saved.title)) body.title = norm(next.title) || null;
  if (norm(next.body) !== norm(saved.body)) body.body = norm(next.body) || null;
  if (norm(next.altText) !== norm(saved.altText)) body.altText = norm(next.altText) || null;
  return body;
}
