import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isGoogleNativeSyntheticAuthEmail,
  reclaimGoogleNativeSyntheticAuthOrphan,
  reconcileGoogleNativeProviderProfileConflict,
  resolveGoogleNativeSignInEmail,
} from "@/lib/auth/native/reconcile-google-native-orphan.server";

const findAuthUserByEmail = vi.fn();

vi.mock("@/lib/auth/naver-oauth", () => ({
  findAuthUserByEmail: (...args: unknown[]) => findAuthUserByEmail(...args),
}));

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

  it("deletes synthetic orphan auth user blocking canonical profile update", async () => {
    const canonicalUserId = "1a3179f4-9e9b-4b11-98b2-e124932c58bd";
    const orphanId = "08224de9-953e-4219-8ead-f30d7201dafb";
    const googleUserId = "107373086399795697553";
    const deleteUser = vi.fn(async () => ({ error: null }));

    findAuthUserByEmail.mockResolvedValue({
      id: orphanId,
      email: `google.${googleUserId}@google.native.dibay.internal`,
    });

    const from = vi.fn((table: string) => {
      if (table !== "profiles") return {};
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: orphanId,
                status: "sns_pending",
                provider: "google",
                auth_provider: "google",
                provider_user_id: googleUserId,
              },
              error: null,
            }),
          }),
        }),
      };
    });

    const adminSb = {
      auth: { admin: { deleteUser } },
      from,
    } as unknown as SupabaseClient;

    await reclaimGoogleNativeSyntheticAuthOrphan(adminSb, canonicalUserId, googleUserId);

    expect(deleteUser).toHaveBeenCalledWith(orphanId);
  });

  it("clears provider identity from orphan profile before canonical user claims Google sub", async () => {
    const canonicalUserId = "1a3179f4-9e9b-4b11-98b2-e124932c58bd";
    const orphanProfileId = "08224de9-953e-4219-8ead-f30d7201dafb";
    const googleUserId = "107373086399795697553";
    const updateEq = vi.fn(async () => ({ error: null }));
    const deleteUser = vi.fn(async () => ({ error: null }));

    const from = vi.fn((table: string) => {
      if (table !== "profiles") return {};
      return {
        select: () => ({
          eq: (col: string, val: unknown) => {
            if (col === "provider" && val === "google") {
              return {
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: orphanProfileId, status: "sns_pending", deleted_at: null },
                    error: null,
                  }),
                }),
              };
            }
            if (col === "id" && val === orphanProfileId) {
              return {
                maybeSingle: async () => ({
                  data: {
                    id: orphanProfileId,
                    status: "sns_pending",
                    email: "im2pact@gmail.com",
                    auth_login_email: "im2pact@gmail.com",
                    provider: "google",
                    auth_provider: "google",
                    provider_user_id: googleUserId,
                  },
                  error: null,
                }),
              };
            }
            return { maybeSingle: async () => ({ data: null, error: null }) };
          },
        }),
        update: () => ({ eq: updateEq }),
      };
    });

    const adminSb = {
      auth: { admin: { deleteUser } },
      from,
    } as unknown as SupabaseClient;

    await reconcileGoogleNativeProviderProfileConflict(
      adminSb,
      canonicalUserId,
      googleUserId,
      "im2pact@gmail.com",
    );

    expect(updateEq).toHaveBeenCalledWith("id", orphanProfileId);
    expect(deleteUser).toHaveBeenCalledWith(orphanProfileId);
  });
});
