/**
 * Phase 9 — trade Notification Port (envelope → display).
 * 상품·거래 Context 가 title/image. preview 는 실제 메시지만.
 */
import {
  assertEnvelopeViewer,
  parseMessengerNotificationEnvelope,
  type TradeDisplayContext,
} from "@/lib/messenger/contracts/domain-notification-envelope-phase9";
import { assertSoundKeyMatchesEnvelope } from "@/lib/messenger/contracts/domain-sound-key-phase9";
import { resolveTradeNotificationDisplay } from "@/lib/messenger/trade/notification-sound";
import { TRADE_DOMAIN } from "@/lib/messenger/trade/types";

export type TradeResolvedNotification = Readonly<{
  domain: typeof TRADE_DOMAIN;
  title: string;
  peerLabel: string;
  avatarUrl: string | null;
  preview: string;
  eventId: string;
  soundKey: string;
  setsOsBadge: false;
}>;

export function applyTradeNotificationEnvelope(
  raw: unknown,
  opts: { viewerUserId: string }
): TradeResolvedNotification {
  const envelope = parseMessengerNotificationEnvelope(raw);
  if (envelope.chatDomain !== TRADE_DOMAIN) {
    throw new Error(`dibay_trade_notification_rejects:${envelope.chatDomain}`);
  }
  assertEnvelopeViewer(envelope, opts.viewerUserId);
  assertSoundKeyMatchesEnvelope(TRADE_DOMAIN, envelope.soundKey);
  const ctx = envelope.displayContext as TradeDisplayContext;
  if (
    (ctx.productSummary?.trim() || ctx.tradeStatusLabel?.trim()) &&
    !ctx.messagePreview.trim()
  ) {
    throw new Error("dibay_trade_notification_preview_must_be_message");
  }
  // summary/status 가 preview 자리에 들어가면 FAIL — messagePreview 만 사용
  const display = resolveTradeNotificationDisplay({
    chatDomain: envelope.chatDomain,
    domainIdentityKey: envelope.domainIdentityKey,
    roomId: envelope.roomId,
    eventId: envelope.eventId,
    productTitle: ctx.productTitle,
    productImageUrl: ctx.productImageUrl,
    peerDisplayName: ctx.peerDisplayName,
    messagePreview: ctx.messagePreview,
  });
  if (
    ctx.productSummary?.trim() &&
    display.preview === ctx.productSummary.trim()
  ) {
    throw new Error("dibay_trade_notification_preview_replaced_by_summary");
  }
  if (
    ctx.tradeStatusLabel?.trim() &&
    display.preview === ctx.tradeStatusLabel.trim()
  ) {
    throw new Error("dibay_trade_notification_preview_replaced_by_status");
  }
  return {
    domain: TRADE_DOMAIN,
    title: display.productTitle,
    peerLabel: display.peerLabel,
    avatarUrl: display.avatarUrl,
    preview: display.preview,
    eventId: envelope.eventId,
    soundKey: envelope.soundKey,
    setsOsBadge: false,
  };
}

export class TradeNotificationCacheHarness {
  private readonly byEventId = new Map<string, TradeResolvedNotification>();

  apply(raw: unknown, viewerUserId: string): { applied: boolean; size: number } {
    const resolved = applyTradeNotificationEnvelope(raw, { viewerUserId });
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
