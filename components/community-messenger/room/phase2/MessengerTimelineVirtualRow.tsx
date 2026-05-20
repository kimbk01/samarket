"use client";

import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  memo,
  type MutableRefObject,
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
import { isStoreOrderSummarySystemContent } from "@/lib/store-order-chat/collapse-duplicate-order-summaries";
import { MessengerStoreOrderSummaryCard } from "@/components/community-messenger/room/phase2/MessengerStoreOrderSummaryCard";

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
  measureElement: (el: HTMLElement | null) => void;
  rowPaddingTopClass: string;
  showPeerName: boolean;
  showPeerAvatar: boolean;
  showBubbleTail: boolean;
  showMessageTime: boolean;
  dayDividerLabel: string | null;
  peerAvatar: ReturnType<typeof communityMessengerMemberAvatar> | null;
  streamRoomId: string;
  /** 상대 읽음 표시 — 해당 행에만 변함 → 전 행 memo 깨짐 방지 */
  mineUnreadBadgeVisible: boolean;
  timelineHighlightMessageId: string | null;
  messageActionItemId: string | null;
  callStubSheetItemId: string | null;
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
  setCallStubSheet: MessengerRoomPhase2ViewModel["setCallStubSheet"];
  messageLongPressTimerRef: MutableRefObject<number | null>;
  messageLongPressItemRef: MutableRefObject<(import("@/lib/community-messenger/types").CommunityMessengerMessage & {
    pending?: boolean;
  }) | null>;
  focusTimelineMessage: (messageId: string) => void | Promise<void>;
  openCallStubOutgoingConfirm: (kind: "voice" | "video") => void;
  tt: MessengerRoomPhase2ViewModel["tt"];
};

function messengerTimelineVirtualRowPropsAreEqual(
  a: MessengerTimelineVirtualRowProps,
  b: MessengerTimelineVirtualRowProps
): boolean {
  return (
    a.item === b.item &&
    a.virtualStart === b.virtualStart &&
    a.virtualIndex === b.virtualIndex &&
    a.measureElement === b.measureElement &&
    a.rowPaddingTopClass === b.rowPaddingTopClass &&
    a.showPeerName === b.showPeerName &&
    a.showPeerAvatar === b.showPeerAvatar &&
    a.showBubbleTail === b.showBubbleTail &&
    a.showMessageTime === b.showMessageTime &&
    a.dayDividerLabel === b.dayDividerLabel &&
    a.peerAvatar === b.peerAvatar &&
    a.streamRoomId === b.streamRoomId &&
    a.mineUnreadBadgeVisible === b.mineUnreadBadgeVisible &&
    a.timelineHighlightMessageId === b.timelineHighlightMessageId &&
    a.messageActionItemId === b.messageActionItemId &&
    a.callStubSheetItemId === b.callStubSheetItemId &&
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
    a.setCallStubSheet === b.setCallStubSheet &&
    a.messageLongPressTimerRef === b.messageLongPressTimerRef &&
    a.messageLongPressItemRef === b.messageLongPressItemRef &&
    a.focusTimelineMessage === b.focusTimelineMessage &&
    a.openCallStubOutgoingConfirm === b.openCallStubOutgoingConfirm &&
    a.tt === b.tt
  );
}

