import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dedupeSupabaseAuthGetUser = vi.fn();
const fetchAppBootProfileMinimal = vi.fn();
const fetchAuthSessionNoStore = vi.fn();
const runRecoverableGuestRecovery = vi.fn();
const establishGuestAuthState = vi.fn();
const establishRecoverableGuestAuthState = vi.fn();
const awaitClientSupabaseSessionReady = vi.fn();

vi.mock("@/lib/auth/dedupe-supabase-get-user-client", () => ({
  dedupeSupabaseAuthGetUser: (...args: unknown[]) => dedupeSupabaseAuthGetUser(...args),
}));

vi.mock("@/lib/app-boot/fetch-app-boot-profile", () => ({
  fetchAppBootProfileMinimal: (...args: unknown[]) => fetchAppBootProfileMinimal(...args),
  peekAppBootProfileFetchCached: () => null,
}));

vi.mock("@/lib/auth/fetch-auth-session-client", () => ({
  fetchAuthSessionNoStore: (...args: unknown[]) => fetchAuthSessionNoStore(...args),
}));

vi.mock("@/lib/auth/guest-auth-recovery", () => ({
  runRecoverableGuestRecovery: (...args: unknown[]) => runRecoverableGuestRecovery(...args),
}));

vi.mock("@/lib/auth/guest-auth-state", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/guest-auth-state")>();
  return {
    ...actual,
    establishGuestAuthState: (...args: unknown[]) => establishGuestAuthState(...args),
    establishRecoverableGuestAuthState: (...args: unknown[]) => establishRecoverableGuestAuthState(...args),
    isGuestAuthEstablished: () => false,
  };
});

vi.mock("@/lib/auth/await-client-supabase-session-ready", () => ({
  awaitClientSupabaseSessionReady: (...args: unknown[]) => awaitClientSupabaseSessionReady(...args),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({ auth: {} }),
}));

vi.mock("@/lib/app-boot/app-boot-store", () => ({
  isAppBootReady: () => false,
  setAppBootAnonymous: vi.fn(),
  setAppBootHydrating: vi.fn(),
  setAppBootProfile: vi.fn(),
}));

vi.mock("@/lib/profile/fetch-me-profile-deduped", () => ({
  primeMeProfileDedupedFromBoot: vi.fn(),
}));

vi.mock("@/hooks/use-client-membership-state", () => ({
  primeMembershipOnBoot: vi.fn(),
}));

describe("run-app-boot recoverable guest", () => {
  beforeEach(() => {
    vi.resetModules();
    dedupeSupabaseAuthGetUser.mockReset();
    fetchAppBootProfileMinimal.mockReset();
    fetchAuthSessionNoStore.mockReset();
    runRecoverableGuestRecovery.mockReset();
    establishGuestAuthState.mockReset();
    establishRecoverableGuestAuthState.mockReset();
    awaitClientSupabaseSessionReady.mockResolvedValue(undefined);
    runRecoverableGuestRecovery.mockResolvedValue(true);
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defers terminal guest when profile is authenticated but getUser is empty", async () => {
    dedupeSupabaseAuthGetUser.mockResolvedValue({ data: { user: null }, error: null });
    fetchAppBootProfileMinimal.mockResolvedValue({
      status: 200,
      json: { ok: true, profile: { id: "u1", email: "a@b.c", nickname: "n" } },
    });

    const { ensureAppBoot } = await import("@/lib/app-boot/run-app-boot");
    await ensureAppBoot();

    expect(establishRecoverableGuestAuthState).toHaveBeenCalledWith("app_boot_auth_pending_recoverable");
    expect(establishGuestAuthState).not.toHaveBeenCalledWith("app_boot_no_supabase_user");
    expect(runRecoverableGuestRecovery).toHaveBeenCalled();
  });

  it("confirms terminal guest when registry and getUser both unauthenticated", async () => {
    dedupeSupabaseAuthGetUser.mockResolvedValue({ data: { user: null }, error: null });
    fetchAppBootProfileMinimal.mockResolvedValue({ status: 401, json: { ok: false } });
    fetchAuthSessionNoStore.mockResolvedValue(new Response(JSON.stringify({ ok: false }), { status: 401 }));

    const { ensureAppBoot } = await import("@/lib/app-boot/run-app-boot");
    await ensureAppBoot();

    expect(establishGuestAuthState).toHaveBeenCalledWith("app_boot_unauthenticated_confirmed");
    expect(establishRecoverableGuestAuthState).not.toHaveBeenCalled();
  });
});
