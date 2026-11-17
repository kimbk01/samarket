import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  estimateMessengerTimelineRowPx,
  MESSENGER_SHORT_TEXT_ROW_ESTIMATE_PX,
  MESSENGER_STORE_ORDER_OPS_ROW_ESTIMATE_PX,
  MESSENGER_SYSTEM_ROW_ESTIMATE_PX,
} from "@/lib/store-order-chat/messenger-timeline-row-estimate";
import { MESSENGER_TIMELINE_VIRTUAL_ESTIMATE_PX } from "@/lib/community-messenger/room/messenger-room-ui-constants";

/**
 * P4 채팅 글자 (Owner 2026-11-18 「권장안대로 반영」 · 레거시 Telegram 기준)
 * 설계: docs/audit/messenger-chat-audit-2026-11-18/appendix-P4-typography-clock-design.md B-1~B-5·B-7
 *       + docs/audit/messenger-chat-full-audit-ssot-design-2026-11-18.md §6-1.
 */
const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

function rootTokenBlock(css: string): string {
  const start = css.indexOf("--cm-chat-font-body: 16px;");
  expect(start).toBeGreaterThan(0);
  return css.slice(css.lastIndexOf(":root {", start), css.indexOf("}", start));
}

describe("P4 채팅 글자 토큰 — 전역 design-tokens.css", () => {
  const tokens = read("app/design-tokens.css");

  it("휴대폰 값: 본문 16 · 서비스 14(날짜 600) · 인용 14 · 발신자 14 · 시각 12 · 머리글 18/14 · 목록 16/15/12 · 배지 12", () => {
    const block = rootTokenBlock(tokens);
    for (const decl of [
      "--cm-chat-font-body: 16px;",
      "--cm-chat-font-body-lh: 1.35;",
      "--cm-chat-font-service: 14px;",
      "--cm-chat-font-service-weight-date: 600;",
      "--cm-chat-font-quote: 14px;",
      "--cm-chat-font-sender: 14px;",
      "--cm-chat-font-meta: 12px;",
      "--cm-chat-font-composer: var(--cm-chat-font-body);",
      "--cm-chat-font-header-title: 18px;",
      "--cm-chat-font-header-status: 14px;",
      "--cm-chat-font-list-title: 16px;",
      "--cm-chat-font-list-preview: 15px;",
      "--cm-chat-font-list-meta: 12px;",
      "--cm-chat-font-badge: 12px;",
    ]) {
      expect(block).toContain(decl);
    }
  });

  it("태블릿(짧은 변 ≥600px, 레거시 isTablet): 같은 토큰만 바꾼다 — 본문 18 · 인용/발신자 15 · 서비스 16 · 시각 12 그대로", () => {
    const m = tokens.match(/@media \(min-width: 600px\) and \(min-height: 600px\) \{\s*:root \{([^}]*)\}/);
    expect(m).not.toBeNull();
    const body = m![1];
    expect(body).toContain("--cm-chat-font-body: 18px;");
    expect(body).toContain("--cm-chat-font-quote: 15px;");
    expect(body).toContain("--cm-chat-font-sender: 15px;");
    expect(body).toContain("--cm-chat-font-service: 16px;");
    expect(body).not.toContain("--cm-chat-font-meta");
    expect(body).not.toContain("--cm-chat-font-header");
  });

  it("다른 머리글 제목 17(SSOT S7)은 바꾸지 않는다", () => {
    expect(read("app/sector-header.css")).toContain("--sector-header-title-size: 17px;");
  });
});

