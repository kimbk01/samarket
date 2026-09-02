/**
 * Customer Support opening SSOT — all product sources converge here.
 * Does not parse push payloads, run auth, or own viewport geometry.
 */

import type { SupportContext } from "@/lib/support/support-context";
import { isSupportContextEnabled } from "@/lib/support/support-context";
import { stashSupportModalRestoreCaseId } from "@/lib/support/open-support-center";
import { openSupportModal } from "@/lib/support/support-modal-controller";

export type DeliverSupportOpenSource =
  | "push"
  | "inbox"
  | "banner"
  | "fab"
  | "cta"
  | "history"
  | "bootstrap"
  | "restore"
  | "enter";

export type DeliverSupportOpenInput = {
  caseId?: string | null;
  context?: SupportContext | null;
  notificationId?: string | null;
  source: DeliverSupportOpenSource;
};

export type DeliverSupportOpenResult =
  | { ok: true; caseId: string | null; source: DeliverSupportOpenSource }
  | { ok: false; error: "missing_target" | "open_failed"; source: DeliverSupportOpenSource };

/**
 * Durable intent + modal open signal.
 * caseId → stash then open ACTIVE; context → open START.
 */
export function deliverSupportOpen(input: DeliverSupportOpenInput): DeliverSupportOpenResult {
  const source = input.source;
  const caseId = typeof input.caseId === "string" ? input.caseId.trim() : "";
  const context =
    input.context && isSupportContextEnabled(input.context) ? input.context : null;

  if (!caseId && !context) {
    return { ok: false, error: "missing_target", source };
  }

  if (caseId) {
    stashSupportModalRestoreCaseId(caseId);
    const opened = openSupportModal({ caseId });
    if (!opened) {
      return { ok: false, error: "open_failed", source };
    }
    return { ok: true, caseId, source };
  }

  const opened = openSupportModal({ context });
  if (!opened) {
    return { ok: false, error: "open_failed", source };
  }
  return { ok: true, caseId: null, source };
}
