import { NextRequest } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { NON_OPERATIONAL_SOURCES } from "@/lib/community-operator-import/registry";
import {
  loadManagedSources,
  setManagedSourceEnabled,
  upsertManagedSourceFromVerify,
} from "@/lib/community-operator-import/source-store";
import { canEnableVerification, verifyOperatorSourceUrl } from "@/lib/community-operator-import/source-verify";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApiUser();
  if (!auth.ok) return auth.response;
  try {
    const sb = getSupabaseServer();
    const managed = await loadManagedSources(sb);
    return jsonOk({
      managed,
      diagnostic: NON_OPERATIONAL_SOURCES,
      note: "managed=Admin 등록 출처. 운영 LEFT는 seed+enabled managed 병합.",
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "sources_load_failed", 500, {
      code: "sources_table_missing_or_error",
    });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminApiUser();
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody<{
    action?: string;
    url?: string;
    displayName?: string;
    sourceId?: string;
    enabled?: boolean;
  }>(req, "JSON 본문이 필요합니다.");
  if (!parsed.ok) return parsed.response;

  const action = String(parsed.value.action || "").trim();
  try {
    const sb = getSupabaseServer();

    if (action === "verify") {
      const result = await verifyOperatorSourceUrl(String(parsed.value.url || ""));
      return jsonOk({
        ...result,
        canRegister: canEnableVerification(result.verdict) && result.engine !== "unknown",
        canEnable: canEnableVerification(result.verdict),
        operatorNote: "DOM/CSS/selector 입력 없음. 공개 LIST/DETAIL 증명만 사용.",
      });
    }

    if (action === "register") {
      const verify = await verifyOperatorSourceUrl(String(parsed.value.url || ""));
      if (!canEnableVerification(verify.verdict) || verify.engine === "unknown") {
        return jsonError(`등록 불가: ${verify.verdict} · ${verify.reason}`, 400, {
          code: "cannot_register",
          verify,
        });
      }
      const enabled = parsed.value.enabled !== false;
      const saved = await upsertManagedSourceFromVerify(sb, {
        displayName: String(parsed.value.displayName || "").trim() || verify.url,
        verify,
        enabled,
        adminUserId: auth.userId,
        sourceId: parsed.value.sourceId,
      });
      return jsonOk({ registered: true, source: saved, verify });
    }

    if (action === "enable" || action === "disable") {
      const sourceId = String(parsed.value.sourceId || "").trim();
      if (!sourceId) return jsonError("sourceId 필요", 400, { code: "source_id_required" });
      const saved = await setManagedSourceEnabled(sb, sourceId, action === "enable");
      return jsonOk({ updated: true, source: saved });
    }

    return jsonError("지원 action: verify | register | enable | disable", 400, {
      code: "unsupported_action",
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "sources_action_failed", 500, {
      code: "sources_action_failed",
    });
  }
}
