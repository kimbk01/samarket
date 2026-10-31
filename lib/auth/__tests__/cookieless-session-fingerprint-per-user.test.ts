/**
 * 활성 세션 쿠키가 없는 요청의 세션 번호는 사용자별 — 예전 공용 `"∅"` 는 전역 UNIQUE
 * `user_sessions.session_id` 한 줄을 사용자끼리 덮어썼다 (2026-10-31 운영: iPhone w테스트1 → Android q테스트1).
 */
import { describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (jar.value === undefined ? undefined : { value: jar.value }) }),
}));

import {
  cookielessActiveSessionFingerprint,
  readActiveSessionFingerprintForUser,
} from "@/lib/auth/active-session";

describe("cookieless active-session fingerprint", () => {
  it("쿠키가 있으면 쿠키 값", async () => {
    jar.value = "11111111-2222-3333-4444-555555555555";
    expect(await readActiveSessionFingerprintForUser("user-a")).toBe("11111111-2222-3333-4444-555555555555");
  });

  it("쿠키가 없으면 사용자별 번호 — 서로 다른 사용자는 서로 다른 번호 (공용 ∅ 없음)", async () => {
    jar.value = undefined;
    const a = await readActiveSessionFingerprintForUser("user-a");
    const b = await readActiveSessionFingerprintForUser("user-b");
    expect(a).toBe("cookieless:user-a");
    expect(b).toBe("cookieless:user-b");
    expect(a).not.toBe(b);
    expect(a).not.toBe("∅");
  });

  it("빈 쿠키 값도 쿠키 없음으로 본다", async () => {
    jar.value = "   ";
    expect(await readActiveSessionFingerprintForUser("user-a")).toBe(cookielessActiveSessionFingerprint("user-a"));
  });
});
