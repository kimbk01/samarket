import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isGoogleNativeSyntheticAuthEmail,
  isReclaimableGoogleNativeOrphanProfile,
  reclaimGoogleNativeSyntheticAuthOrphan,
  reconcileGoogleNativeProviderProfileConflict,
  resolveGoogleNativeSignInEmail,
} from "@/lib/auth/native/reconcile-google-native-orphan.server";

const findAuthUserByEmail = vi.fn();

vi.mock("@/lib/auth/naver-oauth", () => ({
  findAuthUserByEmail: (...args: unknown[]) => findAuthUserByEmail(...args),
}));

const canonicalUserId = "1a3179f4-9e9b-4b11-98b2-e124932c58bd";
const orphanId = "08224de9-953e-4219-8ead-f30d7201dafb";
const googleUserId = "107373086399795697553";

function adminAuthMocks() {
  return {
    deleteUser: vi.fn(async () => ({ error: null })),
    updateUserById: vi.fn(async () => ({ error: null })),
    getUserById: vi.fn(async () => ({ data: { user: { id: orphanId, user_metadata: { provider: "google" } } }, error: null })),
  };
}

function profilesFrom(profileById: Record<string, unknown> | null, updateEq = vi.fn(async () => ({ error: null }))) {
  return {
    updateEq,
    from: vi.fn((table: string) => {
      if (table !== "profiles") return {};
      return {
        select: () => ({
          eq: (col: string, val: unknown) => {
            if (col === "provider" && val === "google") {
              return {
                eq: () => ({
                  maybeSingle: async () => ({
                    data: profileById ? { id: orphanId, status: "active", deleted_at: null } : null,
                    error: null,
                  }),
                }),
              };
            }
            if (col === "id" && val === orphanId) {
              return { maybeSingle: async () => ({ data: profileById, error: null }) };
            }
            return { maybeSingle: async () => ({ data: null, error: null }) };
          },
        }),
        update: () => ({ eq: updateEq }),
      };
    }),
  };
}

const PENDING_EMPTY = {
  id: orphanId,
  status: "sns_pending",
  member_status: "pending",
  terms_accepted_at: null,
  dibay_id_locked: false,
  email: "im2pact@gmail.com",
  auth_login_email: "im2pact@gmail.com",
  provider: "google",
  auth_provider: "google",
  provider_user_id: googleUserId,
};

describe("reconcile-google-native-orphan", () => {
  it("detects synthetic native auth emails", () => {
    expect(isGoogleNativeSyntheticAuthEmail("google.abc@google.native.dibay.internal")).toBe(true);
    expect(isGoogleNativeSyntheticAuthEmail("im2pact@gmail.com")).toBe(false);
  });

  it("keeps verified Gmail for sign-in when auth user already has a real email", () => {
    expect(
      resolveGoogleNativeSignInEmail("im2pact@gmail.com", "107373086399795697553"),
    ).toBe("im2pact@gmail.com");
  });

  it("P1-8: orphan = no profile or content-less pending only", () => {
    expect(isReclaimableGoogleNativeOrphanProfile(null, orphanId, canonicalUserId)).toBe(true);
    expect(isReclaimableGoogleNativeOrphanProfile(PENDING_EMPTY, orphanId, canonicalUserId)).toBe(true);
    expect(
      isReclaimableGoogleNativeOrphanProfile({ ...PENDING_EMPTY, member_status: "active" }, orphanId, canonicalUserId),
    ).toBe(false);
    expect(
      isReclaimableGoogleNativeOrphanProfile(
        { ...PENDING_EMPTY, terms_accepted_at: "2026-01-01T00:00:00Z" },
        orphanId,
        canonicalUserId,
      ),
    ).toBe(false);
    expect(
      isReclaimableGoogleNativeOrphanProfile({ ...PENDING_EMPTY, dibay_id_locked: true }, orphanId, canonicalUserId),
    ).toBe(false);
    // provider=google · Gmail 일치만으로는 orphan 아님 (기존 판정 축소)
    expect(
      isReclaimableGoogleNativeOrphanProfile(
        { ...PENDING_EMPTY, member_status: "verified_member", status: "active" },
        orphanId,
        canonicalUserId,
      ),
    ).toBe(false);
  });

  it("P1-8: tombstones (never deletes) synthetic orphan auth user blocking canonical update", async () => {
    const auth = adminAuthMocks();
    findAuthUserByEmail.mockResolvedValue({
      id: orphanId,
      email: `google.${googleUserId}@google.native.dibay.internal`,
    });
    const { from } = profilesFrom(PENDING_EMPTY);
    const adminSb = { auth: { admin: auth }, from } as unknown as SupabaseClient;

    await reclaimGoogleNativeSyntheticAuthOrphan(adminSb, canonicalUserId, googleUserId);

    expect(auth.deleteUser).not.toHaveBeenCalled();
    expect(auth.updateUserById).toHaveBeenCalledWith(
      orphanId,
      expect.objectContaining({
        ban_duration: "876000h",
        email: expect.stringMatching(/^orphan\..+@google\.native\.dibay\.internal$/),
        user_metadata: expect.objectContaining({ dibay_orphan_tombstone: true }),
      }),
    );
  });

  it("P1-8: never touches an active member holding the synthetic email", async () => {
    const auth = adminAuthMocks();
    findAuthUserByEmail.mockResolvedValue({
      id: orphanId,
      email: `google.${googleUserId}@google.native.dibay.internal`,
    });
    const { from } = profilesFrom({ ...PENDING_EMPTY, member_status: "active", terms_accepted_at: "2026-01-01" });
    const adminSb = { auth: { admin: auth }, from } as unknown as SupabaseClient;

    await reclaimGoogleNativeSyntheticAuthOrphan(adminSb, canonicalUserId, googleUserId);

    expect(auth.deleteUser).not.toHaveBeenCalled();
    expect(auth.updateUserById).not.toHaveBeenCalled();
  });

  it("clears provider identity from content-less pending orphan and tombstones it", async () => {
    const auth = adminAuthMocks();
    const { from, updateEq } = profilesFrom(PENDING_EMPTY);
    const adminSb = { auth: { admin: auth }, from } as unknown as SupabaseClient;

    await reconcileGoogleNativeProviderProfileConflict(adminSb, canonicalUserId, googleUserId, "im2pact@gmail.com");

    expect(updateEq).toHaveBeenCalledWith("id", orphanId);
    expect(auth.deleteUser).not.toHaveBeenCalled();
    expect(auth.updateUserById).toHaveBeenCalledWith(orphanId, expect.objectContaining({ ban_duration: "876000h" }));
  });

  it("P1-8: same verified Gmail on an ACTIVE member is not cleared or tombstoned", async () => {
    const auth = adminAuthMocks();
    const { from, updateEq } = profilesFrom({
      ...PENDING_EMPTY,
      status: "active",
      member_status: "active",
      terms_accepted_at: "2026-01-01T00:00:00Z",
    });
    const adminSb = { auth: { admin: auth }, from } as unknown as SupabaseClient;

    await reconcileGoogleNativeProviderProfileConflict(adminSb, canonicalUserId, googleUserId, "im2pact@gmail.com");

    expect(updateEq).not.toHaveBeenCalled();
    expect(auth.updateUserById).not.toHaveBeenCalled();
    expect(auth.deleteUser).not.toHaveBeenCalled();
  });
});
