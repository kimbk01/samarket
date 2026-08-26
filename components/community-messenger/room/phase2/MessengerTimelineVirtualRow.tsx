"use client";

import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  memo,
  type MutableRefObject,
  useRef,
  useState,
} from "react";
import {
  communityMessengerMemberAvatar,
  formatTime,
  ViberChatBubble,
} from "@/components/community-messenger/room/community-messenger-room-helpers";
import type { CommunityMessengerMessageActionAnchorRect } from "@/lib/community-messenger/types";
import {
  formatReplyQuoteForMessage,
  formatReplyQuoteKakaoHeader,
} from "@/lib/community-messenger/message-actions/message-reply-policy";
import type { MessengerRoomPhase2ViewModel } from "@/lib/community-messenger/room/phase2/messenger-room-phase2-view-model";
import {
  bumpMessengerTimelineAvatarRender,
  bumpMessengerTimelineBubbleRender,
  cmRenderAnalysisEnabled,
} from "@/lib/community-messenger/monitoring/cm-render-analysis";
import {
  TimelineViberInnerCallStub,
  TimelineViberInnerFile,
  TimelineViberInnerImage,
  TimelineViberInnerSticker,
  TimelineViberInnerTextDefault,
  TimelineViberInnerVoice,
  type TimelineViberBubbleMessage,
} from "@/components/community-messenger/room/phase2/MessengerTimelineBubbleInners";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { SamarketDefaultAvatarFace } from "@/components/profile/SamarketDefaultAvatarFace";
import { resolveUserAvatarImageSrc } from "@/lib/profile/user-avatar-display";
import { isStoreOrderSummarySystemContent } from "@/lib/store-order-chat/collapse-duplicate-order-summaries";
import { MessengerStoreOrderSummaryCard } from "@/components/community-messenger/room/phase2/MessengerStoreOrderSummaryCard";
import {
  CommunityPostShareMessageCard,
  parseCommunityPostShareMetadata,
} from "@/components/community-messenger/room/phase2/CommunityPostShareMessageCard";
import { MessengerGiftCertificateCard } from "@/components/community-messenger/MessengerGiftCertificateCard";
import {
  resolveStoreOrderOpsBodyText,
  resolveStoreOrderOpsTitleText,
} from "@/lib/store-order-chat/store-order-ops-i18n";
import type { MessageKey } from "@/lib/i18n/messages";

function bumpCmR9Counter(roomId: string, key: "avatarRenderCount" | "mediaDeferCount" | "linkPreviewDeferCount"): void {
  if (typeof window === "undefined") return;
  const id = roomId.trim();
  if (!id) return;
  const bag = (window as Window & { __cmR9UpgradeStateByRoom?: Record<string, Record<string, unknown>> })
    .__cmR9UpgradeStateByRoom;
  const st = bag?.[id];
  if (!st || !st.active) return;
  const current = Number(st[key] ?? 0);
  st[key] = current + 1;
}

function messengerMessageAnchorRectFromDomRect(r: DOMRectReadOnly): CommunityMessengerMessageActionAnchorRect {
  return {
    top: r.top,
    left: r.left,
    right: r.right,
    bottom: r.bottom,
    width: r.width,
    height: r.height,
  };
}

