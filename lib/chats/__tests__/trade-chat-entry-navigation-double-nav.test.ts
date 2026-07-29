import { describe, expect, it, vi } from "vitest";
import { openCreateTradeChat } from "@/lib/chats/trade-chat-entry-navigation";

/**
 * 증거: `openCreateTradeChat` 자체에는 once-guard 가 없어 호출마다 replace 가 나간다.
 * 연타 방지는 PostDetailView `chatNavStartedRef` / `chatCtaBusy` 가 담당한다.
 */
describe("trade-chat-entry-navigation (no built-in once-guard)", () => {
  it("openCreateTradeChat invokes replace on every call", () => {
    const replace = vi.fn();
    const router = {
      push: vi.fn(),
      replace,
      prefetch: vi.fn(),
    };
    openCreateTradeChat(router, { productId: "prod-a" });
    openCreateTradeChat(router, { productId: "prod-a" });
    expect(replace).toHaveBeenCalledTimes(2);
  });
});
