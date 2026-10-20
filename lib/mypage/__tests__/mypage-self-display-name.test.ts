import { describe, expect, it } from "vitest";
import { resolveMypageSelfDisplayName } from "@/lib/mypage/mypage-self-display-name";

/** D14 — 본인 화면 이름 = 공개 이름(nickname). nickname 없는 레거시 행만 대체 */
describe("resolveMypageSelfDisplayName", () => {
  it("nickname 과 display_name 이 다르면 nickname (다른 회원이 보는 이름과 같게)", () => {
    expect(resolveMypageSelfDisplayName({ nickname: "새이름", display_name: "옛이름" })).toBe("새이름");
  });
  it("nickname 이 비면 기존 대체 순서", () => {
    expect(resolveMypageSelfDisplayName({ nickname: " ", display_name: "옛이름" })).toBe("옛이름");
    expect(resolveMypageSelfDisplayName({ nickname: null, email: "kim@x.com" })).toBe("kim");
    expect(resolveMypageSelfDisplayName(null)).toBe("");
  });
});