export type MessengerTimelineVirtualRowProps = {
  item: TimelineViberBubbleMessage;
  virtualStart: number;
  virtualIndex: number;
  /** virtualizer 미부착·주문 슬라이드 등 — absolute/translate 없이 normal flow */
  directLayout?: boolean;
  /** 진입 tail slice — link preview 등 무거운 부착은 첫 paint 이후 */
  entryLightRow?: boolean;
  measureElement: (el: HTMLElement | null) => void;
  rowPaddingTopClass: string;
  showPeerName: boolean;
  showPeerAvatar: boolean;
  showBubbleTail: boolean;
  showMessageTime: boolean;
  dayDividerLabel: string | null;
  unreadDividerLabel?: string | null;
  peerAvatar: ReturnType<typeof communityMessengerMemberAvatar> | null;
  streamRoomId: string;
  /** 상대 읽음 표시 — 해당 행에만 변함 → 전 행 memo 깨짐 방지 */
  mineUnreadBadgeVisible: boolean;
  /** private_group — tail read count label e.g. "읽음 3" */
  groupReadReceiptLabel?: string;
  /** private_group — highlight @mentions in text bubbles */
  highlightMentions?: boolean;
  timelineHighlightMessageId: string | null;
  messageActionItemId: string | null;
  linkPreviewEnabled: boolean;
  mediaAutoSaveEnabled: boolean;
  sendingLabel: string;
  voiceCallLabel: string;
  videoCallLabel: string;
  callStatusLabel: string;
  stubBusy: boolean;
  senderLabelDisplay: string;
  onOpenImageLightbox: (urls: string[], originals: string[], index: number) => void;
  onReactionRosterOpen: (payload: {
    messageId: string;
    reactionKey: string;
    anchor: CommunityMessengerMessageActionAnchorRect;
  }) => void;
  setMessageActionItem: MessengerRoomPhase2ViewModel["setMessageActionItem"];
  onCallStubRedial: (kind: "voice" | "video") => void;
  messageLongPressTimerRef: MutableRefObject<number | null>;
  messageLongPressItemRef: MutableRefObject<(import("@/lib/community-messenger/types").CommunityMessengerMessage & {
    pending?: boolean;
  }) | null>;
  focusTimelineMessage: (messageId: string) => void | Promise<void>;
  tt: MessengerRoomPhase2ViewModel["tt"];
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
};

function messengerTimelineVirtualRowPropsAreEqual(
  a: MessengerTimelineVirtualRowProps,
  b: MessengerTimelineVirtualRowProps
): boolean {
  return (
    a.item === b.item &&
    a.virtualStart === b.virtualStart &&
    a.virtualIndex === b.virtualIndex &&
    a.directLayout === b.directLayout &&
    a.entryLightRow === b.entryLightRow &&
    a.measureElement === b.measureElement &&
    a.rowPaddingTopClass === b.rowPaddingTopClass &&
    a.showPeerName === b.showPeerName &&
    a.showPeerAvatar === b.showPeerAvatar &&
    a.showBubbleTail === b.showBubbleTail &&
    a.showMessageTime === b.showMessageTime &&
    a.dayDividerLabel === b.dayDividerLabel &&
    a.unreadDividerLabel === b.unreadDividerLabel &&
    a.peerAvatar === b.peerAvatar &&
    a.streamRoomId === b.streamRoomId &&
    a.mineUnreadBadgeVisible === b.mineUnreadBadgeVisible &&
    a.groupReadReceiptLabel === b.groupReadReceiptLabel &&
    a.highlightMentions === b.highlightMentions &&
    a.timelineHighlightMessageId === b.timelineHighlightMessageId &&
    a.messageActionItemId === b.messageActionItemId &&
    a.linkPreviewEnabled === b.linkPreviewEnabled &&
    a.mediaAutoSaveEnabled === b.mediaAutoSaveEnabled &&
    a.sendingLabel === b.sendingLabel &&
    a.voiceCallLabel === b.voiceCallLabel &&
    a.videoCallLabel === b.videoCallLabel &&
    a.callStatusLabel === b.callStatusLabel &&
    a.stubBusy === b.stubBusy &&
    a.senderLabelDisplay === b.senderLabelDisplay &&
    a.onOpenImageLightbox === b.onOpenImageLightbox &&
    a.onReactionRosterOpen === b.onReactionRosterOpen &&
    a.setMessageActionItem === b.setMessageActionItem &&
    a.onCallStubRedial === b.onCallStubRedial &&
    a.messageLongPressTimerRef === b.messageLongPressTimerRef &&
    a.messageLongPressItemRef === b.messageLongPressItemRef &&
    a.focusTimelineMessage === b.focusTimelineMessage &&
    a.tt === b.tt &&
    a.t === b.t
  );
}

