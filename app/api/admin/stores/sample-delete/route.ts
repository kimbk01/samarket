import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { ADMIN_REASON_REQUIRED_CODE } from "@/lib/admin/operator-ux/admin-reason";
import { ADMIN_STORE_REASON_MIN_LENGTH } from "@/lib/admin-business/admin-store-decision-rules";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  parseSampleStoreDeleteIds,
  summarizeSampleStoreDeletePreview,
} from "@/lib/admin-business/sample-store-delete-model";
import {
  executeSampleStoreDelete,
  findSampleStoreDeleteBatchByClientRequestId,
  loadSampleStoreDeletePreview,
} from "@/lib/admin-business/sample-store-delete.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CLIENT_REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,80}$/;

/**
 * 3-C §9-4 — 샘플 매장 삭제 (권한 `business`).
 * `mode: "preview"` → 매장별 사전 확인 + 확인 토큰 (대상 id·건수 해시).
 * `mode: "execute"` → 토큰이 지금 다시 계산한 값과 같을 때만, 매장마다 개별 트랜잭션으로 삭제.
 * 실매장·테스트 매장은 DB 에서 다시 읽은 store_kind 로 삭제 불가 처리 (+ DB 함수 재검증 + BEFORE DELETE 트리거).
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const mode = String(body.mode ?? "").trim();
  if (mode !== "preview" && mode !== "execute") {
    return NextResponse.json({ ok: false, error: "invalid_mode" }, { status: 400 });
  }
  const ids = parseSampleStoreDeleteIds(body.store_ids);
  if (!ids.ok) return NextResponse.json({ ok: false, error: ids.error }, { status: 400 });

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  if (mode === "preview") {
    const preview = await loadSampleStoreDeletePreview(sb, ids.ids);
    if (!preview.ok) {
      return NextResponse.json(
        { ok: false, error: preview.error },
        { status: preview.error === "migration_pending" ? 503 : 500 }
      );
    }
    return NextResponse.json({
      ok: true,
      previews: preview.previews,
      summary: summarizeSampleStoreDeletePreview(preview.previews),
      confirm_token: preview.token,
    });
  }

  const reason = String(body.reason ?? "").trim();
  if (reason.length < ADMIN_STORE_REASON_MIN_LENGTH) {
    return NextResponse.json({ ok: false, error: ADMIN_REASON_REQUIRED_CODE }, { status: 400 });
  }
  const token = String(body.confirm_token ?? "").trim();
  if (!token) return NextResponse.json({ ok: false, error: "confirm_token_required" }, { status: 400 });
  const crRaw = String(body.client_request_id ?? "").trim();
  const clientRequestId = CLIENT_REQUEST_ID_RE.test(crRaw) ? crRaw : null;

  // ⑥ 같은 요청 재전송 — 이전 실행 결과를 그대로 (재실행 없음)
  if (clientRequestId) {
    const prior = await findSampleStoreDeleteBatchByClientRequestId(sb, clientRequestId);
    if (prior) {
      return NextResponse.json({ ok: true, duplicate: true, results: prior.results });
    }
  }

  const preview = await loadSampleStoreDeletePreview(sb, ids.ids);
  if (!preview.ok) {
    return NextResponse.json(
      { ok: false, error: preview.error },
      { status: preview.error === "migration_pending" ? 503 : 500 }
    );
  }
  if (preview.token !== token) {
    return NextResponse.json(
      {
        ok: false,
        error: "preview_changed",
        previews: preview.previews,
        summary: summarizeSampleStoreDeletePreview(preview.previews),
        confirm_token: preview.token,
      },
      { status: 409 }
    );
  }

  const actorId = (await getRouteUserId()) ?? gate.actor.userId;
  const out = await executeSampleStoreDelete({
    sb,
    previews: preview.previews,
    actorId,
    requestMeta: getAuditRequestMeta(req),
    reason,
    clientRequestId,
  });
  return NextResponse.json({ ok: true, results: out.results, summary: out.summary });
}
