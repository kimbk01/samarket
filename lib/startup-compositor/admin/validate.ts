/**
 * REBUILD 14 P6 — canonical validation for Admin authoring documents.
 */

import {
  validateDocumentIssues,
  validateDocumentV0,
  type DocumentIssue,
} from "@/lib/intro/contracts/document";
import { parseSystemStartIR } from "@/lib/startup-compositor/system-start-ir";
import { validateMotionToken } from "@/lib/startup-compositor/registries/motion";
import { validateTransitionToken } from "@/lib/startup-compositor/registries/transition";
import type { StartupAuthoringDocument } from "@/lib/startup-compositor/admin/authoring-document";
import { humanizeAuthoringError } from "@/lib/startup-compositor/admin/human-errors";

export type AuthoringValidation =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly messageKo: string;
      readonly issues: readonly DocumentIssue[];
    };

export function validateAuthoringDocument(
  doc: StartupAuthoringDocument,
): AuthoringValidation {
  const ss = parseSystemStartIR(doc.systemStart);
  if (!ss.ok) {
    return {
      ok: false,
      reason: ss.reason,
      messageKo: humanizeAuthoringError(ss.reason),
      issues: [],
    };
  }

  if (doc.introEnabled) {
    const introErr = validateDocumentV0(doc.intro);
    if (introErr) {
      const issues = validateDocumentIssues(doc.intro);
      return {
        ok: false,
        reason: introErr,
        messageKo: humanizeAuthoringError(introErr),
        issues,
      };
    }
    for (const scene of doc.intro.scenes) {
      const tr = validateTransitionToken(scene.transition);
      if (!tr.ok) {
        return {
          ok: false,
          reason: tr.reason,
          messageKo: humanizeAuthoringError(tr.reason),
          issues: [],
        };
      }
      for (const el of scene.elements) {
        const mo = validateMotionToken(el.motion);
        if (!mo.ok) {
          return {
            ok: false,
            reason: mo.reason,
            messageKo: humanizeAuthoringError(mo.reason),
            issues: [],
          };
        }
        if (el.type === "CTA") {
          const action = (el.payload as { action?: { type?: string; url?: string } })
            .action;
          if (action && ("url" in action || action.type === "EXTERNAL_URL")) {
            return {
              ok: false,
              reason: "raw_url_cta_forbidden",
              messageKo: humanizeAuthoringError("raw_url_cta_forbidden"),
              issues: [],
            };
          }
        }
      }
    }
  }

  return { ok: true };
}
