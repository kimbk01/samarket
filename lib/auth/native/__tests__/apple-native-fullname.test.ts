import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildNativeAppleExchangeRequest,
  normalizeAppleFullName,
  parseNativeAppleExchangeBody,
} from "@/lib/auth/native/native-apple-auth-contract";
import { parseNativeExchangeRequest } from "@/lib/auth/native/native-exchange-contract.server";

vi.mock("server-only", () => ({}));

const src = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("Apple 첫 로그인 이름 전달 (Owner 「수정 진행」 2026-11-08)", () => {
  it("이름 정규화 — 공백 정리·50자·빈 값 null", () => {
    expect(normalizeAppleFullName("  Bongki   Kim ")).toBe("Bongki Kim");
    expect(normalizeAppleFullName("김봉기")).toBe("김봉기");
    expect(normalizeAppleFullName("")).toBeNull();
    expect(normalizeAppleFullName(null)).toBeNull();
    expect(normalizeAppleFullName("a\nb")).toBe("a b");
    expect(normalizeAppleFullName("x".repeat(80))?.length).toBe(50);
  });

  it("앱 → 서버 요청에 이름이 들어간다 (이전: 받은 이름을 버림)", () => {
    const body = buildNativeAppleExchangeRequest({
      provider: "apple",
      identityToken: "tok",
      userIdentifier: "000899.abc",
      fullName: "BONGKI Kim",
    });
    expect(body.fullName).toBe("BONGKI Kim");
    const noName = buildNativeAppleExchangeRequest({ provider: "apple", identityToken: "tok", fullName: null });
    expect("fullName" in noName).toBe(false);
  });

  it("서버가 이름을 받는다", () => {
    expect(parseNativeAppleExchangeBody({ provider: "apple", identityToken: "t", fullName: " 김봉기 " })?.fullName).toBe("김봉기");
    expect(parseNativeExchangeRequest({ provider: "apple", identityToken: "t", fullName: "김봉기" })?.fullName).toBe("김봉기");
    expect(parseNativeExchangeRequest({ provider: "apple", identityToken: "t" })?.fullName).toBeNull();
  });

  it("어댑터·세션이 이름을 끝까지 전달한다 — 닉네임은 공통 프로필 보정(ensureAuthProfileForLogin)만 바꾼다", () => {
    expect(src("lib/auth/native/native-provider-adapter.server.ts")).toMatch(/fullName: input\.fullName \?\? null/);
    const session = src("lib/auth/native/apple-native-session.server.ts");
    expect(session).toMatch(/syntheticUserForEnsure\(signedUser\.id, input\.verified, input\.fullName \?\? null\)/);
    expect(session).toMatch(/buildAppleUserMetadata\(args\.verified, args\.userIdentifier, args\.fullName\)/);
    expect(session).toMatch(/recordAppleFullNameOnIdentity/);
    // SNS 로그인 코드는 닉네임을 직접 쓰지 않는다 (identity-writer-i2 계약)
    expect(session).not.toMatch(/nickname:\s*candidate/);
  });
});
