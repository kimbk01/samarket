import { describe, expect, it, vi } from "vitest";
import {
  buildWithdrawProfilePatch,
  moderationActionForDeleteMode,
  normalizeAdminUserDeleteMode,
  purgeAuthUserById,
} from "@/lib/admin/admin-user-deletion";

describe("admin-user-deletion", () => {
  it("normalizes legacy soft/hard modes", () => {
    expect(normalizeAdminUserDeleteMode("withdraw")).toBe("withdraw");
    expect(normalizeAdminUserDeleteMode("purge")).toBe("purge");
    expect(normalizeAdminUserDeleteMode("soft")).toBe("withdraw");
    expect(normalizeAdminUserDeleteMode("hard")).toBe("purge");
    expect(normalizeAdminUserDeleteMode("invalid")).toBeNull();
  });

  it("maps moderation audit actions", () => {
    expect(moderationActionForDeleteMode("withdraw")).toBe("soft_delete");
    expect(moderationActionForDeleteMode("purge")).toBe("purge");
  });

  it("builds withdraw patch with anonymization and identity release", () => {
    const patch = buildWithdrawProfilePatch("2026-06-14T00:00:00.000Z");
    expect(patch.status).toBe("deleted");
    expect(patch.nickname).toBe("탈퇴회원");
    expect(patch.email).toBeNull();
    expect(patch.phone).toBeNull();
    expect(patch.username).toBeNull();
    expect(patch.dibay_id).toBeNull();
    expect(patch.provider_user_id).toBeNull();
    expect(patch.onboarding_status).toBe("pending");
    expect(patch.terms_accepted_at).toBeNull();
  });

  it("purgeAuthUserById deletes orphan profile when auth user is missing", async () => {
    const deleteUser = vi.fn().mockResolvedValue({ error: { message: "User not found" } });
    const profileDelete = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const sb = {
      auth: { admin: { deleteUser } },
      from: vi.fn((table: string) => {
        if (table === "profiles") {
          return { delete: profileDelete };
        }
        return {};
      }),
    };

    const result = await purgeAuthUserById(sb as never, "00000000-0000-4000-8000-000000000099");
    expect(result.ok).toBe(true);
    expect(deleteUser).toHaveBeenCalledOnce();
    expect(profileDelete).toHaveBeenCalledOnce();
  });
});
