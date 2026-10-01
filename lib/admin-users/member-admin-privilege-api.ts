import type { MemberPrivilegeMutationOp } from "@/lib/admin-users/member-admin-privilege-ssot";
import { memberPrivilegeOperatorErrorKo } from "@/lib/admin-users/member-admin-privilege-ssot";

export type MemberPrivilegeApiResult =
  | {
      ok: true;
      op: MemberPrivilegeMutationOp;
      before: { privilege: string };
      after: { privilege: string };
    }
  | { ok: false; error: string; errorKo: string };

export async function mutateMemberPrivilegeApi(input: {
  userId: string;
  op: MemberPrivilegeMutationOp;
  reason?: string;
}): Promise<MemberPrivilegeApiResult> {
  const res = await fetch(`/api/admin/users/${encodeURIComponent(input.userId)}/privilege`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: input.op, reason: input.reason }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    op?: MemberPrivilegeMutationOp;
    before?: { privilege: string };
    after?: { privilege: string };
    error?: string;
    message?: string;
  };
  if (!res.ok || data.ok === false) {
    const error = data.error ?? data.message ?? "mutation_failed";
    return { ok: false, error, errorKo: memberPrivilegeOperatorErrorKo(error) };
  }
  return {
    ok: true,
    op: data.op ?? input.op,
    before: data.before ?? { privilege: "member" },
    after: data.after ?? { privilege: input.op === "promote" ? "admin" : "member" },
  };
}
