import { describe, expect, it } from "vitest";
import {
  parseProviderEmailConflictRedirectParams,
  resolveConflictExistingLoginAction,
} from "@/components/auth/provider-email-conflict-redirect";

describe("P1-15 resolveConflictExistingLoginAction", () => {
  it("routes google/kakao/apple through the screen OAuth starter", () => {
    expect(resolveConflictExistingLoginAction("google")).toEqual({ kind: "oauth", provider: "google" });
    expect(resolveConflictExistingLoginAction("kakao")).toEqual({ kind: "oauth", provider: "kakao" });
    expect(resolveConflictExistingLoginAction("apple")).toEqual({ kind: "oauth", provider: "apple" });
  });
  it("email existing provider opens the internal login form", () => {
    expect(resolveConflictExistingLoginAction("email")).toEqual({ kind: "internal" });
  });
  it("naver / facebook / unknown never start a login", () => {
    expect(resolveConflictExistingLoginAction("naver")).toEqual({ kind: "unsupported" });
    expect(resolveConflictExistingLoginAction("facebook")).toEqual({ kind: "unsupported" });
    expect(resolveConflictExistingLoginAction(null)).toEqual({ kind: "unsupported" });
  });
});

describe("P1-4 hardening: parseProviderEmailConflictRedirectParams", () => {
  it("accepts a complete conflict context", () => {
    const r = parseProviderEmailConflictRedirectParams(
      new URLSearchParams("auth_stash=tok&auth_conflict_email=a@b.co&auth_conflict_attempted=google&auth_conflict_existing=kakao"),
    );
    expect(r.hadStashParam).toBe(true);
    expect(r.conflict).toEqual({
      email: "a@b.co",
      attemptedProvider: "google",
      existingProviders: ["kakao"],
      stashToken: "tok",
    });
  });
  it("rejects a stash injected without conflict context (but flags it for URL stripping)", () => {
    const r = parseProviderEmailConflictRedirectParams(new URLSearchParams("auth_stash=tok"));
    expect(r.hadStashParam).toBe(true);
    expect(r.conflict).toBeNull();
  });
  it("rejects unknown attempted / existing providers", () => {
    expect(
      parseProviderEmailConflictRedirectParams(
        new URLSearchParams("auth_stash=t&auth_conflict_email=a@b.co&auth_conflict_attempted=naver&auth_conflict_existing=kakao"),
      ).conflict,
    ).toBeNull();
    expect(
      parseProviderEmailConflictRedirectParams(
        new URLSearchParams("auth_stash=t&auth_conflict_email=a@b.co&auth_conflict_attempted=google&auth_conflict_existing=evil"),
      ).conflict,
    ).toBeNull();
  });
});
