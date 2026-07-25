import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * P3-c3 — home list participant catch-up aligns with P3-c1 hub-sync.
 *
 * CONTRACT:
 *   decrease/same + authorityApplied → Domain fresh 0
 *   decrease + !authorityApplied → fallback fresh 1
 *   increase → unconditional fresh (unchanged)
 *   merge_summary / silent home-sync / resubscribe list catch-up unchanged
 *
 * EXCLUDED: merge_summary(R3), RT health coordinator, dirty poll, Boot/Auth/ACK,
 * hub-sync decrease gate (P3-c1 LOCK), Hub visibility, Builder.
 */

const root = process.cwd();
function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("P3-c3 home list participant fresh gate (static)", () => {
  it("decrease path gates fresh on !authorityApplied like P3-c1", () => {
    const src = read(
      "lib/community-messenger/home/use-community-messenger-home-realtime-bootstrap-list.ts"
    );
    const code = stripComments(src);
    expect(code).toContain("applyMessengerRoomUnreadFactAndSyncBottom");
    expect(code).toContain("decreaseFallback");
    expect(code).toContain("!applied.authorityApplied");
    const decreaseIdx = code.indexOf('participantUnreadDirection: "decrease"');
    expect(decreaseIdx).toBeGreaterThan(-1);
    const guardIdx = code.indexOf("decreaseFallback");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(decreaseIdx);
  });

  it("increase still unconditionally requests Domain fresh", () => {
    const src = read(
      "lib/community-messenger/home/use-community-messenger-home-realtime-bootstrap-list.ts"
    );
    const code = stripComments(src);
    expect(code).toContain("nextUnread > prevUnread");
    expect(code).toContain('participantUnreadDirection: "increase"');
    // increase branch must still call resync without authorityApplied gate.
    const increaseBlockStart = code.indexOf("if (nextUnread > prevUnread)");
    expect(increaseBlockStart).toBeGreaterThan(-1);
    const increaseBlock = code.slice(increaseBlockStart, increaseBlockStart + 350);
    expect(increaseBlock).toContain("requestMessengerHubBadgeResync");
    expect(increaseBlock).toContain('participantUnreadDirection: "increase"');
    expect(increaseBlock).not.toContain("authorityApplied");
  });

  it("does not gate merge_summary (R3 excluded from this PR)", () => {
    const src = read(
      "lib/community-messenger/home/use-community-messenger-home-realtime-bootstrap-list.ts"
    );
    const code = stripComments(src);
    // merge_summary still fires unconditional resync (out of P3-c3 scope).
    expect(code).toContain('requestMessengerHubBadgeResync("home_list_merge_summary")');
  });

  it("hub-sync P3-c1 decrease gate remains intact", () => {
    const src = read(
      "lib/community-messenger/notifications/use-cm-participants-hub-sync.ts"
    );
    const code = stripComments(src);
    expect(code).toContain("decreaseFallback");
    expect(code).toContain("!applied.authorityApplied");
  });
});
