import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  lookupProfileIdByVerifiedGoogleEmail,
  resolveGoogleNativeExistingUserId,
} from "@/lib/auth/native/resolve-google-native-existing-user.server";

const findAuthUserByEmail = vi.fn();

vi.mock("@/lib/auth/naver-oauth", () => ({
  findAuthUserByEmail: (...args: unknown[]) => findAuthUserByEmail(...args),
}));

type ProfileRow = {
  id: string;
  provider?: string;
  auth_provider?: string;
  status?: string;
  deleted_at?: string | null;
  email?: string;
  auth_login_email?: string;
};

function profileStatusRow(row: ProfileRow) {
  return { id: row.id, status: row.status ?? "sns_pending", deleted_at: row.deleted_at ?? null };
}

function buildProfilesSupabaseMock(rows: ProfileRow[]) {
  const from = vi.fn((table: string) => {
    if (table !== "profiles") {
      return { update: () => ({ eq: async () => ({ error: null }) }) };
    }

    const select = () => ({
      eq: (col: string, val: unknown) => {
        if (col === "provider") {
          const chained = {
            eq: (col2: string, val2: unknown) => {
              if (col2 === "provider_user_id") {
                const match = rows.find(
                  (row) => row.provider === val && (row as ProfileRow & { provider_user_id?: string }).provider_user_id === val2,
                );
                return {
                  maybeSingle: async () => ({
                    data: match ? profileStatusRow(match) : null,
                    error: null,
                  }),
                };
              }
              return { maybeSingle: async () => ({ data: null, error: null }) };
            },
            or: () => ({
              limit: async () => ({
                data: rows
                  .filter((row) => row.provider === val)
                  .map(profileStatusRow),
                error: null,
              }),
            }),
            maybeSingle: async () => ({ data: null, error: null }),
            limit: async () => ({ data: [], error: null }),
          };
          return chained;
        }
        if (col === "id") {
          const row = rows.find((entry) => entry.id === val);
          const rowData = row
            ? {
                ...row,
                status: row.status ?? "sns_pending",
                deleted_at: row.deleted_at ?? null,
              }
            : null;
          return {
            maybeSingle: async () => ({ data: rowData, error: null }),
            in: async (_c: string, ids: string[]) => ({
              data: rows.filter((entry) => ids.includes(entry.id)),
              error: null,
            }),
          };
        }
      },
      ilike: () => ({
        limit: async () => ({
          data: rows.map(profileStatusRow),
          error: null,
        }),
      }),
      in: (col: string, ids: string[]) => ({
        limit: async () => ({
          data: rows.filter((row) => ids.includes(row.id)),
          error: null,
        }),
        then: undefined,
      }),
    });

    return { select, update: () => ({ eq: async () => ({ error: null }) }) };
  });

  return {
    from,
    auth: { admin: { listUsers: vi.fn(async () => ({ data: { users: [] }, error: null })) } },
  } as unknown as SupabaseClient;
}

