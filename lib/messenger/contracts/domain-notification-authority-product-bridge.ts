/**
 * Allowlist Domain Notification Authority — product bridge.
 * Accepts Domain notification envelopes; never dispatches FCM/APNs.
 */
import {
  isDomainNotificationAuthorityEnabledForViewer,
  writeDomainNotificationAuthorityEnvelope,
  type DomainNotificationAuthorityWriteResult,
} from "@/lib/messenger/contracts/domain-notification-authority";

export function tryWriteDomainNotificationAuthority(input: {
  viewerUserId: string;
  raw: unknown;
}): DomainNotificationAuthorityWriteResult {
  if (!isDomainNotificationAuthorityEnabledForViewer(input.viewerUserId)) {
    return { status: "skipped", reason: "authority_off_or_not_allowlisted" };
  }
  return writeDomainNotificationAuthorityEnvelope(input);
}
