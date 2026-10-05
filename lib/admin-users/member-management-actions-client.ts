/**
 * Shared member management action executor — List Danger/bulk and Detail DangerZone.
 * Reuses existing APIs only (no parallel mutation semantics).
 */

export type MemberManagementActionId =
  | "warn"
  | "suspend"
  | "unsuspend"
  | "block"
  | "unblock"
  | "withdraw"
  | "purge";

export type MemberManagementActionResult = {
  userId: string;
  action: MemberManagementActionId;
  ok: boolean;
  error?: string;
  message?: string;
  blockers?: string[];
};

function mapToModerationApiAction(
  action: MemberManagementActionId,
): "warn" | "suspend" | "ban" | "restore" | null {
  if (action === "warn") return "warn";
  if (action === "suspend") return "suspend";
  if (action === "block") return "ban";
  if (action === "unsuspend" || action === "unblock") return "restore";
  return null;
}

async function postJson(
  url: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok && data.ok !== false, status: res.status, data };
}

export async function executeMemberManagementAction(input: {
  userId: string;
  action: MemberManagementActionId;
  reason: string;
}): Promise<MemberManagementActionResult> {
  const { userId, action, reason } = input;
  const moderation = mapToModerationApiAction(action);
  if (moderation) {
    const { ok, data } = await postJson(`/api/admin/users/${encodeURIComponent(userId)}/moderation`, {
      action: moderation,
      reason,
    });
    return {
      userId,
      action,
      ok,
      error: typeof data.error === "string" ? data.error : undefined,
      message: typeof data.message === "string" ? data.message : undefined,
    };
  }

  if (action === "withdraw" || action === "purge") {
    const { ok, data } = await postJson(`/api/admin/users/${encodeURIComponent(userId)}/delete`, {
      mode: action === "purge" ? "purge" : "withdraw",
      reason:
        reason ||
        (action === "purge" ? "admin_permanent_delete" : "admin_withdraw"),
    });
    return {
      userId,
      action,
      ok,
      error: typeof data.error === "string" ? data.error : undefined,
      message: typeof data.message === "string" ? data.message : undefined,
      blockers: Array.isArray(data.blockers)
        ? data.blockers.filter((x): x is string => typeof x === "string")
        : undefined,
    };
  }

  return { userId, action, ok: false, error: "unsupported_action" };
}

/**
 * Run the same action across many members. Never collapses partial failure to success.
 */
export async function executeMemberManagementActionsBulk(input: {
  userIds: readonly string[];
  action: MemberManagementActionId;
  reason: string;
}): Promise<{
  results: MemberManagementActionResult[];
  successCount: number;
  failureCount: number;
  allOk: boolean;
}> {
  const results: MemberManagementActionResult[] = [];
  for (const userId of input.userIds) {
    // Sequential: safer for Auth ban/unban compensate paths under load.
    results.push(
      await executeMemberManagementAction({
        userId,
        action: input.action,
        reason: input.reason,
      }),
    );
  }
  const successCount = results.filter((r) => r.ok).length;
  const failureCount = results.length - successCount;
  return {
    results,
    successCount,
    failureCount,
    allOk: failureCount === 0 && successCount === results.length,
  };
}

export function summarizeBulkResults(results: readonly MemberManagementActionResult[]): string {
  const ok = results.filter((r) => r.ok).length;
  const fail = results.length - ok;
  if (fail === 0) return `${ok}명 처리 완료`;
  const errs = results
    .filter((r) => !r.ok)
    .slice(0, 5)
    .map((r) => `${r.userId.slice(0, 8)}…: ${r.message ?? r.error ?? "실패"}`)
    .join("\n");
  return `성공 ${ok} / 실패 ${fail}\n${errs}`;
}
