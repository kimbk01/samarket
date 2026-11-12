import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 그룹 채팅 전체 결함 G1 (docs/design/group-chat-full-fix-design-2026-11-13.md).
 * 타임라인용 `view` 는 성능 때문에 의존성 고정 → 친구 목록·멤버 보강·초대 후보가 바뀌어도 시트가 몰랐다
 * (2026-11-13 실기: /friends 14명인데 시트 vm friends=0 → 「초대할 수 있는 친구가 없습니다」).
 * 시트 계층은 매 렌더 최신 room 을 읽는 별도 컨텍스트만 쓴다.
 */
const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("room sheets read the latest room (G1)", () => {
  it("Body: 시트 전용 값은 room 전체를 의존성으로 다시 만든다, 타임라인 view 의존성은 그대로", () => {
    const body = read("components/community-messenger/room/CommunityMessengerRoomClientPhase2Body.tsx");
    expect(body).toMatch(/const sheetsView = useMemo\([\s\S]{0,200}\.\.\.room,[\s\S]{0,120}\[room\]\s*\)/);
    expect(body).toMatch(
      /<MessengerRoomPhase2SheetsViewProvider value=\{sheetsView\}>\s*<CommunityMessengerRoomPhase2RoomSheets \/>\s*<CommunityMessengerRoomPhase2MemberActionModal \/>\s*<\/MessengerRoomPhase2SheetsViewProvider>/
    );
    /** 타임라인 view 는 `room` 전체 의존 금지(입력마다 타임라인 무효화 방지) — 유지 */
    expect(body).toContain("// `room` 전체 dep 금지 — message 타이핑마다 Timeline invalidate 방지. 필드 단위만.");
  });

  it("시트 두 컴포넌트는 시트 전용 훅만 읽는다", () => {
    for (const rel of [
      "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2RoomSheets.tsx",
      "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MemberActionModal.tsx",
    ]) {
      const s = read(rel);
      expect(s, rel).toContain("useMessengerRoomPhase2SheetsView()");
      expect(s, rel).not.toContain("useMessengerRoomPhase2View()");
    }
  });

  it("시트 두 컴포넌트는 memo 가 아니다 — Main 렌더마다 다시 그려져 새 컨텍스트로 추가 렌더 없음", () => {
    for (const rel of [
      "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2RoomSheets.tsx",
      "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MemberActionModal.tsx",
    ]) {
      const s = read(rel);
      expect(s, rel).toMatch(/export function CommunityMessengerRoomPhase2(RoomSheets|MemberActionModal)\(\)/);
      expect(s, rel).not.toMatch(/memo\(function CommunityMessengerRoomPhase2(RoomSheets|MemberActionModal)/);
    }
  });
});
