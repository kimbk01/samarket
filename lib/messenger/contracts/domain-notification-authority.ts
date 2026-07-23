/**
 * STEP 5 — Domain Notification Authority (Phase9 envelope/sound/ports).
 *
 * Product flag PHASE11D_A_NOTIFICATION_WRITE CONNECTED (allowlist envelope accept).
 * FORBIDDEN: FCM / APNs / native push dispatch (NATIVE_PUSH_FORBIDDEN remains true).
 */
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import { assertNoDualWrite } from "@/lib/messenger/contracts/cutover";
import {
  assertPhase9NotificationWiringOff,
  parseMessengerNotificationEnvelope,
  type MessengerNotificationEnvelope,
  PHASE9_NOTIFICATION_PRODUCTION_WIRING,
} from "@/lib/messenger/contracts/domain-notification-envelope-phase9";
import {
  isPhase11dAAllowlisted,
  isPhase11dACanaryKilled,
  PHASE11D_A_NOTIFICATION_AUTHORITY_PREPARED,
  PHASE11D_A_NOTIFICATION_WRITE,
} from "@/lib/messenger/contracts/phase11da-canary-gate";

export { PHASE11D_A_NOTIFICATION_AUTHORITY_PREPARED };

/** Explicit ban — never import native push bridges from this Authority. */
export const DOMAIN_NOTIFICATION_AUTHORITY_NATIVE_PUSH_FORBIDDEN = true as const;

export function assertDomainNotificationAuthorityWritersContract(): void {
  if (!PHASE11D_A_NOTIFICATION_WRITE) {
    throw new Error("dibay_domain_notification_authority_requires_notification_write_flag");
  }
  assertPhase9NotificationWiringOff();
  if (PHASE9_NOTIFICATION_PRODUCTION_WIRING) {
    throw new Error("dibay_phase9_notification_all_user_wiring_must_remain_false");
  }
  if (!DOMAIN_NOTIFICATION_AUTHORITY_NATIVE_PUSH_FORBIDDEN) {
    throw new Error("dibay_domain_notification_native_push_must_remain_forbidden");
  }
  assertNoDualWrite(["domain"]);
}

export function isDomainNotificationAuthorityEnabledForViewer(viewerUserId: string): boolean {
  if (!PHASE11D_A_NOTIFICATION_WRITE) return false;
  if (isPhase11dACanaryKilled()) return false;
  if (!isPhase11dAAllowlisted(viewerUserId)) return false;
  return true;
}

export type DomainNotificationAuthorityWriteResult =
  | { status: "accepted"; envelope: MessengerNotificationEnvelope; nativePush: "forbidden" }
  | { status: "skipped"; reason: "authority_off_or_not_allowlisted" }
  | { status: "rejected"; reason: string };

/**
 * Product notification write — allowlist envelope accept.
 * Never dispatches FCM/APNs (nativePush always forbidden).
 */
export function writeDomainNotificationAuthorityEnvelope(input: {
  viewerUserId: string;
  raw: unknown;
}): DomainNotificationAuthorityWriteResult {
  const viewer = input.viewerUserId.trim();
  if (!isDomainNotificationAuthorityEnabledForViewer(viewer)) {
    return { status: "skipped", reason: "authority_off_or_not_allowlisted" };
  }
  assertDomainNotificationAuthorityWritersContract();
  try {
    const envelope = parseMessengerNotificationEnvelope(input.raw);
    if (envelope.viewerUserId !== viewer) {
      return { status: "rejected", reason: "viewer_mismatch" };
    }
    // Envelope accepted for Domain Authority; native push remains forbidden.
    void DOMAIN_NOTIFICATION_AUTHORITY_NATIVE_PUSH_FORBIDDEN;
    return { status: "accepted", envelope, nativePush: "forbidden" };
  } catch (err) {
    return {
      status: "rejected",
      reason: err instanceof Error ? err.message : "parse_failed",
    };
  }
}

/** Isolated harness — envelope parse only (no push). */
export function parseDomainNotificationAuthorityForHarness(
  raw: unknown
): MessengerNotificationEnvelope {
  assertPhase9NotificationWiringOff();
  return parseMessengerNotificationEnvelope(raw);
}

export function listDomainNotificationAuthoritySurfaces(): ReadonlyArray<{
  domain: ChatDomain;
  surface: "default" | "customer";
  authority: "DOMAIN_AUTHORITY" | "OFF";
  nativePush: "forbidden";
  ready: boolean;
}> {
  const authority = PHASE11D_A_NOTIFICATION_WRITE
    ? ("DOMAIN_AUTHORITY" as const)
    : ("OFF" as const);
  return [
    {
      domain: "general_direct",
      surface: "default",
      authority,
      nativePush: "forbidden",
      ready: true,
    },
    { domain: "group", surface: "default", authority, nativePush: "forbidden", ready: true },
    { domain: "trade", surface: "default", authority, nativePush: "forbidden", ready: true },
    {
      domain: "store_order",
      surface: "customer",
      authority,
      nativePush: "forbidden",
      ready: true,
    },
  ];
}
