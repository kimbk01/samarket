/**
 * Phase 9 — general_direct Notification Port (envelope → display).
 * production Push wiring 금지.
 */
import {
  assertEnvelopeViewer,
  parseMessengerNotificationEnvelope,
  type GeneralDirectDisplayContext,
  type MessengerNotificationEnvelope,
} from "@/lib/messenger/contracts/domain-notification-envelope-phase9";
import { assertSoundKeyMatchesEnvelope } from "@/lib/messenger/contracts/domain-sound-key-phase9";
import { resolveGeneralDirectNotificationDisplay } from "@/lib/messenger/general-direct/notification-sound";
import { GENERAL_DIRECT_DOMAIN } from "@/lib/messenger/general-direct/types";

export type GeneralDirectResolvedNotification = Readonly<{
  domain: typeof GENERAL_DIRECT_DOMAIN;
  title: string;
  avatarUrl: string | null;
  preview: string;
  eventId: string;
  soundKey: string;
  setsOsBadge: false;
}>;

export function applyGeneralDirectNotificationEnvelope(
  raw: unknown,
  opts: { viewerUserId: string }
): GeneralDirectResolvedNotification {
  const envelope = parseMessengerNotificationEnvelope(raw);
  if (envelope.chatDomain !== GENERAL_DIRECT_DOMAIN) {
    throw new Error(`dibay_general_direct_notification_rejects:${envelope.chatDomain}`);
  }
  assertEnvelopeViewer(envelope, opts.viewerUserId);
  assertSoundKeyMatchesEnvelope(GENERAL_DIRECT_DOMAIN, envelope.soundKey);
  const ctx = envelope.displayContext as GeneralDirectDisplayContext;
  const display = resolveGeneralDirectNotificationDisplay({
    chatDomain: envelope.chatDomain,
    domainIdentityKey: envelope.domainIdentityKey,
    roomId: envelope.roomId,
    eventId: envelope.eventId,
    senderDisplayName: ctx.peerDisplayName,
    senderAvatarUrl: ctx.peerAvatarUrl,
    messagePreview: ctx.messagePreview,
  });
  return {
    domain: GENERAL_DIRECT_DOMAIN,
    title: display.title,
    avatarUrl: display.avatarUrl,
    preview: display.preview,
    eventId: envelope.eventId,
    soundKey: envelope.soundKey,
    setsOsBadge: false,
  };
}

/** isolated cache — eventId 중복 0 */
export class GeneralDirectNotificationCacheHarness {
  private readonly byEventId = new Map<string, GeneralDirectResolvedNotification>();

  apply(raw: unknown, viewerUserId: string): { applied: boolean; size: number } {
    const resolved = applyGeneralDirectNotificationEnvelope(raw, { viewerUserId });
    if (this.byEventId.has(resolved.eventId)) {
      return { applied: false, size: this.byEventId.size };
    }
    this.byEventId.set(resolved.eventId, resolved);
    return { applied: true, size: this.byEventId.size };
  }

  get size(): number {
    return this.byEventId.size;
  }
}

export function assertIsGeneralDirectEnvelope(
  envelope: MessengerNotificationEnvelope
): void {
  if (envelope.chatDomain !== GENERAL_DIRECT_DOMAIN) {
    throw new Error("dibay_general_direct_envelope_required");
  }
}
