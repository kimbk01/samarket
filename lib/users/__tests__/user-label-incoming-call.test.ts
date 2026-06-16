import { describe, expect, it } from "vitest";
import { incomingCallPeerNicknameLabel } from "@/lib/users/user-label";

describe("incomingCallPeerNicknameLabel", () => {
  it("keeps plain nickname", () => {
    expect(incomingCallPeerNicknameLabel("홍길동")).toBe("홍길동");
  });

  it("strips legacy (@username) suffix", () => {
    expect(incomingCallPeerNicknameLabel("홍길동 (@hong)")).toBe("홍길동");
  });

  it("strips leading @handle", () => {
    expect(incomingCallPeerNicknameLabel("@hong")).toBe("hong");
  });
});
