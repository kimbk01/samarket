import { describe, expect, it } from "vitest";
import { mapNativeGooglePluginError } from "@/lib/auth/native/native-google-auth-contract";

describe("Google 플러그인 고아 호출 대체", () => {
  it("새 로그인에 대체된 이전 호출은 실패 문구 없이 종료 (user_cancelled)", () => {
    expect(mapNativeGooglePluginError("google_native_superseded")).toBe("user_cancelled");
  });
});
