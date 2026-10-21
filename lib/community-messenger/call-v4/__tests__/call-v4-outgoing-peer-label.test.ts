import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveOutgoingCallPeerLabelHint } from "@/lib/community-messenger/call-v4/call-v4-outgoing-peer-label";

describe("V-3 — 발신 상대 이름은 프로필 표시명", () => {
  const members = [
    { id: "me", label: "나" },
    { id: "peer-1", label: "김철수 (@kim)" },
  ];

  it("방 제목(별칭)보다 상대 멤버 프로필 라벨을 쓴다(서버와 같은 닉네임 규칙)", () => {
    expect(resolveOutgoingCallPeerLabelHint(members, "peer-1", "회사 동료 별칭")).toBe("김철수");
  });

  it("멤버 정보가 없으면 방 제목으로 보조", () => {
    expect(resolveOutgoingCallPeerLabelHint([], "peer-1", "방 제목")).toBe("방 제목");
    expect(resolveOutgoingCallPeerLabelHint(members, null, " 방 ")).toBe("방");
    expect(resolveOutgoingCallPeerLabelHint(null, null, null)).toBeUndefined();
  });

  it("세션 생성 후에는 서버 세션 peerLabel 이 힌트보다 우선", async () => {
    const { resolveCallV4OutgoingPeerLabel } = await import("@/lib/community-messenger/call-v4/call-v4-actions");
    expect(resolveCallV4OutgoingPeerLabel("김철수", "회사 동료 별칭")).toBe("김철수");
    expect(resolveCallV4OutgoingPeerLabel("", "힌트")).toBe("힌트");
    expect(resolveCallV4OutgoingPeerLabel(null, null)).toBe("");
  });

  it("방 발신 경로가 room.title 을 직접 peerLabel 로 쓰지 않는다", () => {
    const src = readFileSync(
      path.join(process.cwd(), "lib/community-messenger/room/phase2/use-messenger-room-phase2-controller.ts"),
      "utf8",
    );
    expect(src).not.toContain("const peerLabel = snapshot?.room.title?.trim();");
    expect(src).toContain("resolveOutgoingCallPeerLabelHint(snapshot.members, snapshot.room.peerUserId, snapshot.room.title)");
  });
});