describe("P4 입력창 규칙 — 전역 파일(주문 채팅 슬라이드 콜드 진입 포함)", () => {
  it("chat-viewport-shell.css 에 입력 글자·안내 글 규칙, messenger-presentation.css 에는 없다", () => {
    const shell = read("app/chat-viewport-shell.css");
    expect(shell).toContain("[data-cm-room] textarea[data-cm-composer-input]");
    expect(shell).toContain("font-size: var(--cm-chat-font-composer, 16px) !important;");
    expect(shell).toMatch(/textarea\[data-cm-composer-input\]::placeholder\s*\{[^}]*--cm-chat-font-composer/);
    const presentation = read("app/messenger-presentation.css");
    expect(presentation).not.toMatch(/textarea\[data-cm-composer-input\]\s*\{/);
    expect(read("app/globals.css")).toContain('@import "./chat-viewport-shell.css";');
  });

  it("주문 채팅 입력칸(delivery-chat-room.css)도 고정 16px !important 없이 같은 토큰 — 입력 글·안내 글 일치", () => {
    const css = read("app/delivery-chat-room.css");
    expect(css).not.toMatch(/font-size:\s*16px\s*!important/);
    expect(css).toContain("font-size: var(--cm-chat-font-composer, 16px) !important;");
    expect(css).toMatch(/\[data-delivery-composer-pill\] textarea::placeholder[\s\S]{0,120}--cm-chat-font-composer/);
  });

  it("입력칸 textarea 에 data-cm-composer-input 이 있다", () => {
    expect(read("components/community-messenger/line-ui/messenger-composer-sector.tsx")).toContain(
      'data-cm-composer-input=""'
    );
  });
});

describe("P4 대화 목록 기본 행 토큰", () => {
  it("chat 행 미리보기·시각은 전역 토큰, 배지는 배지 토큰", () => {
    const css = read("app/messenger-presentation.css");
    expect(css).toContain("--cm-list-title-size: var(--cm-chat-font-list-title);");
    expect(css).toContain("--cm-list-preview-size: var(--cm-chat-font-list-preview);");
    expect(css).toContain("--cm-list-meta-size: var(--cm-chat-font-list-meta);");
    expect(css).toContain("--cm-list-row-max-h: 72px;");
    expect(read("components/community-messenger/MessengerChatListItem.tsx")).toContain(
      "text-[length:var(--cm-chat-font-badge)]"
    );
  });
});

describe("P4 거래·주문 목록 행 — 모든 대화 목록 같은 토큰(레거시)", () => {
  it("trade·delivery 행도 이름 16 · 미리보기 15 · 시각 12 · 배지 12 토큰", () => {
    const css = read("app/messenger-presentation.css");
    expect(css).toMatch(
      /\[data-messenger-chat-row\]\[data-cm-list-visual="trade"\],\s*\[data-messenger-chat-row\]\[data-cm-list-visual="delivery"\] \{[^}]*--cm-list-preview-size: var\(--cm-chat-font-list-preview\);[^}]*--cm-list-meta-size: var\(--cm-chat-font-list-meta\);/
    );
    for (const f of [
      "components/community-messenger/trade-chat-list/TradeChatListRowContent.tsx",
      "components/community-messenger/delivery-chat-list/DeliveryChatListRowContent.tsx",
    ]) {
      const src = read(f);
      expect(src).toContain("text-[length:var(--cm-chat-font-list-preview)]");
      expect(src).toContain("text-[length:var(--cm-chat-font-list-title)]");
      expect(src).not.toMatch(/text-\[(13\.5|16)px\]/);
    }
    /** 행 높이 그대로 */
    expect(read("components/community-messenger/trade-chat-list/TradeChatListRowContent.tsx")).toContain("h-[84px]");
    expect(read("components/community-messenger/delivery-chat-list/DeliveryChatListRowContent.tsx")).toContain("h-[72px]");
    const item = read("components/community-messenger/MessengerChatListItem.tsx");
    expect(item).not.toMatch(/text-\[(11|11\.5)px\] font-(normal|bold)/);
    expect(item.match(/text-\[length:var\(--cm-chat-font-badge\)\]/g)?.length).toBe(2);
  });
});

describe("P4 대화방 글자 — 고정 px·sam-text 크기 클래스 래칫", () => {
  const files = [
    "components/community-messenger/room/phase2/MessengerTimelineBubbleInners.tsx",
    "components/community-messenger/room/phase2/MessengerTimelineVirtualRow.tsx",
    "components/community-messenger/room/phase2/MessengerTradeListingChangeSystemRow.tsx",
    "components/community-messenger/room/phase2/StoreOrderDeliveryMessengerHeaderBlock.tsx",
    "components/community-messenger/VoiceMessageBubble.tsx",
  ];
  for (const f of files) {
    it(`${f.split("/").pop()} — text-[11|12|13|14px]·sam-text-xxs/helper 없음`, () => {
      const src = read(f);
      expect(src).not.toMatch(/text-\[(11|11\.5|12|13|13\.5|14)px\]/);
      expect(src).not.toMatch(/sam-text-(xxs|helper)/);
    });
  }

  it("본문 = 본문 토큰·줄 높이 토큰, 날짜 구분 = 서비스 토큰 + 굵기 토큰", () => {
    const inner = read("components/community-messenger/room/phase2/MessengerTimelineBubbleInners.tsx");
    expect(inner).toContain("text-[length:var(--cm-chat-font-body)] leading-[var(--cm-chat-font-body-lh)]");
    const row = read("components/community-messenger/room/phase2/MessengerTimelineVirtualRow.tsx");
    expect(row).toContain(
      "text-[length:var(--cm-chat-font-service)] font-[number:var(--cm-chat-font-service-weight-date)]"
    );
    expect(row).toContain("text-[length:var(--cm-chat-font-sender)]");
    /** 말풍선 안 시각 표시와 본문 안 보이지 않는 자리는 같은 크기여야 폭이 맞는다 */
    expect(row).toContain('const inBubbleMetaClass = "inline-flex items-center gap-1 text-[length:var(--cm-chat-font-meta)]');
    expect(inner).toMatch(/data-cm-text-meta-spacer[\s\S]{0,200}text-\[length:var\(--cm-chat-font-meta\)\]/);
  });

  it("메신저 방 머리글은 제목 18·상태 14 토큰 (sector-header 제목 토큰 미사용)", () => {
    const header = read("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Header.tsx");
    expect(header).not.toContain("var(--sector-header-title-size)");
    expect(header).not.toMatch(/truncate sam-text-xxs/);
    expect(header).toContain("text-[length:var(--cm-chat-font-header-title)]");
    expect(header).toContain("text-[length:var(--cm-chat-font-header-status)]");
  });
});

