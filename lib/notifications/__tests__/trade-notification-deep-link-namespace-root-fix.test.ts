import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../../..");

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

function expectRouteUsesMessengerRoomIdForTradeChatNotification(source: string) {
  // Namespace regression guard: never pass product_chats.id into CM room route.
  expect(source).not.toContain('tradeChatNotificationHref(resolved.productChatId');

  // Contract: compute cmRoomId from resolved.messengerRoomId and pass it.
  expect(source).toMatch(/const\s+cmRoomId\s*=\s*resolved\.messengerRoomId\?\.\s*trim\(\)\s*\?\?\s*""\s*;/);
  expect(source).toMatch(/tradeChatNotificationHref\(\s*cmRoomId\s*,\s*["']product_chat["']\s*\)/);
  expect(source).toMatch(/ref_id\s*:\s*cmRoomId/);
}

describe("TRADE notification deep-link namespace root fix", () => {
  /** 거래 B (Owner 2026-10-28): seller-complete·buyer-confirm 은 410 으로 닫혀 알림을 보내지 않는다 — 남은 알림 경로만 */
  const cases = ["app/api/trade/product-chat/[roomId]/buyer-issue/route.ts"] as const;

  for (const rel of cases) {
    it(`${rel} uses resolved.messengerRoomId for tradeChatNotificationHref()`, () => {
      const src = readRepoFile(rel);
      expectRouteUsesMessengerRoomIdForTradeChatNotification(src);
    });
  }
});

