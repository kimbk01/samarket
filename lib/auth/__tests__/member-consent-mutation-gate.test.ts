/**
 * B3 — central legal-consent gate on member API mutations (DIBAY FIRST ENTRY).
 * OWNER required tests 1–10 (2026-10-18 실행 지시 §2).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import {
  findMemberConsentExemptRule,
  MEMBER_CONSENT_EXEMPT_RULES,
  resolveMemberConsentClassForApiMutation,
} from "@/lib/auth/member-consent-mutation-policy";
import type { MemberConsentAuthorityResult } from "@/lib/auth/resolve-member-consent-authority";
import { resolveMemberActionClassForApiMutation } from "@/lib/auth/member-action-policy";

const ACTIVE = { status: "verified_user", deleted_at: null };

async function loadGate(consent: MemberConsentAuthorityResult | (() => never)) {
  vi.resetModules();
  vi.doMock("@/lib/auth/proxy-auth-session-cache", () => ({
    peekProxyAuthSessionCache: () => "user-consent-1",
    proxyAuthCookieFingerprint: () => "fp",
    setProxyAuthSessionCache: () => {},
  }));
  vi.doMock("@/lib/auth/resolve-member-lifecycle-authority", async () => {
    const actual = await vi.importActual<typeof import("@/lib/auth/resolve-member-lifecycle-authority")>(
      "@/lib/auth/resolve-member-lifecycle-authority",
    );
    return {
      ...actual,
      resolveMemberLifecycleAuthority: async () => ({
        kind: "RESOLVED",
        profile: ACTIVE,
        lifecycle: "active",
        source: "db",
      }),
    };
  });
  const consentSpy = vi.fn(async () => {
    if (typeof consent === "function") return consent();
    return consent;
  });
  vi.doMock("@/lib/auth/resolve-member-consent-authority", () => ({
    resolveMemberConsentAuthority: consentSpy,
  }));
  const mod = await import("@/lib/auth/enforce-api-member-mutation-policy");
  return { enforce: mod.enforceApiMemberMutationPolicy, consentSpy };
}

const REQUIRED: MemberConsentAuthorityResult = {
  kind: "CONSENT_REQUIRED",
  requiredTermsVersion: "v2",
  requiredPrivacyVersion: "v2",
};

function req(method: string, path: string) {
  return new NextRequest(`http://localhost${path}`, { method });
}

describe("B3 central consent gate — enforce", () => {
  beforeEach(() => vi.resetModules());

  it("1. unconsented member: new write → 403 signup_incomplete", async () => {
    const { enforce } = await loadGate(REQUIRED);
    for (const [m, p] of [
      ["POST", "/api/community/posts"],
      ["POST", "/api/philife/posts"],
      ["POST", "/api/community/posts/p1/like"],
      ["POST", "/api/community-messenger/rooms/r1/messages"],
      ["POST", "/api/me/store-orders"],
      ["POST", "/api/community-messenger/rooms/r1/calls"],
    ] as const) {
      const res = await enforce(req(m, p));
      expect(res, `${m} ${p}`).not.toBeNull();
      expect(res!.status).toBe(403);
      expect((await res!.json()).code).toBe("signup_incomplete");
    }
  });

  it("2. consented member (current CMS version): write passes the gate", async () => {
    const { enforce } = await loadGate({ kind: "CONSENTED", via: "consent" });
    expect(await enforce(req("POST", "/api/community/posts"))).toBeNull();
  });

  it("3. phone gate unchanged — consent gate never answers for phone (route still runs its own gate)", async () => {
    const { enforce } = await loadGate({ kind: "CONSENTED", via: "consent" });
    // Gate passes → route handler's requirePhoneVerified / assertVerifiedMemberForAction still run.
    expect(await enforce(req("POST", "/api/chat/room/r1/send"))).toBeNull();
    const src = readFileSync(resolve(process.cwd(), "app/api/chat/room/[roomId]/send/route.ts"), "utf8");
    expect(src).toContain("assertVerifiedMemberForAction");
  });

  it("4. profile & address correction allowed without consent", async () => {
    const { enforce, consentSpy } = await loadGate(REQUIRED);
    for (const [m, p] of [
      ["PATCH", "/api/me/profile"],
      ["POST", "/api/me/profile/avatar"],
      ["POST", "/api/me/addresses"],
      ["PATCH", "/api/me/addresses/a1"],
      ["POST", "/api/me/addresses/a1/set-default"],
      ["DELETE", "/api/me/addresses/a1"],
    ] as const) {
      expect(await enforce(req(m, p)), `${m} ${p}`).toBeNull();
    }
    expect(consentSpy).not.toHaveBeenCalled();
  });

  it("5. existing order fulfillment (owner / rider) allowed without consent", async () => {
    const { enforce } = await loadGate(REQUIRED);
    for (const [m, p] of [
      ["PATCH", "/api/me/stores/s1/orders/o1"],
      ["PATCH", "/api/me/stores/s1/orders/o1/delivery"],
      ["POST", "/api/me/stores/s1/orders/o1/cancel-request"],
      ["POST", "/api/me/stores/s1/orders/o1/decide"],
      ["PATCH", "/api/me/rider/orders/o1"],
      ["POST", "/api/me/rider/orders/o1/pod-upload"],
      ["POST", "/api/me/rider/location"],
    ] as const) {
      expect(await enforce(req(m, p)), `${m} ${p}`).toBeNull();
    }
  });

  it("6. buyer cancel / refund allowed without consent", async () => {
    const { enforce } = await loadGate(REQUIRED);
    for (const [m, p] of [
      ["PATCH", "/api/me/store-orders/o1"],
      ["DELETE", "/api/me/store-orders/o1"],
      ["POST", "/api/me/points/charge/c1/cancel"],
      ["POST", "/api/me/post-ads/a1/cancel"],
    ] as const) {
      expect(await enforce(req(m, p)), `${m} ${p}`).toBeNull();
    }
  });

  it("7. report / block / support / leave / own-content delete allowed without consent", async () => {
    const { enforce } = await loadGate(REQUIRED);
    for (const [m, p] of [
      ["POST", "/api/reports"],
      ["POST", "/api/community-messenger/relations/block"],
      ["POST", "/api/support/cases/open"],
      ["POST", "/api/community-messenger/rooms/r1/leave"],
      ["DELETE", "/api/community/posts/p1/comments/c1"],
      ["PATCH", "/api/me/legal-consent"],
      ["POST", "/api/me/leave-request"],
      ["POST", "/api/me/devices/deactivate"],
    ] as const) {
      expect(await enforce(req(m, p)), `${m} ${p}`).toBeNull();
    }
  });

  it("8. admin / internal / cron never reach the consent gate", async () => {
    const { enforce, consentSpy } = await loadGate(REQUIRED);
    for (const p of ["/api/admin/app-legal-documents", "/api/cron/store-orders-auto-complete"]) {
      expect(resolveMemberActionClassForApiMutation(p)).toBe("NON_MEMBER");
      expect(await enforce(req("POST", p))).toBeNull();
    }
    expect(consentSpy).not.toHaveBeenCalled();
  });

  it("9. no method / alias / shape bypass", async () => {
    // exempt is method-specific
    expect(resolveMemberConsentClassForApiMutation("PATCH", "/api/me/profile")).toBe("CONSENT_EXEMPT");
    expect(resolveMemberConsentClassForApiMutation("DELETE", "/api/me/profile")).toBe("CONSENT_REQUIRED");
    expect(resolveMemberConsentClassForApiMutation("DELETE", "/api/me/store-orders/o1")).toBe("CONSENT_EXEMPT");
    expect(resolveMemberConsentClassForApiMutation("POST", "/api/me/store-orders")).toBe("CONSENT_REQUIRED");
    // params match one segment only
    expect(resolveMemberConsentClassForApiMutation("PATCH", "/api/me/addresses/a/b")).toBe("CONSENT_REQUIRED");
    expect(resolveMemberConsentClassForApiMutation("POST", "/api/me/addresses/x/set-default/y")).toBe(
      "CONSENT_REQUIRED",
    );
    // trailing slash normalized, not a bypass
    expect(resolveMemberConsentClassForApiMutation("POST", "/api/community/posts/")).toBe("CONSENT_REQUIRED");
    // philife alias of a gated write is gated; alias of an exempt delete is exempt
    expect(resolveMemberConsentClassForApiMutation("POST", "/api/philife/posts")).toBe("CONSENT_REQUIRED");
    expect(resolveMemberConsentClassForApiMutation("DELETE", "/api/philife/posts/p/comments/c")).toBe(
      "CONSENT_EXEMPT",
    );
    // starting a call is gated; an existing session is not
    expect(resolveMemberConsentClassForApiMutation("POST", "/api/community-messenger/rooms/r/calls")).toBe(
      "CONSENT_REQUIRED",
    );
    expect(resolveMemberConsentClassForApiMutation("POST", "/api/community-messenger/calls/s/accept")).toBe(
      "CONSENT_EXEMPT",
    );
    // lowercase method normalized
    expect(findMemberConsentExemptRule("patch", "/api/me/profile")?.reason).toBe("profile_address_correction");
  });

  it("10. server error is never 'consented' — 503 fail-closed", async () => {
    const { enforce } = await loadGate({ kind: "UNAVAILABLE", reason: "versions_unavailable" });
    const res = await enforce(req("POST", "/api/community/posts"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(503);
    expect((await res!.json()).code).toBe("consent_state_unavailable");
  });
});

describe("B3 consent exempt rules integrity", () => {
  function routeFileFor(shape: string): string {
    return resolve(process.cwd(), `app${shape}/route.ts`);
  }

  it("every exempt rule names an existing route file exporting that method", () => {
    const missing: string[] = [];
    for (const r of MEMBER_CONSENT_EXEMPT_RULES) {
      const file = routeFileFor(r.path);
      if (!existsSync(file)) {
        missing.push(`${r.method} ${r.path} (no route file)`);
        continue;
      }
      const src = readFileSync(file, "utf8");
      const exportsMethod =
        new RegExp(`export\\s+(async\\s+)?function\\s+${r.method}\\b`).test(src) ||
        new RegExp(`export\\s+(const|let)\\s+${r.method}\\b`).test(src) ||
        new RegExp(`export\\s*\\{[^}]*\\b${r.method}\\b[^}]*\\}`).test(src);
      if (!exportsMethod) missing.push(`${r.method} ${r.path} (method not exported)`);
    }
    expect(missing).toEqual([]);
  });

  it("no duplicate rules", () => {
    const keys = MEMBER_CONSENT_EXEMPT_RULES.map((r) => `${r.method} ${r.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("proxy applies the member mutation gate (with consent) to /api", () => {
    const proxySrc = readFileSync(resolve(process.cwd(), "proxy.ts"), "utf8");
    expect(proxySrc).toContain("enforceApiMemberMutationPolicy");
    const gateSrc = readFileSync(resolve(process.cwd(), "lib/auth/enforce-api-member-mutation-policy.ts"), "utf8");
    expect(gateSrc).toContain("resolveMemberConsentAuthority");
  });
});
