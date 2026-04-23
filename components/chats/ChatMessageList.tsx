"use client";

import {
  cloneElement,
  isValidElement,
  useLayoutEffect,
  useMemo,
  type LiHTMLAttributes,
  type ReactElement,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { ChatMessage } from "@/lib/types/chat";
import {
  IG_DM_BODY_TEXT,
  IG_DM_BUBBLE_PAD,
  IG_DM_BUBBLE_ROW_MAX,
} from "@/lib/chats/instagram-dm-tokens";

/** 기본(당근형) 말풍선 행 — 본문 컬럼이 넓어질 때 `20rem` 고정 상한 완화 */
const DEFAULT_CHAT_BUBBLE_ROW_MAX =
  "max-w-[min(82vw,20rem)] sm:max-w-[72%] md:max-w-[min(75%,34rem)]";

/** 블록 수가 이 이상이면 스크롤 부모 + virtualize 시 창만 렌더 (그룹 채팅 등) */
const CHAT_MESSAGE_LIST_VIRTUAL_THRESHOLD = 48;

interface ChatMessageListProps {
  messages: ChatMessage[];
  currentUserId: string;
  partnerNickname?: string;
  partnerAvatar?: string;
  /** `instagram`: 수신 회색 말풍선·발신 메신저 블루·날짜 필 형태 */
  variant?: "default" | "instagram";
  /**
   * 스크롤 컨테이너(ref.current 가 overflow-y 스크롤 요소). `virtualize` 와 함께 쓸 것.
   * 긴 스레드에서 블록 단위 가상화로 메인 스레드 비용을 줄인다.
   */
  scrollParentRef?: React.RefObject<HTMLElement | null>;
  /** `scrollParentRef` 가 있을 때만 적용 — instagram variant 는 레이아웃 복잡도로 비활성 권장 */
  virtualize?: boolean;
}

function getDateKey(isoString: string): string {
  return new Date(isoString).toDateString();
}

/** 같은 분(minute) 그룹 키 — 시간 표시 묶음용 */
function getMinuteKey(isoString: string): string {
  const d = new Date(isoString);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${d.getHours()}:${d.getMinutes()}`;
}

/** 날짜 구분선 텍스트: "2026년 3월 19일 목요일" */
function formatDateSeparatorLabel(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

/** 말풍선 옆 시간용 (오후 3:21 스타일) */
function formatBubbleTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** 이모티콘만 있는 메시지인지 (숫자·글자 제외, 실제 이모티콘만 2배 크기 적용) */
function isEmojiOnlyMessage(text: string): boolean {
  const t = (text || "").trim();
  if (t.length === 0 || t.length > 10) return false;
  if (/[a-zA-Z가-힣0-9]/.test(t)) return false;
  const emojiRanges = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F900}-\u{1F9FF}]/u;
  if (!emojiRanges.test(t)) return false;
  return true;
}

type Block =
  | { type: "date"; dateKey: string; label: string }
  | { type: "system"; msg: ChatMessage }
  | { type: "opponent"; messages: ChatMessage[] }
  | { type: "mine"; messages: ChatMessage[] };

function buildBlocks(messages: ChatMessage[], currentUserId: string): Block[] {
  const blocks: Block[] = [];
  let lastDateKey = "";
  let opponentBuf: ChatMessage[] = [];
  let mineBuf: ChatMessage[] = [];

  const flushOpponent = () => {
    if (opponentBuf.length > 0) {
      blocks.push({ type: "opponent", messages: [...opponentBuf] });
      opponentBuf = [];
    }
  };
  const flushMine = () => {
    if (mineBuf.length > 0) {
      blocks.push({ type: "mine", messages: [...mineBuf] });
      mineBuf = [];
    }
  };

  for (const msg of messages) {
    const dateKey = getDateKey(msg.createdAt);
    if (dateKey !== lastDateKey) {
      flushOpponent();
      flushMine();
      lastDateKey = dateKey;
      blocks.push({
        type: "date",
        dateKey,
        label: formatDateSeparatorLabel(msg.createdAt),
      });
    }

    if (msg.messageType === "system") {
      flushOpponent();
      flushMine();
      blocks.push({ type: "system", msg });
      continue;
    }

    const isMine = msg.senderId === currentUserId;
    if (isMine) {
      flushOpponent();
      mineBuf.push(msg);
    } else {
      flushMine();
      opponentBuf.push(msg);
    }
  }
  flushOpponent();
  flushMine();
  return blocks;
}

/** 연속 메시지에서 말풍선 기준 첫/중간/마지막 */
function getBubblePosition(
  messages: ChatMessage[],
  index: number
): "single" | "first" | "middle" | "last" {
  const total = messages.length;
  if (total <= 1) return "single";
  if (index === 0) return "first";
  if (index === total - 1) return "last";
  return "middle";
}

/** 같은 분 그룹에서 마지막 메시지인지 (이 메시지에만 시간 표시) */
function isLastInMinuteGroup(messages: ChatMessage[], index: number): boolean {
  const minuteKey = getMinuteKey(messages[index].createdAt);
  for (let i = index + 1; i < messages.length; i++) {
    if (getMinuteKey(messages[i].createdAt) === minuteKey) return false;
  }
  return true;
}

/** 상대 말풍선 radius 클래스 (`ig`: 사각에 가깝게 10px) */
function getOpponentBubbleRadius(
  pos: "single" | "first" | "middle" | "last",
  ig = false
): string {
  if (ig) return "rounded-ui-rect";
  switch (pos) {
    case "single":
      return "rounded-ui-rect";
    case "first":
      return "rounded-tl-[18px] rounded-tr-[18px] rounded-bl-[6px] rounded-br-[6px]";
    case "middle":
      return "rounded-ui-rect";
    case "last":
      return "rounded-bl-[18px] rounded-br-[18px] rounded-tl-[6px] rounded-tr-[6px]";
  }
}

/** 내 말풍선 radius 클래스 */
function getMineBubbleRadius(pos: "single" | "first" | "middle" | "last", ig = false): string {
  return getOpponentBubbleRadius(pos, ig);
}

export function ChatMessageList({
  messages,
  currentUserId,
  partnerNickname = "",
  partnerAvatar,
  variant = "default",
  scrollParentRef,
  virtualize = false,
}: ChatMessageListProps) {
  const { t } = useI18n();
  const ig = variant === "instagram";
  const uniqueMessages = useMemo(() => {
    const seenIds = new Set<string>();
    return messages.filter((msg) => {
      if (seenIds.has(msg.id)) return false;
      seenIds.add(msg.id);
      return true;
    });
  }, [messages]);
  const blocks = useMemo(() => buildBlocks(uniqueMessages, currentUserId), [uniqueMessages, currentUserId]);

  const listItems = useMemo(() => {
    const items: React.ReactElement[] = [];
    blocks.forEach((block, blockIdx) => {
      const prevBlock = blockIdx > 0 ? blocks[blockIdx - 1] : null;
      const gapFromPrev =
        prevBlock && (prevBlock.type === "opponent" || prevBlock.type === "mine")
          ? ig
            ? "mt-2.5"
            : "mt-3"
          : "";

      if (block.type === "date") {
        items.push(
          <li key={`date-${block.dateKey}`} className={`flex justify-center ${ig ? "py-5" : "py-4"}`}>
            {ig ? (
              <span className="rounded-full bg-black/[0.05] px-3.5 py-1.5 sam-text-helper font-medium leading-none text-muted">
                {block.label}
              </span>
            ) : (
              <span className="sam-text-helper font-medium leading-[16px] text-[#999999]">
                ——— {block.label} ———
              </span>
            )}
          </li>
        );
        return;
      }

      if (block.type === "system") {
        const body = ((block.msg.message || "").trim() || t("common_system_message")).trim();
        if (ig) {
          items.push(
            <li key={block.msg.id} className={`flex justify-start ${gapFromPrev}`}>
              <div className={`flex ${IG_DM_BUBBLE_ROW_MAX} items-end gap-2.5`}>
                <div className="flex shrink-0 flex-col justify-end">
                  <div className="relative h-8 w-8 overflow-hidden rounded-full bg-gradient-to-br from-[#E1306C]/18 to-[#F77737]/18 ring-1 ring-black/[0.06]">
                    {partnerAvatar ? (
                      <img src={partnerAvatar} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center sam-text-body-secondary font-semibold text-foreground">
                        {(partnerNickname || "?").charAt(0)}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div
                    className={`flex min-h-[36px] min-w-[44px] items-start justify-start rounded-ui-rect bg-[#F0F0F0] ${IG_DM_BUBBLE_PAD} shadow-none`}
                    onContextMenu={(e) => e.preventDefault()}
                  >
                    <p className={`w-full whitespace-pre-line break-words text-left ${IG_DM_BODY_TEXT} text-foreground`}>
                      {body}
                    </p>
                  </div>
                  <div className="mt-0.5 flex justify-start">
                    <span className="sam-text-xxs font-normal tabular-nums leading-4 text-muted">
                      {formatBubbleTime(block.msg.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
            </li>
          );
        } else {
          items.push(
            <li key={block.msg.id} className={`flex justify-center px-3 py-1.5 ${gapFromPrev}`}>
              <p className="max-w-[90%] whitespace-pre-line rounded-ui-rect bg-black/10 px-3 py-2 text-center sam-text-helper font-medium leading-[16px] text-[#999999]">
                {body}
              </p>
            </li>
          );
        }
        return;
      }

      if (block.type === "opponent") {
        const msgs = block.messages;
        const opponentBubbleShell = ig ? "bg-[#F0F0F0] shadow-none" : "bg-[#FFFFFF] shadow-sm";
        const opponentText = ig
          ? `${IG_DM_BODY_TEXT} text-left text-foreground`
          : "sam-text-body font-normal leading-[20px] text-[#111111]";
        const bubblePadIg = IG_DM_BUBBLE_PAD;
        items.push(
          <li key={`opponent-${msgs[0].id}`} className={`flex justify-start ${gapFromPrev}`}>
            <div className={`flex ${ig ? IG_DM_BUBBLE_ROW_MAX : DEFAULT_CHAT_BUBBLE_ROW_MAX} items-end ${ig ? "gap-2.5" : "gap-2"}`}>
              <div className="flex shrink-0 flex-col justify-end">
                <div
                  className={`relative overflow-hidden rounded-full ${ig ? "h-8 w-8 bg-gradient-to-br from-[#E1306C]/18 to-[#F77737]/18 ring-1 ring-black/[0.06]" : "h-[34px] w-[34px] bg-sam-surface-muted"}`}
                >
                  {partnerAvatar ? (
                    <img src={partnerAvatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div
                      className={`flex h-full w-full items-center justify-center ${ig ? "sam-text-body-secondary font-semibold text-foreground" : "sam-text-body font-medium text-sam-muted"}`}
                    >
                      {(partnerNickname || "?").charAt(0)}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <p
                  className={`truncate pl-0.5 ${ig ? "mb-1 sam-text-helper font-semibold leading-none text-muted" : "mb-0.5 sam-text-body-secondary font-medium text-[#111111]"}`}
                >
                  {partnerNickname || t("common_partner")}
                </p>
                {msgs.map((msg, i) => {
                  const pos = getBubblePosition(msgs, i);
                  const showTime = isLastInMinuteGroup(msgs, i);
                  const isImage = msg.messageType === "image" || !!msg.imageUrl;
                  const text = (msg.message || "").trim();
                  const hasReply = !!msg.replyTo?.text;
                  const emojiOnly = !isImage && isEmojiOnlyMessage(text);

                  return (
                    <div key={msg.id} className={i === 0 ? "" : ig ? "mt-0.5" : "mt-1"}>
                      {emojiOnly ? (
                        <div
                          className="flex min-h-[44px] min-w-[44px] items-center justify-center bg-transparent py-1"
                          onContextMenu={(e) => e.preventDefault()}
                        >
                          <span className="leading-none" style={{ fontSize: ig ? "32px" : "28px" }}>
                            {text || " "}
                          </span>
                        </div>
                      ) : (
                        <div
                          className={`flex min-h-[36px] min-w-[44px] ${getOpponentBubbleRadius(pos, ig)} ${opponentBubbleShell} ${ig ? bubblePadIg : ""}`}
                          style={ig ? undefined : { padding: "8px 12px" }}
                          onContextMenu={(e) => e.preventDefault()}
                        >
                          {hasReply && (
                            <div
                              className={`mb-1 border-l-2 pl-2 ${ig ? "border-sam-fg/12 text-left sam-text-helper font-normal leading-[1.35] text-muted" : "sam-text-helper border-sam-border text-[#999999]"}`}
                            >
                              {msg.replyTo!.text.slice(0, 50)}
                              {msg.replyTo!.text.length > 50 ? "…" : ""}
                            </div>
                          )}
                          {isImage ? (
                            <div className={`overflow-hidden ${ig ? "rounded-ui-rect" : "rounded-ui-rect"}`}>
                              {msg.imageUrl ? (
                                <img src={msg.imageUrl} alt="" className="max-h-60 w-full object-cover" />
                              ) : null}
                              {text ? (
                                <p className={`mt-1.5 whitespace-pre-wrap break-words ${opponentText}`}>{text}</p>
                              ) : null}
                            </div>
                          ) : (
                            <p className={`whitespace-pre-wrap break-words ${opponentText}`}>{text || " "}</p>
                          )}
                        </div>
                      )}
                      {showTime && (
                        <div className={`flex justify-end ${ig ? "mt-0.5" : "mt-1"}`}>
                          <span
                            className={`sam-text-xxs font-normal tabular-nums ${ig ? "leading-4 text-muted" : "leading-[14px] text-[#999999]"}`}
                          >
                            {formatBubbleTime(msg.createdAt)}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </li>
        );
        return;
      }

      if (block.type === "mine") {
        const msgs = block.messages;
        const mineBubbleShell = ig ? "bg-signature shadow-none" : "bg-[#FEE500] shadow-sm";
        const mineText = ig
          ? `${IG_DM_BODY_TEXT} text-left text-white`
          : "sam-text-body font-normal leading-[20px] text-[#111111]";
        const mineReply = ig
          ? "border-sam-surface/40 sam-text-helper font-normal leading-[1.35] text-white/80"
          : "border-sam-border/50 sam-text-helper text-[#999999]";
        const bubblePadIgMine = IG_DM_BUBBLE_PAD;
        items.push(
          <li key={`mine-${msgs[0].id}`} className={`flex justify-end ${gapFromPrev}`}>
            <div className={`flex flex-col items-end ${ig ? IG_DM_BUBBLE_ROW_MAX : DEFAULT_CHAT_BUBBLE_ROW_MAX}`}>
              {msgs.map((msg, i) => {
                const pos = getBubblePosition(msgs, i);
                const showTime = isLastInMinuteGroup(msgs, i);
                const isImage = msg.messageType === "image" || !!msg.imageUrl;
                const text = (msg.message || "").trim();
                const hasReply = !!msg.replyTo?.text;
                const emojiOnly = !isImage && isEmojiOnlyMessage(text);

                return (
                  <div key={msg.id} className={i === 0 ? "" : ig ? "mt-0.5" : "mt-1"}>
                    {emojiOnly ? (
                      <div
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center bg-transparent py-1"
                        onContextMenu={(e) => e.preventDefault()}
                      >
                        <span className="leading-none" style={{ fontSize: ig ? "32px" : "28px" }}>
                          {text || " "}
                        </span>
                      </div>
                    ) : (
                      <div
                        className={`flex min-h-[36px] min-w-[44px] ${getMineBubbleRadius(pos, ig)} ${mineBubbleShell} ${ig ? bubblePadIgMine : ""}`}
                        style={ig ? undefined : { padding: "8px 12px" }}
                        onContextMenu={(e) => e.preventDefault()}
                      >
                        {hasReply && (
                          <div className={`mb-1 border-l-2 pl-2 ${ig ? "text-left " : ""}${mineReply}`}>
                            {msg.replyTo!.text.slice(0, 50)}
                            {msg.replyTo!.text.length > 50 ? "…" : ""}
                          </div>
                        )}
                        {isImage ? (
                          <div className={`overflow-hidden ${ig ? "rounded-ui-rect" : "rounded-ui-rect"}`}>
                            {msg.imageUrl ? (
                              <img src={msg.imageUrl} alt="" className="max-h-60 w-full object-cover" />
                            ) : null}
                            {text ? (
                              <p className={`mt-1.5 whitespace-pre-wrap break-words ${mineText}`}>{text}</p>
                            ) : null}
                          </div>
                        ) : (
                          <p className={`whitespace-pre-wrap break-words ${mineText}`}>{text || " "}</p>
                        )}
                      </div>
                    )}
                    {showTime && (
                      <div className={`flex items-center justify-start gap-1 ${ig ? "mt-0.5" : "mt-1"}`}>
                        {msg.isRead && (
                          <span
                            className={`sam-text-xxs font-normal ${ig ? "leading-4 text-muted" : "leading-[14px] text-[#999999]"}`}
                          >
                            읽음
                          </span>
                        )}
                        <span
                          className={`sam-text-xxs font-normal tabular-nums ${ig ? "leading-4 text-muted" : "leading-[14px] text-[#999999]"}`}
                        >
                          {formatBubbleTime(msg.createdAt)}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </li>
        );
      }
    });
    return items;
  }, [blocks, currentUserId, ig, partnerAvatar, partnerNickname, t]);

  const useVirt =
    virtualize && !ig && Boolean(scrollParentRef) && listItems.length >= CHAT_MESSAGE_LIST_VIRTUAL_THRESHOLD;

  const rowVirtualizer = useVirtualizer({
    count: useVirt ? listItems.length : 0,
    getScrollElement: () => scrollParentRef?.current ?? null,
    estimateSize: () => 96,
    overscan: 8,
  });

  /** 길이·말미 id 가 바뀌면 총 높이·가시 범위를 다시 잡는다. 안 하면 스크롤/입력 전까지 새 시스템·텍스트 줄이 안 보이는 체감이 난다. */
  const tailMessageId = uniqueMessages[uniqueMessages.length - 1]?.id ?? "";
  useLayoutEffect(() => {
    if (!useVirt) return;
    rowVirtualizer.measure();
  }, [useVirt, listItems.length, tailMessageId, rowVirtualizer]);

  if (uniqueMessages.length === 0) {
    return (
      <div className="flex min-h-[200px] items-center justify-center px-4 py-10">
        <p
          className={`text-center font-normal ${ig ? `max-w-[22.2rem] ${IG_DM_BODY_TEXT} text-muted` : "sam-text-body text-[#999999]"}`}
        >
          {t("common_start_conversation_message")}
        </p>
      </div>
    );
  }

  if (useVirt) {
    return (
      <ul
        className={`relative flex w-full list-none flex-col ${ig ? "py-3" : "py-2"}`}
        style={{ height: rowVirtualizer.getTotalSize() }}
      >
        {rowVirtualizer.getVirtualItems().map((vi) => {
          const row = listItems[vi.index];
          if (!isValidElement(row)) return null;
          return cloneElement(
            row as ReactElement<LiHTMLAttributes<HTMLLIElement>>,
            {
              key: vi.key,
              ref: (el: HTMLLIElement | null) => {
                rowVirtualizer.measureElement(el);
              },
              style: {
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${vi.start}px)`,
              },
            } as LiHTMLAttributes<HTMLLIElement>
          );
        })}
      </ul>
    );
  }

  return <ul className={`flex flex-col ${ig ? "py-3" : "py-2"}`}>{listItems}</ul>;
}
