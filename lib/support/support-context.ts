/**
 * DIBAY Support Center — FAB / entry context TRANSPORT ONLY.
 * Category semantic authority: support-category-registry.ts
 * Visibility is opt-in per screen (`enabled: true`). No pathname inference.
 */

export type { SupportAudience, SupportCategory, MemberSupportCategory, OwnerSupportCategory } from "@/lib/support/support-category-registry";
export {
  MEMBER_SUPPORT_CATEGORIES,
  OWNER_SUPPORT_CATEGORIES,
} from "@/lib/support/support-category-registry";

import type {
  SupportAudience,
  SupportCategory,
  MemberSupportCategory,
  OwnerSupportCategory,
} from "@/lib/support/support-category-registry";

export type SupportContext = {
  enabled: boolean;
  audience: SupportAudience;
  /** Category candidate (may be legacy alias; server maps to canonical). */
  category: SupportCategory;
  sourceSurface: string;
  referenceType?: string;
  referenceId?: string;
  storeId?: string;
  /**
   * Set only when the user explicitly picked 기타 on a generic hub gate.
   * Required for generic hub + OTHER (server fail-closed otherwise).
   */
  explicitOtherSelection?: boolean;
};

/**
 * Disabled placeholder — category OTHER is inert while enabled=false.
 * Must never be used as an implicit open default (open path rejects disabled).
 */
export const DISABLED_SUPPORT_CONTEXT: SupportContext = {
  enabled: false,
  audience: "MEMBER",
  category: "OTHER",
  sourceSurface: "none",
};

export type MemberSupportContextInput = {
  enabled: boolean;
  category: MemberSupportCategory;
  sourceSurface: string;
  referenceType?: string;
  referenceId?: string;
  explicitOtherSelection?: boolean;
};

export type OwnerSupportContextInput = {
  enabled: boolean;
  category: OwnerSupportCategory;
  sourceSurface: string;
  storeId?: string;
  referenceType?: string;
  referenceId?: string;
  explicitOtherSelection?: boolean;
};

export function buildMemberSupportContext(input: MemberSupportContextInput): SupportContext {
  return {
    enabled: input.enabled === true,
    audience: "MEMBER",
    category: input.category,
    sourceSurface: input.sourceSurface.trim() || "unknown",
    referenceType: input.referenceType?.trim() || undefined,
    referenceId: input.referenceId?.trim() || undefined,
    ...(input.explicitOtherSelection === true ? { explicitOtherSelection: true } : {}),
  };
}

export function buildOwnerSupportContext(input: OwnerSupportContextInput): SupportContext {
  const storeId = input.storeId?.trim() || undefined;
  return {
    enabled: input.enabled === true,
    audience: "OWNER",
    category: input.category,
    sourceSurface: input.sourceSurface.trim() || "unknown",
    storeId,
    referenceType: input.referenceType?.trim() || undefined,
    referenceId: input.referenceId?.trim() || undefined,
    ...(input.explicitOtherSelection === true ? { explicitOtherSelection: true } : {}),
  };
}

export function isSupportContextEnabled(ctx: SupportContext | null | undefined): ctx is SupportContext {
  return Boolean(ctx && ctx.enabled === true);
}

export const SUPPORT_CONTEXT_SESSION_KEY = "dibay:support:center:pending-context";
