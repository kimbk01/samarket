/**
 * 재감사 D-8 ① (P-11) — 메신저 앱 안 배너는 「메신저 채팅 알림」 설정을 따른다(같은 경로의 데스크톱 알림과 같은 값).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("D-8 ① messenger in-app banner follows the chat notification setting", () => {
  it("banner requires communityChatEnabled like the desktop notification", () => {
    const fx = read("lib/community-messenger/notifications/cm-participant-unread-full-effects.ts");
    expect(fx).toMatch(/const wantBanner =[\s\S]{0,200}showAppLevelBanner &&\s*communityChatEnabled;/);
    expect(fx).toContain("communityChatEnabled,");
  });
});
