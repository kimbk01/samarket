/**
 * PHASE 3-B — Customer Support triage product state machine.
 * Case creation happens only at HANDOFF_SUMMARY submit.
 */

import type { SupportAudience } from "@/lib/support/support-category-registry";
import {
  listIssueTypesForCategory,
  listSelectableSupportCategories,
  resolveCanonicalSupportCategoryId,
} from "@/lib/support/support-category-registry";
import type { SupportGuidanceEntryRow } from "@/lib/support/support-guidance-authority";
import type { SupportContext } from "@/lib/support/support-context";
import { isSupportGenericHubSourceSurface } from "@/lib/support/support-generic-hub-policy";

export type SupportTriageStep =
  | "START_CATEGORY"
  | "START_ISSUE"
  | "GUIDANCE"
  | "HANDOFF_SUMMARY";

export type SupportTriageState = {
  step: SupportTriageStep;
  audience: SupportAudience;
  sourceSurface: string;
  storeId?: string;
  category: string | null;
  issueType: string | null;
  explicitOtherSelection: boolean;
  /** Contextual entry: category prefilled; skip generic picker until "다른 문제". */
  categoryLocked: boolean;
  referenceType?: string;
  referenceId?: string;
  guidance: SupportGuidanceEntryRow | null;
  guidanceEmpty: boolean;
  guidanceOutcome: "ESCALATED_TO_HUMAN" | "RESOLVED_BY_GUIDANCE" | null;
  initialSummary: string;
};

export type SupportTriageAction =
  | { type: "SELECT_CATEGORY"; categoryId: string }
  | { type: "SELECT_ISSUE"; issueType: string }
  | {
      type: "GUIDANCE_LOADED";
      entry: SupportGuidanceEntryRow | null;
    }
  | { type: "GUIDANCE_RESOLVED" }
  | { type: "GUIDANCE_ESCALATE" }
  | { type: "SET_SUMMARY"; value: string }
  | { type: "BACK" }
  | { type: "SWITCH_TO_GENERIC" };

export function initSupportTriageFromContext(
  context: SupportContext
): SupportTriageState {
  const audience = context.audience === "OWNER" ? "OWNER" : "MEMBER";
  const sourceSurface = context.sourceSurface.trim() || "unknown";
  const storeId = context.storeId?.trim() || undefined;
  const rawCategory = String(context.category ?? "").trim();

  const forceGeneric =
    context.needsCategorySelection === true ||
    !rawCategory ||
    isSupportGenericHubSourceSurface(sourceSurface);

  if (forceGeneric) {
    return {
      step: "START_CATEGORY",
      audience,
      sourceSurface,
      storeId,
      category: null,
      issueType: null,
      explicitOtherSelection: false,
      categoryLocked: false,
      referenceType: undefined,
      referenceId: undefined,
      guidance: null,
      guidanceEmpty: false,
      guidanceOutcome: null,
      initialSummary: "",
    };
  }

  const canonical = resolveCanonicalSupportCategoryId(rawCategory, audience);
  if (!canonical) {
    return {
      step: "START_CATEGORY",
      audience,
      sourceSurface,
      storeId,
      category: null,
      issueType: null,
      explicitOtherSelection: false,
      categoryLocked: false,
      referenceType: undefined,
      referenceId: undefined,
      guidance: null,
      guidanceEmpty: false,
      guidanceOutcome: null,
      initialSummary: "",
    };
  }

  return {
    step: "START_ISSUE",
    audience,
    sourceSurface,
    storeId,
    category: canonical,
    issueType: null,
    explicitOtherSelection: context.explicitOtherSelection === true,
    categoryLocked: true,
    referenceType: context.referenceType?.trim() || undefined,
    referenceId: context.referenceId?.trim() || undefined,
    guidance: null,
    guidanceEmpty: false,
    guidanceOutcome: null,
    initialSummary: "",
  };
}