describe("P4 1:1 방 상대 사진·이름 없음 (그룹만)", () => {
  it("이름·사진은 그룹 방에서만, 꼬리는 묶음 첫 줄 기준 유지", () => {
    const tl = read("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageTimeline.tsx");
    expect(tl).toContain("const showPeerName = vm.isGroupRoom && peerClusterStart;");
    expect(tl).toContain("const showBubbleTail = item.isMine ? showMineClusterStart : peerClusterStart;");
    expect(tl).toContain("peerAvatarColumn={vm.isGroupRoom}");
    const row = read("components/community-messenger/room/phase2/MessengerTimelineVirtualRow.tsx");
    expect(row).toContain("{!item.isMine && peerAvatarColumn ? (");
    expect(row).toContain("a.peerAvatarColumn === b.peerAvatarColumn");
  });
});

describe("P4 행 높이 추정", () => {
  it("짧은 글 55 · 기본 100 · 시스템 74 · 주문 상태 92 · content-visibility 68", () => {
    expect(MESSENGER_SHORT_TEXT_ROW_ESTIMATE_PX).toBe(55);
    expect(MESSENGER_TIMELINE_VIRTUAL_ESTIMATE_PX).toBe(100);
    expect(MESSENGER_SYSTEM_ROW_ESTIMATE_PX).toBe(74);
    expect(MESSENGER_STORE_ORDER_OPS_ROW_ESTIMATE_PX).toBe(92);
    expect(
      estimateMessengerTimelineRowPx({ messageType: "system", content: "x", metadata: null })
    ).toBe(74);
    expect(estimateMessengerTimelineRowPx({ messageType: "text", content: "안녕", metadata: null })).toBe(55);
    expect(read("app/samarket-components.css")).toContain("contain-intrinsic-block-size: auto 68px;");
  });

  it("1:1 과 그룹 구분 — 그룹 받은 글만 이름 줄 22 더함", () => {
    const short = { messageType: "text" as const, content: "안녕", metadata: null };
    expect(estimateMessengerTimelineRowPx({ ...short, isMine: false })).toBe(55);
    expect(estimateMessengerTimelineRowPx({ ...short, isMine: false }, { isGroupRoom: false })).toBe(55);
    expect(estimateMessengerTimelineRowPx({ ...short, isMine: false }, { isGroupRoom: true })).toBe(77);
    expect(estimateMessengerTimelineRowPx({ ...short, isMine: true }, { isGroupRoom: true })).toBe(55);
    expect(
      estimateMessengerTimelineRowPx({ messageType: "system", content: "x", metadata: null, isMine: false }, { isGroupRoom: true })
    ).toBe(74);
    expect(read("lib/community-messenger/room/use-messenger-room-phase1-timeline-heavy.ts")).toContain(
      "estimateMessengerTimelineRowPx(displayRoomMessages[index], { isGroupRoom })"
    );
    expect(read("components/community-messenger/CommunityMessengerRoomClientInner.tsx")).toContain(
      "isGroupRoom={isGroupRoomForShell}"
    );
  });

  it("서비스 문구 줄 높이는 비율(leading-[1.4]) — 태블릿 16px 에서도 고정 20px 에 갇히지 않음", () => {
    for (const f of [
      "components/community-messenger/room/phase2/MessengerTimelineVirtualRow.tsx",
      "components/community-messenger/room/phase2/MessengerTradeListingChangeSystemRow.tsx",
    ]) {
      const src = read(f);
      expect(src).toContain("text-[length:var(--cm-chat-font-service)] leading-[1.4]");
      expect(src).not.toMatch(/--cm-chat-font-service\)\] leading-5/);
    }
  });
});