describe("resolve-google-native-existing-user", () => {
  it("finds a single existing profile by verified Gmail (im2pact@gmail.com style)", async () => {
    const profileId = "profile-im2pact";
    const adminSb = buildProfilesSupabaseMock([
      { id: profileId, provider: "email", auth_provider: "email" },
    ]);

    const lookup = await lookupProfileIdByVerifiedGoogleEmail(adminSb, {
      googleUserId: "sub-im2pact",
      audience: "aud",
      email: "im2pact@gmail.com",
      emailVerified: true,
    });

    expect(lookup).toEqual({ status: "found", profileId });
  });

  it("prefers canonical profile when the same Gmail also has reclaimable google orphan rows", async () => {
    const canonicalProfileId = "profile-im2pact";
    const orphanProfileId = "profile-orphan-email-dup";
    const adminSb = buildProfilesSupabaseMock([
      {
        id: orphanProfileId,
        provider: "google",
        auth_provider: "google",
        provider_user_id: "sub-orphan",
        status: "sns_pending",
      } as ProfileRow & { provider_user_id: string },
      { id: canonicalProfileId, provider: "email", auth_provider: "email", status: "active" },
    ]);
    findAuthUserByEmail.mockResolvedValue({ id: canonicalProfileId, email: "im2pact@gmail.com" });

    const lookup = await lookupProfileIdByVerifiedGoogleEmail(adminSb, {
      googleUserId: "sub-im2pact",
      audience: "aud",
      email: "im2pact@gmail.com",
      emailVerified: true,
    });

    expect(lookup).toEqual({ status: "found", profileId: canonicalProfileId });
  });

  it("returns ambiguous when the same Gmail maps to multiple profiles without a unique google tag", async () => {
    const adminSb = buildProfilesSupabaseMock([
      { id: "profile-a", provider: "email", auth_provider: "email" },
      { id: "profile-b", provider: "kakao", auth_provider: "kakao" },
    ]);

    const lookup = await lookupProfileIdByVerifiedGoogleEmail(adminSb, {
      googleUserId: "sub-imobong",
      audience: "aud",
      email: "imobong88@gmail.com",
      emailVerified: true,
    });

    expect(lookup.status).toBe("ambiguous");
    if (lookup.status === "ambiguous") {
      expect(lookup.candidateIds).toEqual(["profile-a", "profile-b"]);
    }
  });

  it("prefers verified Gmail canonical profile when Google sub is only on reclaimable orphan profile", async () => {
    const canonicalProfileId = "profile-im2pact";
    const orphanProfileId = "profile-orphan-sub";
    const googleUserId = "sub-im2pact";
    const adminSb = buildProfilesSupabaseMock([
      {
        id: orphanProfileId,
        provider: "google",
        auth_provider: "google",
        provider_user_id: googleUserId,
        status: "sns_pending",
      } as ProfileRow & { provider_user_id: string },
      { id: canonicalProfileId, provider: "email", auth_provider: "email" },
    ]);
    findAuthUserByEmail.mockResolvedValue(null);

    const resolved = await resolveGoogleNativeExistingUserId(adminSb, {
      googleUserId,
      audience: "aud",
      email: "im2pact@gmail.com",
      emailVerified: true,
    });

    expect(resolved).toEqual({
      status: "found",
      userId: canonicalProfileId,
      match: "verified_email",
    });
  });

  it("prefers provider_user_id match before verified Gmail when provider profile is canonical", async () => {
    const subProfileId = "profile-by-sub";
    const adminSb = buildProfilesSupabaseMock([
      {
        id: subProfileId,
        provider: "google",
        auth_provider: "google",
        provider_user_id: "sub-exact",
      } as ProfileRow & { provider_user_id: string },
    ]);
    findAuthUserByEmail.mockResolvedValue(null);

    const resolved = await resolveGoogleNativeExistingUserId(adminSb, {
      googleUserId: "sub-exact",
      audience: "aud",
      email: "im2pact@gmail.com",
      emailVerified: true,
    });

    expect(resolved).toEqual({
      status: "found",
      userId: subProfileId,
      match: "provider_user_id",
    });
  });

  it("returns ambiguous_email from resolve when Gmail lookup is ambiguous", async () => {
    const adminSb = buildProfilesSupabaseMock([
      { id: "dup-a", provider: "email", auth_provider: "email" },
      { id: "dup-b", provider: "naver", auth_provider: "naver" },
    ]);
    findAuthUserByEmail.mockResolvedValue(null);

    const resolved = await resolveGoogleNativeExistingUserId(adminSb, {
      googleUserId: "sub-new",
      audience: "aud",
      email: "imobong88@gmail.com",
      emailVerified: true,
    });

    expect(resolved).toEqual({
      status: "ambiguous_email",
      candidateIds: ["dup-a", "dup-b"],
    });
  });

  it("returns new when no existing profile or auth user matches", async () => {
    const adminSb = buildProfilesSupabaseMock([]);
    findAuthUserByEmail.mockResolvedValue(null);

    const resolved = await resolveGoogleNativeExistingUserId(adminSb, {
      googleUserId: "sub-brand-new",
      audience: "aud",
      email: "brand.new.user@gmail.com",
      emailVerified: true,
    });

    expect(resolved).toEqual({ status: "new" });
  });
});
