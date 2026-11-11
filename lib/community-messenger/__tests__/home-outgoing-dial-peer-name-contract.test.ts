import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 2026-11-09 — 친구 찾기 → 프로필 → 발신 시 발신 화면 이름이 「대화 상대」로 나오던 결함 잠금.
 * 문서: `docs/audit/call-outgoing-peer-name-design-2026-11-09.md` §2-1·§3-1.
 */
function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("messenger home — outgoing dial peer name", () => {
  const home = src("components/community-messenger/CommunityMessengerHome.tsx");

  /** 발신 창 통일 3판: 확인창 → 통화 시트. 시트에서 고른 종류 + 시트를 열 때 정한 발신 이름 그대로 */
  it("통화 시트 「음성·영상」이 시트의 발신 이름을 그대로 넘긴다 (재추측 금지)", () => {
    expect(home).toContain("startFriendDirectCall(next.peerUserId, kind, next.dialPeerLabel)");
  });

  it("대체 문구 「대화 상대」는 확인창 표시에만 — 발신 이름으로 넘기지 않는다", () => {
    const fallbackUses = home.match(/t\("cm_ui_chat_peer_fallback"\)/g) ?? [];
    expect(fallbackUses).toHaveLength(1);
    expect(home).toContain('peerLabel: dialPeerLabel || t("cm_ui_chat_peer_fallback")');
    const resolver = home.slice(
      home.indexOf("const resolveHomeDialPeerLabel"),
      home.indexOf("const startFriendDirectCall")
    );
    expect(resolver).not.toContain("cm_ui_chat_peer_fallback");
  });
});
