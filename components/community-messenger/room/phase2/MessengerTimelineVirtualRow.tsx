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
  TimelineViberInnerCallStub,
  TimelineViberInnerFile,
  TimelineViberInnerImage,
  TimelineViberInnerSticker,
  TimelineViberInnerTextDefault,
  TimelineViberInnerVoice,
  type TimelineViberBubbleMessage,
} from "@/components/community-messenger/room/phase2/MessengerTimelineBubbleInners";

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
  showPeerAvatar: boolean;
  showMyAvatar: boolean;
  showBubbleTail: boolean;
  peerAvatar: ReturnType<typeof communityMessengerMemberAvatar> | null;
  myAvatar: ReturnType<typeof communityMessengerMemberAvatar> | null;
  isGroupRoom: boolean;
  streamRoomId: string;
  latestReadableMineMessageId: string | null;
  peerHasReadMyLatestMessage: boolean;
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
    a.showPeerAvatar === b.showPeerAvatar &&
    a.showMyAvatar === b.showMyAvatar &&
    a.showBubbleTail === b.showBubbleTail &&
    a.peerAvatar === b.peerAvatar &&
    a.myAvatar === b.myAvatar &&
    a.isGroupRoom === b.isGroupRoom &&
    a.streamRoomId === b.streamRoomId &&
    a.latestReadableMineMessageId === b.latestReadableMineMessageId &&
    a.peerHasReadMyLatestMessage === b.peerHasReadMyLatestMessage &&
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
  showPeerAvatar,
  showMyAvatar,
  showBubbleTail,
  peerAvatar,
  myAvatar,
  isGroupRoom,
  streamRoomId,
  latestReadableMineMessageId,
  peerHasReadMyLatestMessage,
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
            ? "border-sam-primary-border bg-sam-surface/55 px-3 py-1.5"
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
        aria-label={`원본 메시지로 이동: ${replyQuote.senderLabel}`}
      >
        <p
          className={`sam-text-xxs font-bold leading-snug ${mine ? "text-sam-fg" : "text-[color:var(--cm-room-primary)]"}`}
        >
          {formatReplyQuoteKakaoHeader(tt(replyQuote.senderLabel))}
        </p>
        <p
          className={`mt-0.5 line-clamp-2 sam-text-xxs leading-snug ${
            mine ? "text-sam-muted" : "text-[color:var(--cm-room-text-muted)]"
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
                  item.isMine ? "text-sam-fg" : "text-[color:var(--cm-room-text)]"
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  onReactionRosterOpen({
                    messageId: item.id,
                    reactionKey: r.reactionKey,
                    anchor: messengerMessageAnchorRectFromDomRect(e.currentTarget.getBoundingClientRect()),
                  });
                }}
                aria-label={`${r.reactionKey} 반응 ${r.count}명, 누가 눌렀는지 보기`}
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
    "rounded-[14px] border border-[color:var(--cm-room-divider)]/90 bg-[color:var(--cm-room-primary-soft)] px-3.5 py-1.5 text-center sam-text-xxs leading-snug text-[color:var(--cm-room-text-muted)] shadow-[0_1px_3px_rgba(115,96,242,0.08)]";

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
          <div className={replyQuote ? "px-3 pb-2 pt-1.5" : "px-3 py-2"}>{viberInnerBody}</div>
        )}
      </div>
    </ViberChatBubble>
  );

  return (
    <div
      data-index={virtualIndex}
      ref={measureElement}
      id={`cm-room-msg-${item.id}`}
      className={`absolute left-0 top-0 w-full pb-2.5 flex scroll-mt-24 ${
        item.messageType === "system" ? "justify-center" : item.isMine ? "justify-end" : "justify-start"
      } ${
        timelineHighlightMessageId === item.id
          ? "relative z-[2] rounded-[16px] outline outline-2 -outline-offset-[3px] outline-[color:var(--cm-room-primary)]"
          : ""
      }`}
      style={{
        transform: `translateY(${virtualStart}px)`,
      }}
    >
      {item.messageType === "system" ? (
        <div className="max-w-[92%] px-2">
          <div className={systemBubbleClass}>
            <p className="text-center sam-text-helper leading-5">{item.content}</p>
          </div>
        </div>
      ) : (
        <div
          className={`flex w-full min-w-0 max-w-full items-end gap-3 ${item.isMine ? "justify-end" : "justify-start"}`}
        >
          {!item.isMine ? (
            <div className="relative z-[1] w-9 shrink-0 self-end pb-0.5">
              {showPeerAvatar ? (
                peerAvatar?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={peerAvatar.avatarUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-9 w-9 rounded-full border border-sam-fg/10 object-cover shadow-sm"
                  />
                ) : (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-sam-fg/10 bg-sam-surface text-center sam-text-body font-semibold leading-none text-sam-muted shadow-sm">
                    {peerAvatar?.initials?.slice(0, 1) ?? "?"}
                  </div>
                )
              ) : (
                <div className="h-9 w-9" aria-hidden />
              )}
            </div>
          ) : null}

          <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${item.isMine ? "items-end" : "items-start"}`}>
            {isGroupRoom && !item.isMine && showPeerAvatar ? (
              <p className="mb-0.5 max-w-full pl-0.5 sam-text-helper font-semibold text-[color:var(--cm-room-primary)]">
                {senderLabelDisplay}
              </p>
            ) : null}

            <div
              className={`flex w-full min-w-0 max-w-[min(85vw,70%)] shrink-0 items-end gap-1.5 ${
                item.isMine ? "flex-row justify-end" : "flex-row justify-start"
              }`}
            >
              {item.isMine ? (
                <>
                  <span className="shrink-0 self-end pb-1 sam-text-xxs tabular-nums leading-none text-[color:var(--cm-room-text-muted)]">
                    {formatTime(item.createdAt)}
                  </span>
                  {latestReadableMineMessageId === item.id && !peerHasReadMyLatestMessage ? (
                    <span className="shrink-0 self-end pb-1 sam-text-xxs leading-none text-[color:var(--cm-room-text-muted)]">
                      안읽음
                    </span>
                  ) : null}
                  {renderBubbleStack(viberBubble)}
                </>
              ) : (
                <>
                  {renderBubbleStack(viberBubble)}
                  <span className="shrink-0 self-end pb-1 sam-text-xxs tabular-nums leading-none text-[color:var(--cm-room-text-muted)]">
                    {formatTime(item.createdAt)}
                  </span>
                </>
              )}
            </div>
          </div>

          {item.isMine ? (
            <div className="relative z-[1] w-9 shrink-0 self-end pb-0.5">
              {showMyAvatar ? (
                myAvatar?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={myAvatar.avatarUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-9 w-9 rounded-full border border-sam-fg/10 object-cover shadow-sm"
                  />
                ) : (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-sam-fg/10 bg-sam-surface text-center sam-text-body font-semibold leading-none text-sam-muted shadow-sm">
                    {myAvatar?.initials?.slice(0, 1) ?? "나"}
                  </div>
                )
              ) : (
                <div className="h-9 w-9" aria-hidden />
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}, messengerTimelineVirtualRowPropsAreEqual);
