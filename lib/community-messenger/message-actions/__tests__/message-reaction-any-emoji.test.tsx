// @vitest-environment jsdom
/**
 * 반응 확대 (Owner 2026-11-16 「1·2·3번」 중 3번 — 6개 고정 → 아무 이모지 1개).
 * 1인 1개·내 메시지 불가 정책은 그대로(canReactToMessage 변경 없음).
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MESSENGER_QUICK_REACTION_KEYS,
  isMessengerReactionKey,
} from "@/lib/community-messenger/message-actions/message-reaction-policy";
import { MessageReactionBar } from "@/components/community-messenger/room/message/MessageReactionBar";

vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({ t: (k: string, p?: Record<string, unknown>) => (p?.key ? `${k}:${p.key}` : k), language: "ko" }),
}));

describe("isMessengerReactionKey", () => {
  it.each([
    ...MESSENGER_QUICK_REACTION_KEYS,
    "🔥",
    "🫠",
    "👍🏽",
    "👨‍👩‍👧‍👦",
    "🇰🇷",
    "1️⃣",
    "❤️‍🔥",
  ])("허용: %s", (k) => {
    expect(isMessengerReactionKey(k)).toBe(true);
  });

  it.each(["", " ", "a", "ㅋ", "좋아요", "😀😀", "😀a", " 😀", "😀 ", "1", "#", "<script>"])("거부: %j", (k) => {
    expect(isMessengerReactionKey(k)).toBe(false);
  });

  it("DB CHECK 32자 상한을 넘으면 거부", () => {
    expect(isMessengerReactionKey("😀".repeat(17))).toBe(false);
  });
});

describe("MessageReactionBar 「+」", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("6개 바로 고르기 + 「+」 버튼, 「+」는 onMore 를 부른다", () => {
    const onMore = vi.fn();
    const onPick = vi.fn();
    act(() => root.render(<MessageReactionBar enabled onPick={onPick} onMore={onMore} />));
    const buttons = [...host.querySelectorAll("button")];
    expect(buttons).toHaveLength(MESSENGER_QUICK_REACTION_KEYS.length + 1);
    act(() => (host.querySelector("[data-cm-reaction-more]") as HTMLButtonElement).click());
    expect(onMore).toHaveBeenCalledTimes(1);
    act(() => buttons[0]!.click());
    expect(onPick).toHaveBeenCalledWith(MESSENGER_QUICK_REACTION_KEYS[0]);
    expect(buttons[0]!.getAttribute("aria-label")).toBe(`cm_ui_reaction_pick_aria:${MESSENGER_QUICK_REACTION_KEYS[0]}`);
    /** 2026-11-16 실기: 「+」가 아랫줄로 밀림 → 한 줄 고정 */
    const bar = host.querySelector("[data-cm-reaction-bar]") as HTMLElement;
    expect(bar.className).toContain("flex-nowrap");
    expect(bar.className).not.toContain("flex-wrap ");
  });
});
