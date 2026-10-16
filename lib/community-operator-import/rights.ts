/**
 * REPUBLICATION RIGHTS (pure; unit-tested). Being publicly visible is not a right to republish:
 *  - full body + images only for sources whose rights the Owner recorded
 *  - every other source is published as summary + link
 *  - the public 출처 block can be hidden only when the rights carry no attribution duty
 * Enforced on the server at source update and again at publish.
 */
import type { ContentPolicy } from "./types";

export const RIGHTS_BASES = ["unverified", "permission", "public_domain", "cc_by", "cc_by_sa", "own"] as const;
export type RightsBasis = (typeof RIGHTS_BASES)[number];

export const RIGHTS_LABEL: Record<RightsBasis, string> = {
  unverified: "권한 미확인 (요약·링크만)",
  permission: "작성자·운영자 허락 받음",
  public_domain: "공공저작물·저작권 없음",
  cc_by: "CC BY (출처 표시 의무)",
  cc_by_sa: "CC BY-SA (출처·라이선스 표시 의무)",
  own: "DIBAY 자체 콘텐츠",
};

export type SourceRights = { rightsBasis: RightsBasis; attributionRequired: boolean };

export function parseRightsBasis(raw: unknown): RightsBasis {
  const s = String(raw ?? "").trim();
  return (RIGHTS_BASES as readonly string[]).includes(s) ? (s as RightsBasis) : "unverified";
}

/** Full body + images may be republished. */
export function allowsFullContent(r: SourceRights): boolean {
  return r.rightsBasis !== "unverified";
}

/** The public 출처 block may be hidden (CC licences and unverified sources always show it). */
export function allowsHiddenAttribution(r: SourceRights): boolean {
  if (r.rightsBasis === "unverified" || r.rightsBasis === "cc_by" || r.rightsBasis === "cc_by_sa") return false;
  return !r.attributionRequired;
}

/** Highest policy the rights allow for a requested one (full → summary_link without rights). */
export function capPolicyByRights(policy: ContentPolicy, r: SourceRights): ContentPolicy {
  return policy === "full" && !allowsFullContent(r) ? "summary_link" : policy;
}

/** Whether the 출처 block is shown, after the rights rule (a hide request is ignored when not allowed). */
export function attributionShown(requestedShow: boolean | undefined, r: SourceRights): boolean {
  if (requestedShow !== false) return true;
  return !allowsHiddenAttribution(r);
}
