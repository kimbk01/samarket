import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * T-03 — 1:1·거래 방 헤더: 전화 버튼이 ⋮(OneToOneDotMenu) 를 대체하지 않는다.
 * 3f49bc530 이 `showHeaderVoiceCall ? 전화 : ⋮` 삼항을 넣어 일반 DM 메뉴가 사라졌던 회귀를 고정.
 * 배달 구매자 방(전화만)·그룹 방(⚙ = 메뉴)은 기존 계약.
 */
const src = readFileSync(
  join(process.cwd(), "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Header.tsx"),
  "utf8"
);

describe("room header: call button and ⋮ menu coexist (T-03)", () => {
  it("call button branch ends without an alternative (no ⋮ in its else)", () => {
    expect(src).toContain("{isDeliveryBuyer || showHeaderVoiceCall ? (");
    expect(src).not.toMatch(/showHeaderVoiceCall \? \([\s\S]*?\) : vm\.isPrivateGroupRoom \|\| vm\.isGroupRoom \? null : \(/);
  });

  it("⋮ menu renders for every non-group, non-delivery-buyer room", () => {
    expect(src).toContain("{isDeliveryBuyer || vm.isPrivateGroupRoom || vm.isGroupRoom ? null : (");
    expect(src).toContain('aria-label={vm.t("nav_messenger_room_menu")}');
    expect(src).toContain('onClick={() => vm.setActiveSheet("menu")}');
  });

  it("header icons keep the 36px visible circle with a 44px touch box (T-01)", () => {
    expect(src).toMatch(/CM_ROOM_HEADER_TOUCH_BTN_CLASS =\s*"group relative flex h-11 w-11/);
    expect(src).toMatch(/CM_ROOM_HEADER_TOUCH_FACE_BASE_CLASS =\s*"flex h-9 w-9/);
    expect(src).not.toMatch(/className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full/);
  });
});