/** 단일 타임라인 메시지 행 — 가상 스크롤에서만 마운트되며 `React.memo` 로 불필요 갱신을 줄인다. */
export const MessengerTimelineVirtualRow = memo(function MessengerTimelineVirtualRow({
  item,
  virtualStart,
  virtualIndex,
  measureElement,
  rowPaddingTopClass,
  showPeerName,
  showPeerAvatar,
  showBubbleTail,
  showMessageTime,
  dayDividerLabel,
  peerAvatar,
  streamRoomId,
  mineUnreadBadgeVisible,
  timelineHighlightMessageId,
  messageActionItemId,
  callStubSheetItemId,
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
  setCallStubSheet,
  messageLongPressTimerRef,
  messageLongPressItemRef,
  focusTimelineMessage,
  openCallStubOutgoingConfirm,
  tt,
}: MessengerTimelineVirtualRowProps) {
  if (cmRenderAnalysisEnabled()) {
    bumpMessengerTimelineBubbleRender();
    if (showPeerAvatar && peerAvatar) {
      bumpMessengerTimelineAvatarRender();
    }
  }

  const bindMessageInteraction =
    item.messageType === "system"
      ? {}
      : item.messageType === "call_stub"
        ? {
            onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
              messageLongPressItemRef.current = item;
              const el = e.currentTarget;
              messageLongPressTimerRef.current = window.setTimeout(() => {
                messageLongPressTimerRef.current = null;
                setCallStubSheet({
                  item,
                  anchorRect: messengerMessageAnchorRectFromDomRect(el.getBoundingClientRect()),
                });
              }, 520);
            },
            onPointerUp: () => {
              if (messageLongPressTimerRef.current) {
                clearTimeout(messageLongPressTimerRef.current);
                messageLongPressTimerRef.current = null;
              }
              messageLongPressItemRef.current = null;
            },
            onPointerCancel: () => {
              if (messageLongPressTimerRef.current) {
                clearTimeout(messageLongPressTimerRef.current);
                messageLongPressTimerRef.current = null;
              }
              messageLongPressItemRef.current = null;
            },
            onContextMenu: (e: ReactMouseEvent<HTMLDivElement>) => {
              e.preventDefault();
              setCallStubSheet({
                item,
                anchorRect: messengerMessageAnchorRectFromDomRect(e.currentTarget.getBoundingClientRect()),
              });
            },
          }
        : {
            onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
              messageLongPressItemRef.current = item;
              const el = e.currentTarget;
              messageLongPressTimerRef.current = window.setTimeout(() => {
                messageLongPressTimerRef.current = null;
                setMessageActionItem({
                  item,
                  anchorRect: messengerMessageAnchorRectFromDomRect(el.getBoundingClientRect()),
                });
              }, 520);
            },
            onPointerUp: () => {
              if (messageLongPressTimerRef.current) {
                clearTimeout(messageLongPressTimerRef.current);
                messageLongPressTimerRef.current = null;
              }
              messageLongPressItemRef.current = null;
            },
            onPointerCancel: () => {
              if (messageLongPressTimerRef.current) {
                clearTimeout(messageLongPressTimerRef.current);
                messageLongPressTimerRef.current = null;
              }
              messageLongPressItemRef.current = null;
            },
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
    (Boolean(messageActionItemId) && messageActionItemId === item.id) ||
    (Boolean(callStubSheetItemId) && callStubSheetItemId === item.id);

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
      className={`inline-flex max-w-full flex-col ${item.isMine ? "items-end" : "items-start"} ${
        longPressMenuOpenOnBubble ? "rounded-[14px] ring-2 ring-[color:var(--cm-room-primary)] ring-offset-2 ring-offset-[color:var(--cm-room-bg)]" : ""
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
        onOpenOutgoingConfirm={openCallStubOutgoingConfirm}
        voiceCallLabel={voiceCallLabel}
        videoCallLabel={videoCallLabel}
        callStatusLabel={callStatusLabel}
      />
    ) : (
      <TimelineViberInnerTextDefault item={item} linkPreviewEnabled={linkPreviewEnabled} sendingLabel={sendingLabel} />
    );

  const viberBubble = (
    <ViberChatBubble isMine={item.isMine} showTail={showBubbleTail}>
      <div className="flex min-w-0 max-w-full flex-col">
        {renderReplyQuoteInsideBubble()}
        {item.messageType === "image" || item.messageType === "sticker" ? (
          viberInnerBody
        ) : (
          <div className={replyQuote ? "px-3 pb-2 pt-1.5" : "px-[12px] py-2"}>{viberInnerBody}</div>
        )}
      </div>
    </ViberChatBubble>
  );

  return (
    <div
      data-index={virtualIndex}
      ref={measureElement}
      data-cm-timeline-message-row=""
      id={`cm-room-msg-${item.id}`}
      className={`absolute left-0 top-0 flex w-full flex-col scroll-mt-24 ${rowPaddingTopClass} pb-1 ${
        item.messageType === "system" ? "items-center" : ""
      } ${
        timelineHighlightMessageId === item.id
          ? "relative z-[2] rounded-[16px] outline outline-2 -outline-offset-[3px] outline-[color:var(--cm-room-primary)]"
          : ""
      }`}
      style={{
        transform: `translateY(${virtualStart}px)`,
      }}
    >
      {dayDividerLabel ? (
        <div className="flex w-full justify-center pb-2 pt-0.5">
          <span className="rounded-full bg-[#e4e6eb] px-2.5 py-1 text-center text-[12px] leading-tight text-[#65676b]">
            {dayDividerLabel}
          </span>
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
        />
      ) : item.messageType === "system" ? (
        <div className="max-w-[min(100%,22rem)] px-2">
          <div className={systemBubbleClass}>
            <p className="text-center sam-text-helper leading-5">{item.content}</p>
          </div>
        </div>
      ) : (
        <div
          className={`flex w-full min-w-0 max-w-full gap-2 ${item.isMine ? "items-end justify-end" : "items-start justify-start"}`}
        >
          {!item.isMine ? (
            <div className="relative z-[1] w-[34px] shrink-0 pt-[2px]">
              {showPeerAvatar ? (
                <SamarketThumbnail
                  src={peerAvatar?.avatarUrl}
                  size={30}
                  roundedClassName="rounded-full"
                  className="border border-sam-fg/10 bg-[#dbeafe] shadow-sm"
                  fallbackSrc=""
                  fallbackNode={<span className="whitespace-nowrap text-center text-[13px] font-semibold leading-none text-[#1f2937]">{peerAvatar?.initials?.slice(0, 1) ?? "?"}</span>}
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
                    <span className="shrink-0 pb-0.5 text-[11px] tabular-nums leading-none text-[#65676b]">
                      {formatTime(item.createdAt)}
                    </span>
                  ) : null}
                  {mineUnreadBadgeVisible ? (
                    <span className="shrink-0 pb-0.5 text-[11px] leading-none text-[#65676b]">{tt("cm_ui_unread")}</span>
                  ) : null}
                  {renderBubbleStack(viberBubble)}
                </>
              ) : (
                <>
                  {renderBubbleStack(viberBubble)}
                  {showMessageTime ? (
                    <span className="shrink-0 pb-0.5 text-[11px] tabular-nums leading-none text-[#65676b]">
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
}: {
  content: string;
  lineKind: string;
  statusLabel: string;
}) {
  const tone =
    lineKind === "warning"
      ? {
          wrap: "border-amber-200 bg-amber-50 text-amber-950",
          badge: "bg-amber-100 text-amber-800",
          label: "주의",
        }
      : lineKind === "delivery"
        ? {
            wrap: "border-[#BDE7F4] bg-[#EAF6FB] text-[#123B4A]",
            badge: "bg-[#1C8DB8] text-white",
            label: opsStatusLabel(statusLabel),
          }
        : {
            wrap: "border-[#DDE5E0] bg-white text-[#123B4A]",
            badge: "bg-[#EAF6FB] text-[#1C8DB8]",
            label: opsStatusLabel(statusLabel),
          };
  return (
    <div className="flex w-full justify-center px-2">
      <div className={`max-w-[min(100%,22rem)] rounded-[4px] border px-3 py-2 text-center shadow-sm ${tone.wrap}`}>
        <span className={`inline-flex rounded-[4px] px-2 py-0.5 text-[11px] font-bold leading-[1.35] ${tone.badge}`}>
          {tone.label}
        </span>
        <p className="mt-1 text-[12px] font-semibold leading-[1.45] [overflow-wrap:anywhere]">{content}</p>
      </div>
    </div>
  );
}

function opsStatusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "신규 주문";
    case "accepted":
      return "주문 접수";
    case "preparing":
      return "조리 시작";
    case "ready_for_pickup":
      return "조리 완료";
    case "delivering":
      return "배달 시작";
    case "arrived":
      return "주소 근처 도착";
    case "completed":
      return "완료";
    default:
      return "주문 진행";
  }
}
