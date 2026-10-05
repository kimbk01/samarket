import { NextRequest } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { INBOX_STATUSES, type InboxKey, type InboxStatus, listInbox, setInboxStatus } from "@/lib/community-operator-import/inbox-store";
import type { QualityVerdict } from "@/lib/community-operator-import/types";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Inbox list (read-only). Filters: site, board, status (csv), quality, q, since, limit, offset. */
export async function GET(req: NextRequest) {
  const auth = await requireAdminApiUser();
  if (!auth.ok) return auth.response;
  const sp = req.nextUrl.searchParams;
  const statuses = String(sp.get("status") || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is InboxStatus => INBOX_STATUSES.includes(s as InboxStatus));
  const quality = sp.get("quality");
  try {
    const { rows, total } = await listInbox(getSupabaseServer(), {
      sourceSite: sp.get("site") || null,
      sourceBoard: sp.get("board") || null,
      statuses,
      quality: quality === "FULL" || quality === "PARTIAL" || quality === "FAILED" || quality === "none" ? (quality as QualityVerdict | "none") : null,
      q: sp.get("q"),
      since: sp.get("since"),
      limit: Number(sp.get("limit")) || 50,
      offset: Number(sp.get("offset")) || 0,
    });
    return jsonOk({ rows, total });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "inbox_failed", 500, { code: "inbox_failed" });
  }
}

/** {action:"status", keys:[...], status:"hidden"|"skipped"|"new"} — never changes published rows. */
export async function POST(req: NextRequest) {
  const auth = await requireAdminApiUser();
  if (!auth.ok) return auth.response;
  const parsed = await parseJsonBody<{ action?: string; keys?: InboxKey[]; status?: InboxStatus }>(req, "JSON 본문이 필요합니다.");
  if (!parsed.ok) return parsed.response;
  const { action, keys, status } = parsed.value;
  if (action !== "status") return jsonError("지원 action: status", 400, { code: "unsupported_action" });
  if (!status || !["hidden", "skipped", "new"].includes(status)) return jsonError("status: hidden | skipped | new", 400, { code: "invalid_status" });
  const list = (Array.isArray(keys) ? keys : []).slice(0, 200);
  if (!list.length) return jsonError("keys 필요", 400, { code: "keys_required" });
  try {
    const updated = await setInboxStatus(getSupabaseServer(), list, status);
    return jsonOk({ updated });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "inbox_status_failed", 400, { code: "inbox_status_failed" });
  }
}