export function supportTriageReducer(
  state: SupportTriageState,
  action: SupportTriageAction
): SupportTriageState {
  switch (action.type) {
    case "SELECT_CATEGORY": {
      const canonical = resolveCanonicalSupportCategoryId(
        action.categoryId,
        state.audience
      );
      if (!canonical) return state;
      const selectable = listSelectableSupportCategories(state.audience).some(
        (c) => c.id === canonical
      );
      if (!selectable) return state;
      return {
        ...state,
        step: "START_ISSUE",
        category: canonical,
        issueType: null,
        explicitOtherSelection: canonical === "OTHER",
        guidance: null,
        guidanceEmpty: false,
        guidanceOutcome: null,
        initialSummary: "",
      };
    }
    case "SELECT_ISSUE": {
      if (!state.category) return state;
      const ok = listIssueTypesForCategory(state.category).some(
        (i) => i.id === action.issueType
      );
      if (!ok) return state;
      return {
        ...state,
        step: "GUIDANCE",
        issueType: action.issueType,
        guidance: null,
        guidanceEmpty: false,
        guidanceOutcome: null,
      };
    }
    case "GUIDANCE_LOADED": {
      if (state.step !== "GUIDANCE") return state;
      if (!action.entry) {
        return {
          ...state,
          guidance: null,
          guidanceEmpty: true,
        };
      }
      return {
        ...state,
        guidance: action.entry,
        guidanceEmpty: false,
      };
    }
    case "GUIDANCE_RESOLVED": {
      // Product: leave triage without creating a case — host closes / resets.
      return {
        ...state,
        guidanceOutcome: "RESOLVED_BY_GUIDANCE",
      };
    }
    case "GUIDANCE_ESCALATE": {
      if (!state.guidance && !state.guidanceEmpty) return state;
      return {
        ...state,
        step: "HANDOFF_SUMMARY",
        guidanceOutcome: state.guidance ? "ESCALATED_TO_HUMAN" : null,
      };
    }
    case "SET_SUMMARY":
      return { ...state, initialSummary: action.value };
    case "BACK": {
      if (state.step === "START_ISSUE") {
        if (state.categoryLocked) return state;
        return {
          ...state,
          step: "START_CATEGORY",
          category: null,
          issueType: null,
          explicitOtherSelection: false,
          guidance: null,
          guidanceEmpty: false,
          guidanceOutcome: null,
        };
      }
      if (state.step === "GUIDANCE") {
        return {
          ...state,
          step: "START_ISSUE",
          issueType: null,
          guidance: null,
          guidanceEmpty: false,
          guidanceOutcome: null,
        };
      }
      if (state.step === "HANDOFF_SUMMARY") {
        if (state.guidanceEmpty) {
          return {
            ...state,
            step: "START_ISSUE",
            guidance: null,
            guidanceEmpty: false,
            guidanceOutcome: null,
          };
        }
        return {
          ...state,
          step: "GUIDANCE",
          guidanceOutcome: null,
        };
      }
      return state;
    }
    case "SWITCH_TO_GENERIC":
      return {
        ...state,
        step: "START_CATEGORY",
        category: null,
        issueType: null,
        explicitOtherSelection: false,
        categoryLocked: false,
        referenceType: undefined,
        referenceId: undefined,
        guidance: null,
        guidanceEmpty: false,
        guidanceOutcome: null,
        initialSummary: "",
      };
    default:
      return state;
  }
}

export function buildTriageOpenContext(state: SupportTriageState): SupportContext {
  const category = (state.category ?? "") as SupportContext["category"];
  return {
    enabled: true,
    audience: state.audience,
    category,
    sourceSurface: state.sourceSurface,
    storeId: state.storeId,
    referenceType: state.referenceType,
    referenceId: state.referenceId,
    ...(state.explicitOtherSelection ? { explicitOtherSelection: true } : {}),
  };
}

export function buildShortTriageSeed(category: string, issueType: string): string {
  return `문의 접수 · ${category.trim()} · ${issueType.trim()}`;
}