/** 단일 타임라인 메시지 행 — 가상 스크롤에서만 마운트되며 `React.memo` 로 불필요 갱신을 줄인다. */
export const MessengerTimelineVirtualRow = memo(function MessengerTimelineVirtualRow({
  item,
  virtualStart,
  virtualIndex,
  directLayout = false,
  entryLightRow = false,
  measureElement,
  rowPaddingTopClass,
  showPeerName,
  showPeerAvatar,
  showBubbleTail,
  showMessageTime,
  dayDividerLabel,
  unreadDividerLabel = null,
  peerAvatar,
  streamRoomId,
  mineUnreadBadgeVisible,
  groupReadReceiptLabel,
  highlightMentions = false,
  timelineHighlightMessageId,
  messageActionItemId,
  linkPreviewEnabled,
  mediaAutoSaveEnabled,
  sendingLabel,
  voiceCallLabel,
  videoCallLabel,
  callStatusLabel,
  stubBusy,
  senderLabelDisplay,
  onOpenImageLightbox,
  onReactionRosterOpen,
  setMessageActionItem,
  onCallStubRedial,
  messageLongPressTimerRef,
  messageLongPressItemRef,
  focusTimelineMessage,
  tt,
  t,
}: MessengerTimelineVirtualRowProps) {
  if (entryLightRow && item.messageType === "text") {
    bumpCmR9Counter(streamRoomId, "linkPreviewDeferCount");
  }
  if (entryLightRow && (item.messageType === "image" || item.messageType === "file")) {
    bumpCmR9Counter(streamRoomId, "mediaDeferCount");
  }
  if (entryLightRow && showPeerAvatar && peerAvatar) {
    bumpCmR9Counter(streamRoomId, "avatarRenderCount");
  }
  const renderPeerAvatar = showPeerAvatar && !entryLightRow;
  if (cmRenderAnalysisEnabled()) {
    bumpMessengerTimelineBubbleRender();
    if (renderPeerAvatar && peerAvatar) {
      bumpMessengerTimelineAvatarRender();
    }
  }
  if (renderPeerAvatar && peerAvatar) {
    bumpCmR9Counter(streamRoomId, "avatarRenderCount");
  }

  // DO NOT: bindMessageInteraction 에서 onPointerMove 취소 로직·touch-action 제거 금지.
  // 모바일 WebView 에서 스크롤 제스처가 pointercancel 을 즉시 발생시켜 520ms 타이머가 항상 취소된다.
  // touch-action:none 으로 브라우저 스크롤을 말풍선에서 막고, 이동 거리(8px) 초과 시 직접 취소한다.
  const longPressOriginRef = useRef<{ x: number; y: number } | null>(null);
  const [longPressHolding, setLongPressHolding] = useState(false);
  const cancelLongPress = () => {
    if (messageLongPressTimerRef.current) {
      clearTimeout(messageLongPressTimerRef.current);
      messageLongPressTimerRef.current = null;
    }
    messageLongPressItemRef.current = null;
    longPressOriginRef.current = null;
    setLongPressHolding(false);
  };

  const messageBubbleTouchStyle: CSSProperties = {
    touchAction: "none",
    WebkitTouchCallout: "none",
    userSelect: "none",
  };

  const bindMessageInteraction =
    item.messageType === "system"
      ? {}
      : item.messageType === "call_stub"
        ? {
            style: messageBubbleTouchStyle,
            onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
              if (!e.isPrimary) return;
              messageLongPressItemRef.current = item;
              longPressOriginRef.current = { x: e.clientX, y: e.clientY };
              setLongPressHolding(true);
              // setPointerCapture: 탭 판정용 pointerup/move 보장. DO NOT: 제거 시 pointercancel 로 탭 유실.
              try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
              const el = e.currentTarget;
              messageLongPressTimerRef.current = window.setTimeout(() => {
                messageLongPressTimerRef.current = null;
                longPressOriginRef.current = null;
                setLongPressHolding(false);
                setMessageActionItem({
                  item,
                  anchorRect: messengerMessageAnchorRectFromDomRect(el.getBoundingClientRect()),
                });
              }, 520);
            },
            onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
              if (!longPressOriginRef.current) return;
              const dx = e.clientX - longPressOriginRef.current.x;
              const dy = e.clientY - longPressOriginRef.current.y;
              if (Math.sqrt(dx * dx + dy * dy) > 8) {
                cancelLongPress();
              }
            },
            onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => {
              const origin = longPressOriginRef.current;
              const tapReady = messageLongPressTimerRef.current != null;
              cancelLongPress();
              if (!origin || !tapReady || stubBusy) return;
              // pointerup으로 발신 확인을 연 직후 합성 click이 backdrop onCancel을 치는 touch-through 차단.
              // MessageLongPressPopover·CallStubActionPopover backdrop guard 와 동일 이슈 — call_stub만 onPointerUp 경로.
              e.preventDefault();
              onCallStubRedial(item.callKind === "video" ? "video" : "voice");
            },
            onPointerCancel: cancelLongPress,
            onContextMenu: (e: ReactMouseEvent<HTMLDivElement>) => {
              e.preventDefault();
              setMessageActionItem({
                item,
                anchorRect: messengerMessageAnchorRectFromDomRect(e.currentTarget.getBoundingClientRect()),
              });
            },
          }
        : {
            style: messageBubbleTouchStyle,
            onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
              if (!e.isPrimary) return;
              messageLongPressItemRef.current = item;
              longPressOriginRef.current = { x: e.clientX, y: e.clientY };
              setLongPressHolding(true);
              // setPointerCapture: 손가락이 요소 밖으로 나가도 pointermove/up 이벤트 보장.
              // DO NOT: 제거 시 살짝 이동하면 pointercancel → 타이머 취소.
              try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
              const el = e.currentTarget;
              messageLongPressTimerRef.current = window.setTimeout(() => {
                messageLongPressTimerRef.current = null;
                longPressOriginRef.current = null;
                setLongPressHolding(false);
                setMessageActionItem({
                  item,
                  anchorRect: messengerMessageAnchorRectFromDomRect(el.getBoundingClientRect()),
                });
              }, 520);
            },
            onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
              if (!longPressOriginRef.current) return;
              const dx = e.clientX - longPressOriginRef.current.x;
              const dy = e.clientY - longPressOriginRef.current.y;
              if (Math.sqrt(dx * dx + dy * dy) > 8) cancelLongPress();
            },
            onPointerUp: cancelLongPress,
            onPointerCancel: cancelLongPress,
            onContextMenu: (e: ReactMouseEvent<HTMLDivElement>) => {
              e.preventDefault();
              setMessageActionItem({
                item,
                anchorRect: messengerMessageAnchorRectFromDomRect(e.currentTarget.getBoundingClientRect()),
              });
            },
          };

  const replyQuote =
    item.messageType !== "system" && item.messageType !== "call_stub" ? formatReplyQuoteForMessage(item) : null;

  const longPressMenuOpenOnBubble =
    Boolean(messageActionItemId) && messageActionItemId === item.id;

  const longPressVisualActive = longPressHolding || longPressMenuOpenOnBubble;

  const renderReplyQuoteInsideBubble = () => {
    if (!replyQuote) return null;
    const mine = item.isMine;
    return (
      <button
        type="button"
        className={`w-full min-w-0 max-w-full shrink-0 border-b text-left transition active:opacity-90 ${
          mine
            ? "border-white/25 bg-white/15 px-3 py-1.5"
            : "border-[color:var(--cm-room-divider)] bg-black/[0.04] px-3 py-1.5"
        }`}
        style={{
          borderTopLeftRadius: "var(--cm-room-radius-bubble)",
          borderTopRightRadius: "var(--cm-room-radius-bubble)",
        }}
        onClick={(e) => {
          e.stopPropagation();
          void focusTimelineMessage(replyQuote.targetMessageId);
        }}
        aria-label={tt("cm_ui_jump_to_original_message", { label: replyQuote.senderLabel })}
      >
        <p
          className={`sam-text-xxs font-bold leading-snug ${mine ? "text-white" : "text-[color:var(--cm-room-primary)]"}`}
        >
          {formatReplyQuoteKakaoHeader(tt(replyQuote.senderLabel))}
        </p>
        <p
          className={`mt-0.5 line-clamp-2 sam-text-xxs leading-snug ${
            mine ? "text-white/85" : "text-[color:var(--cm-room-text-muted)]"
          }`}
        >
          {replyQuote.previewText}
        </p>
      </button>
    );
  };

  const renderBubbleStack = (bubbleChild: ReactNode) => (
    <div
      className={`inline-flex max-w-full flex-col transition-[transform,box-shadow] duration-150 ease-out ${item.isMine ? "items-end" : "items-start"} ${
        longPressVisualActive
          ? "scale-[0.97] rounded-[14px] ring-2 ring-[color:var(--cm-room-primary)] ring-offset-1 ring-offset-[color:var(--cm-room-bg,#f0f2f5)] shadow-[0_10px_28px_rgba(0,0,0,0.16)]"
          : ""
      }`}
      {...bindMessageInteraction}
    >
      {bubbleChild}
      {(() => {
        const hasRx = Boolean(item.reactions && item.reactions.length > 0);
        if (!hasRx) return null;
        return (
          <div
            className={`mt-1 flex max-w-full flex-wrap items-center gap-1.5 ${
              item.isMine ? "justify-end" : "justify-start"
            }`}
          >
            {(item.reactions ?? []).map((r) => (
              <button
                key={`${item.id}:${r.reactionKey}`}
                type="button"
                className={`inline-flex items-center gap-0.5 border-0 bg-transparent px-0.5 py-0 sam-text-xxs font-medium transition active:opacity-75 ${
                  item.isMine ? "text-[color:var(--cm-room-bubble-outgoing-fg,#fff)]" : "text-[color:var(--cm-room-text)]"
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  onReactionRosterOpen({
                    messageId: item.id,
                    reactionKey: r.reactionKey,
                    anchor: messengerMessageAnchorRectFromDomRect(e.currentTarget.getBoundingClientRect()),
                  });
                }}
                aria-label={tt("cm_ui_reaction_view_aria", { key: r.reactionKey, count: r.count })}
              >
                <span className="text-base leading-none">{r.reactionKey}</span>
                {r.count >= 1 ? <span className="tabular-nums opacity-90">{r.count}</span> : null}
              </button>
            ))}
          </div>
        );
      })()}
    </div>
  );

  const systemBubbleClass =
    "rounded-full bg-white px-3 py-1.5 text-center text-[12px] leading-snug text-[#6B7280]";
  const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata : null;
  const isStoreOrderSystem = item.messageType === "system" && metadata?.domain === "store_order";
  const isStoreOrderSummary =
    isStoreOrderSystem &&
    (metadata?.kind === "store_order_summary" || isStoreOrderSummarySystemContent(item.content));
  const storeOrderLineKind = typeof metadata?.lineKind === "string" ? metadata.lineKind : "status";
  const storeOrderStatusLabel =
    typeof metadata?.orderStatus === "string" && metadata.orderStatus.trim()
      ? metadata.orderStatus.trim()
      : "status";

  const communityPostShareCard =
    item.messageType === "community_post_share" ? parseCommunityPostShareMetadata(metadata) : null;

  const viberInnerBody: ReactNode =
    item.messageType === "image" ? (
      <TimelineViberInnerImage item={item} onOpenLightbox={onOpenImageLightbox} />
    ) : item.messageType === "sticker" ? (
      <TimelineViberInnerSticker item={item} />
    ) : item.messageType === "voice" ? (
      <TimelineViberInnerVoice item={item} streamRoomId={streamRoomId} />
    ) : item.messageType === "file" ? (
      <TimelineViberInnerFile item={item} mediaAutoSaveEnabled={mediaAutoSaveEnabled} />
    ) : item.messageType === "call_stub" ? (
      <TimelineViberInnerCallStub
        item={item}
        stubBusy={stubBusy}
        voiceCallLabel={voiceCallLabel}
        videoCallLabel={videoCallLabel}
        callStatusLabel={callStatusLabel}
      />
    ) : item.messageType === "community_post_share" && communityPostShareCard ? (
      <CommunityPostShareMessageCard card={communityPostShareCard} />
    ) : item.messageType === "gift_certificate" ? (
      <MessengerGiftCertificateCard metadata={metadata} isRecipient={!item.isMine} />
    ) : (
      <TimelineViberInnerTextDefault
        item={item}
        linkPreviewEnabled={entryLightRow ? false : linkPreviewEnabled}
        sendingLabel={sendingLabel}
        highlightMentions={highlightMentions}
      />
    );

  const viberBubble = (
    <ViberChatBubble isMine={item.isMine} showTail={showBubbleTail}>
      <div className="flex min-w-0 max-w-full flex-col">
        {renderReplyQuoteInsideBubble()}
        {item.messageType === "image" || item.messageType === "sticker" || item.messageType === "community_post_share" ? (
          viberInnerBody
        ) : (
          <div className={replyQuote ? "px-3 pb-2 pt-1.5" : "px-[12px] py-2"}>{viberInnerBody}</div>
        )}
      </div>
    </ViberChatBubble>
  );

  const callStubTimeLabel = showMessageTime ? (
    <span
      data-cm-call-occurrence-time=""
      className="shrink-0 grow-0 basis-auto whitespace-nowrap pb-0.5 text-[11px] tabular-nums leading-none text-[#65676b]"
    >
      {formatTime(item.createdAt)}
    </span>
  ) : null;

  const callStubBubble = (
    <div
      role="button"
      aria-label={item.content.trim() || `${item.callKind === "video" ? videoCallLabel : voiceCallLabel} · ${callStatusLabel}`}
      aria-disabled={stubBusy || undefined}
      className={`inline-flex min-w-0 max-w-full transition-[transform,box-shadow] duration-150 ease-out ${
        longPressVisualActive
          ? "scale-[0.97] rounded-[18px] ring-2 ring-[color:var(--cm-room-primary)] ring-offset-1 ring-offset-[color:var(--cm-room-bg,#f0f2f5)] shadow-[0_10px_28px_rgba(0,0,0,0.16)]"
          : ""
      }`}
      {...bindMessageInteraction}
    >
      {viberInnerBody}
    </div>
  );

  const callStubEventRow = (
    <div className={`flex w-full min-w-0 px-2 ${item.isMine ? "justify-end" : "justify-start"}`}>
      <div className="flex min-w-0 max-w-full items-end gap-1.5">
        {item.isMine ? (
          <>
            {callStubTimeLabel}
            {callStubBubble}
          </>
        ) : (
          <>
            {callStubBubble}
            {callStubTimeLabel}
          </>
        )}
      </div>
    </div>
  );

  return (
    <div
      data-index={virtualIndex}
      ref={measureElement}
      data-cm-timeline-message-row=""
      data-cm-message-id={String(item.id ?? "")}
      id={`cm-room-msg-${item.id}`}
      className={`${directLayout ? "relative" : "absolute left-0 top-0"} flex w-full flex-col scroll-mt-24 ${rowPaddingTopClass} pb-1 ${
        item.messageType === "system" ? "items-center" : ""
      } ${
        timelineHighlightMessageId === item.id
          ? "relative z-[2] rounded-[16px] outline outline-2 -outline-offset-[3px] outline-[color:var(--cm-room-primary)]"
          : ""
      }`}
      style={directLayout ? undefined : { transform: `translateY(${virtualStart}px)` }}
    >
      {dayDividerLabel ? (
        <div className="flex w-full justify-center pb-2 pt-0.5">
          <span className="rounded-full bg-[#e4e6eb] px-2.5 py-1 text-center text-[12px] leading-tight text-[#65676b]">
            {dayDividerLabel}
          </span>
        </div>
      ) : null}
      {unreadDividerLabel ? (
        <div
          data-cm-unread-divider="1"
          className="flex w-full items-center gap-2 px-1 pb-2 pt-1"
          role="separator"
          aria-label={unreadDividerLabel}
        >
          <div className="h-px flex-1 bg-[color:var(--cm-room-primary,#2AABEE)]/35" />
          <span className="shrink-0 text-[12px] font-medium leading-none text-[color:var(--cm-room-primary,#2AABEE)]">
            {unreadDividerLabel}
          </span>
          <div className="h-px flex-1 bg-[color:var(--cm-room-primary,#2AABEE)]/35" />
        </div>
      ) : null}
      {isStoreOrderSummary ? (
        <div className="flex w-full justify-center px-2">
          <MessengerStoreOrderSummaryCard
            content={item.content}
            timeline={Array.isArray(metadata?.timeline) ? (metadata.timeline as any) : null}
            metadata={metadata}
          />
        </div>
      ) : isStoreOrderSystem ? (
        <StoreOrderOpsSystemRow
          content={item.content}
          lineKind={storeOrderLineKind}
          statusLabel={storeOrderStatusLabel}
          metadata={metadata}
          t={t}
        />
      ) : item.messageType === "system" ? (
        <div className="max-w-[min(100%,22rem)] px-2">
          <div className={systemBubbleClass}>
            <p className="text-center sam-text-helper leading-5">{item.content}</p>
          </div>
        </div>
      ) : item.messageType === "call_stub" ? (
        callStubEventRow
      ) : (
        <div
          className={`flex w-full min-w-0 max-w-full gap-2 ${item.isMine ? "items-end justify-end" : "items-start justify-start"}`}
        >
          {!item.isMine ? (
            <div className="relative z-[1] w-[34px] shrink-0 pt-[2px]">
              {renderPeerAvatar ? (
                <SamarketThumbnail
                  src={resolveUserAvatarImageSrc(peerAvatar?.avatarUrl)}
                  size={30}
                  roundedClassName="rounded-full"
                  className="border border-sam-fg/10 bg-[#dbeafe] shadow-sm"
                  fallbackSrc=""
                  fallbackNode={<SamarketDefaultAvatarFace className="h-full w-full" />}
                />
              ) : (
                <div className="h-[30px] w-[34px]" aria-hidden />
              )}
            </div>
          ) : null}

          <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${item.isMine ? "items-end" : "items-start"}`}>
            {!item.isMine && showPeerName ? (
              <p className="mb-[3px] max-w-full pl-0.5 text-[12px] font-medium leading-snug text-[#4b5563]">
                {senderLabelDisplay}
              </p>
            ) : null}

            <div
              className={`flex w-full min-w-0 max-w-[min(76vw,520px)] shrink-0 items-end gap-1.5 ${
                item.isMine ? "flex-row justify-end" : "flex-row justify-start"
              }`}
            >
              {item.isMine ? (
                <>
                  {showMessageTime ? (
                    <span className="shrink-0 grow-0 basis-auto whitespace-nowrap pb-0.5 text-[11px] tabular-nums leading-none text-[#65676b]">
                      {formatTime(item.createdAt)}
                    </span>
                  ) : null}
                  {mineUnreadBadgeVisible ? (
                    <span className="shrink-0 pb-0.5 text-[11px] leading-none text-[#65676b]">{t("cm_ui_unread")}</span>
                  ) : groupReadReceiptLabel ? (
                    <span className="shrink-0 pb-0.5 text-[11px] leading-none text-[#65676b]">
                      {groupReadReceiptLabel}
                    </span>
                  ) : null}
                  {renderBubbleStack(viberBubble)}
                </>
              ) : (
                <>
                  {renderBubbleStack(viberBubble)}
                  {showMessageTime ? (
                    <span className="shrink-0 grow-0 basis-auto whitespace-nowrap pb-0.5 text-[11px] tabular-nums leading-none text-[#65676b]">
                      {formatTime(item.createdAt)}
                    </span>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}, messengerTimelineVirtualRowPropsAreEqual);

function StoreOrderOpsSystemRow({
  content,
  lineKind,
  statusLabel,
  metadata,
  t,
}: {
  content: string;
  lineKind: string;
  statusLabel: string;
  metadata: Record<string, unknown> | null;
  t: MessengerTimelineVirtualRowProps["t"];
}) {
  const body = resolveStoreOrderOpsBodyText({
    orderStatus: statusLabel,
    lineKind,
    content,
    metadata,
    t,
  });
  const title = resolveStoreOrderOpsTitleText({
    orderStatus: statusLabel,
    lineKind,
    t,
  });
  const titleClass =
    lineKind === "warning"
      ? "font-semibold text-amber-800"
      : lineKind === "delivery"
        ? "font-semibold text-[color:var(--delivery-primary)]"
        : "font-semibold text-[color:var(--delivery-dark)]";
  return (
    <div className="delivery-ui flex w-full justify-center px-4 py-0.5">
      <p className="max-w-[min(100%,20rem)] text-center text-[12px] leading-[1.5] text-[color:var(--delivery-text-muted)] [overflow-wrap:anywhere]">
        <span className={titleClass}>{title}</span>
        <span className="text-[color:var(--delivery-mocha)]"> · </span>
        <span className="text-[color:var(--delivery-dark)]">{body}</span>
      </p>
    </div>
  );
}
