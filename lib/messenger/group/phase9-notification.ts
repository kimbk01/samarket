/**
 * Phase 9 — group Notification Port (envelope → display).
 */
import {
  assertEnvelopeViewer,
  parseMessengerNotificationEnvelope,
  type GroupDisplayContext,
} from "@/lib/messenger/contracts/domain-notification-envelope-phase9";
import { assertSoundKeyMatchesEnvelope } from "@/lib/messenger/contracts/domain-sound-key-phase9";
import { resolveGroupNotificationDisplay } from "@/lib/messenger/group/notification-sound";
import { GROUP_DOMAIN } from "@/lib/messenger/group/types";

export type GroupResolvedNotification = Readonly<{
  domain: typeof GROUP_DOMAIN;
  title: string;
  avatarUrl: string | null;
  senderName: string | null;
  preview: string;
  eventId: string;
  soundKey: string;
  setsOsBadge: false;
}>;

export function applyGroupNotificationEnvelope(
  raw: unknown,
  opts: { viewerUserId: string }
): GroupResolvedNotification {
  const envelope = parseMessengerNotificationEnvelope(raw);
  if (envelope.chatDomain !== GROUP_DOMAIN) {
    throw new Error(`dibay_group_notification_rejects:${envelope.chatDomain}`);
  }
  assertEnvelopeViewer(envelope, opts.viewerUserId);
  assertSoundKeyMatchesEnvelope(GROUP_DOMAIN, envelope.soundKey);
  const ctx = envelope.displayContext as GroupDisplayContext;
  const display = resolveGroupNotificationDisplay({
    chatDomain: envelope.chatDomain,
    domainIdentityKey: envelope.domainIdentityKey,
    roomId: envelope.roomId,
    eventId: envelope.eventId,
    groupName: ctx.groupName,
    groupImageUrl: ctx.groupImageUrl,
    senderName: ctx.senderName,
    messagePreview: ctx.messagePreview,
  });
  return {
    domain: GROUP_DOMAIN,
    title: display.groupName,
    avatarUrl: display.avatarUrl,
    senderName: display.senderName,
    preview: display.preview,
    eventId: envelope.eventId,
    soundKey: envelope.soundKey,
    setsOsBadge: false,
  };
}

export class GroupNotificationCacheHarness {
  private readonly byEventId = new Map<string, GroupResolvedNotification>();

  apply(raw: unknown, viewerUserId: string): { applied: boolean; size: number } {
    const resolved = applyGroupNotificationEnvelope(raw, { viewerUserId });
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
