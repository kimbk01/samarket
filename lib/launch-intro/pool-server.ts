/**
 * 진입 감사 5단계 — 인트로 소재 묶음 서버(service_role). 어드민 라우트·발견 라우트·기록 라우트만 import.
 */
import "server-only";
import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sameRevision } from "@/lib/admin/same-revision";
import {
  LAUNCH_INTRO_DRAFT_BUCKET,
  LAUNCH_INTRO_PUBLIC_BUCKET,
  inspectLaunchIntroAsset,
  launchIntroPublicAssetPath,
} from "@/lib/launch-intro/document";
import {
  DEFAULT_LAUNCH_INTRO_POOL_POLICY,
  LAUNCH_INTRO_EVENT_TYPES,
  LAUNCH_INTRO_POOL_IMAGE_MIMES,
  LAUNCH_INTRO_POOL_MIN_LONG_EDGE,
  LAUNCH_INTRO_POOL_POLICY_KEY,
  normalizeLaunchIntroPoolPolicy,
  selectLiveLaunchIntroPoolRows,
  validateLaunchIntroPoolInput,
  type LaunchIntroEventType,
  type LaunchIntroPoolImageMime,
  type LaunchIntroPoolInput,
  type LaunchIntroPoolPayload,
  type LaunchIntroPoolPolicy,
} from "@/lib/launch-intro/pool";

type Sb = SupabaseClient;
type R<T> = ({ ok: true } & T) | { ok: false; error: string; status?: number };

export type LaunchIntroPoolRow = {
  id: string;
  name: string;
  status: string;
  sort_order: number;
  start_at: string | null;
  end_at: string | null;
  image_path: string;
  image_sha256: string;
  image_mime: string;
  image_bytes: number;
  image_width: number;
  image_height: number;
  background_color: string;
  duration_ms: number;
  cta_href: string | null;
  show_ad_label: boolean;
  created_at: string;
  updated_at: string;
};

const COLS =
  "id, name, status, sort_order, start_at, end_at, image_path, image_sha256, image_mime, image_bytes, image_width, image_height, background_color, duration_ms, cta_href, show_ad_label, created_at, updated_at";

export async function loadLaunchIntroPoolPolicy(
  sb: Sb
): Promise<R<{ policy: LaunchIntroPoolPolicy; revision: string | null }>> {
  const { data, error } = await sb
    .from("admin_settings")
    .select("value_json, updated_at")
    .eq("key", LAUNCH_INTRO_POOL_POLICY_KEY)
    .maybeSingle();
  if (error) return { ok: false, error: "policy_read_failed", status: 503 };
  const row = data as { value_json?: unknown; updated_at?: string | null } | null;
  if (!row?.value_json) return { ok: true, policy: { ...DEFAULT_LAUNCH_INTRO_POOL_POLICY }, revision: null };
  return { ok: true, policy: normalizeLaunchIntroPoolPolicy(row.value_json), revision: row.updated_at ?? null };
}

/** 저장 — 읽은 판과 다르면 409(다른 관리자 저장 덮어쓰기 금지) */
export async function saveLaunchIntroPoolPolicy(
  sb: Sb,
  policy: LaunchIntroPoolPolicy,
  expectedRevision: string | null
): Promise<R<{ revision: string; before: LaunchIntroPoolPolicy }>> {
  const cur = await loadLaunchIntroPoolPolicy(sb);
  if (!cur.ok) return cur;
  if (!sameRevision(cur.revision, expectedRevision)) return { ok: false, error: "stale_revision", status: 409 };
  const now = new Date().toISOString();
  if (expectedRevision === null) {
    const { error } = await sb
      .from("admin_settings")
      .insert({ key: LAUNCH_INTRO_POOL_POLICY_KEY, value_json: policy, updated_at: now });
    if (error) return { ok: false, error: error.code === "23505" ? "stale_revision" : "save_failed", status: error.code === "23505" ? 409 : 500 };
  } else {
    const { data, error } = await sb
      .from("admin_settings")
      .update({ value_json: policy, updated_at: now })
      .eq("key", LAUNCH_INTRO_POOL_POLICY_KEY)
      .eq("updated_at", cur.revision as string)
      .select("key");
    if (error) return { ok: false, error: "save_failed", status: 500 };
    if (!data?.length) return { ok: false, error: "stale_revision", status: 409 };
  }
  return { ok: true, revision: now, before: cur.policy };
}

export async function listLaunchIntroPoolRows(sb: Sb): Promise<R<{ rows: LaunchIntroPoolRow[] }>> {
  const { data, error } = await sb
    .from("launch_intro_creatives")
    .select(COLS)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(200);
  // 마이그레이션 전(표 없음) = 묶음 없음 — 기존 인트로는 그대로
  // (PostgREST: 표가 스키마에 없으면 PGRST205 · Postgres 42P01)
  if (error) {
    return error.code === "42P01" || error.code === "PGRST205"
      ? { ok: true, rows: [] }
      : { ok: false, error: "pool_read_failed", status: 500 };
  }
  return { ok: true, rows: (data ?? []) as LaunchIntroPoolRow[] };
}

/** 발견 응답의 `pool` — 읽기 실패면 null(기기는 이전 저장을 유지) */
export async function buildLaunchIntroPoolPayload(sb: Sb): Promise<LaunchIntroPoolPayload | null> {
  const [policy, rows] = await Promise.all([loadLaunchIntroPoolPolicy(sb), listLaunchIntroPoolRows(sb)]);
  if (!policy.ok || !rows.ok) return null;
  const live = policy.policy.enabled ? selectLiveLaunchIntroPoolRows(rows.rows) : [];
  const entries = live.map((r) => ({
    id: r.id,
    url: sb.storage.from(LAUNCH_INTRO_PUBLIC_BUCKET).getPublicUrl(r.image_path).data.publicUrl,
    sha256: r.image_sha256,
    mime: r.image_mime as LaunchIntroPoolImageMime,
    bgColor: r.background_color,
    durationMs: r.duration_ms,
    ctaHref: r.cta_href,
    showAdLabel: r.show_ad_label,
    startAtMs: r.start_at ? Date.parse(r.start_at) : 0,
    endAtMs: r.end_at ? Date.parse(r.end_at) : 0,
    sortOrder: r.sort_order,
  }));
  const revision = createHash("sha256")
    .update(JSON.stringify([policy.policy, entries.map((e) => ({ ...e, url: undefined }))]))
    .digest("hex")
    .slice(0, 16);
  return { enabled: policy.policy.enabled && entries.length > 0, showOnOsRestore: policy.policy.showOnOsRestore, revision, entries };
}

/** 어드민 새 소재 — 초안 업로드(검사 끝난 그림)를 공개 저장소로 옮긴 뒤 행 생성 */
export async function createLaunchIntroPoolCreative(
  sb: Sb,
  input: LaunchIntroPoolInput & { draftPath?: unknown },
  actor: string | null
): Promise<R<{ row: LaunchIntroPoolRow }>> {
  const draftPath = input.draftPath;
  const validDraft = typeof draftPath === "string" && /^draft\/[0-9a-f-]{36}\.(png|jpg|webp|gif|mp4)$/.test(draftPath);
  // 재감사 M1: 거절해도 방금 올린 초안 파일은 지운다(초안 저장소 누수)
  const rejectWithDraftCleanup = async (error: string, status = 400) => {
    if (validDraft) await sb.storage.from(LAUNCH_INTRO_DRAFT_BUCKET).remove([draftPath as string]);
    return { ok: false as const, error, status };
  };
  const v = validateLaunchIntroPoolInput(input, { partial: false });
  if (!v.ok) return rejectWithDraftCleanup(v.error);
  if (!validDraft || !/\.(png|jpg|webp)$/.test(draftPath as string)) return rejectWithDraftCleanup("image_type_invalid");
  const dl = await sb.storage.from(LAUNCH_INTRO_DRAFT_BUCKET).download(draftPath as string);
  if (dl.error || !dl.data) return { ok: false, error: "draft_image_missing", status: 400 };
  const bytes = new Uint8Array(await dl.data.arrayBuffer());
  const info = inspectLaunchIntroAsset(bytes);
  if (!info.ok || info.kind !== "image" || !(LAUNCH_INTRO_POOL_IMAGE_MIMES as readonly string[]).includes(info.mime)) {
    return rejectWithDraftCleanup("image_type_invalid");
  }
  if (Math.max(info.width, info.height) < LAUNCH_INTRO_POOL_MIN_LONG_EDGE) {
    return rejectWithDraftCleanup("fullscreen_image_too_small");
  }
  const mime = info.mime as LaunchIntroPoolImageMime;
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const path = launchIntroPublicAssetPath(sha256, mime);
  const up = await sb.storage
    .from(LAUNCH_INTRO_PUBLIC_BUCKET)
    .upload(path, bytes, { contentType: mime, cacheControl: "31536000", upsert: false });
  if (up.error && !/exists|duplicate/i.test(up.error.message)) return rejectWithDraftCleanup("asset_copy_failed", 500);
  const { data, error } = await sb
    .from("launch_intro_creatives")
    .insert({
      ...v.row,
      status: v.row.status ?? "paused",
      image_path: path,
      image_sha256: sha256,
      image_mime: mime,
      image_bytes: bytes.length,
      image_width: info.width,
      image_height: info.height,
      created_by: actor,
    })
    .select(COLS)
    .single();
  if (error || !data) {
    await removeUnreferencedLaunchIntroImage(sb, path, sha256);
    return { ok: false, error: "save_failed", status: 500 };
  }
  await sb.storage.from(LAUNCH_INTRO_DRAFT_BUCKET).remove([draftPath as string]);
  return { ok: true, row: data as LaunchIntroPoolRow };
}

/** 수정 — 읽은 updated_at 과 다르면 409 */
export async function updateLaunchIntroPoolCreative(
  sb: Sb,
  id: string,
  input: LaunchIntroPoolInput,
  expectedUpdatedAt: string | null
): Promise<R<{ row: LaunchIntroPoolRow; before: LaunchIntroPoolRow }>> {
  const v = validateLaunchIntroPoolInput(input, { partial: true });
  if (!v.ok) return { ok: false, error: v.error, status: 400 };
  const cur = await sb.from("launch_intro_creatives").select(COLS).eq("id", id).maybeSingle();
  if (cur.error) return { ok: false, error: "read_failed", status: 500 };
  if (!cur.data) return { ok: false, error: "not_found", status: 404 };
  const before = cur.data as LaunchIntroPoolRow;
  if (!expectedUpdatedAt || !sameRevision(before.updated_at, expectedUpdatedAt)) return { ok: false, error: "stale_revision", status: 409 };
  const next = { ...before, ...v.row } as LaunchIntroPoolRow;
  if (next.start_at && next.end_at && next.start_at >= next.end_at) return { ok: false, error: "window_invalid", status: 400 };
  const { data, error } = await sb
    .from("launch_intro_creatives")
    .update({ ...v.row, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("updated_at", before.updated_at)
    .select(COLS);
  if (error) return { ok: false, error: "save_failed", status: 500 };
  if (!data?.length) return { ok: false, error: "stale_revision", status: 409 };
  return { ok: true, row: data[0] as LaunchIntroPoolRow, before };
}

/** 삭제 — 켜진 소재는 거절(먼저 끄기). 그림은 다른 소재·게시본이 안 쓰면 지운다(저장 누수 방지) */
export async function deleteLaunchIntroPoolCreative(sb: Sb, id: string): Promise<R<{ before: LaunchIntroPoolRow }>> {
  const cur = await sb.from("launch_intro_creatives").select(COLS).eq("id", id).maybeSingle();
  if (cur.error) return { ok: false, error: "read_failed", status: 500 };
  if (!cur.data) return { ok: false, error: "not_found", status: 404 };
  const row = cur.data as LaunchIntroPoolRow;
  if (row.status === "active") return { ok: false, error: "active_cannot_delete", status: 409 };
  const del = await sb.from("launch_intro_creatives").delete().eq("id", id);
  if (del.error) return { ok: false, error: "delete_failed", status: 500 };
  await removeUnreferencedLaunchIntroImage(sb, row.image_path, row.image_sha256);
  return { ok: true, before: row };
}

/** 그림 파일을 아무도 안 쓸 때만 지운다. 확인 못 하면 지우지 않는다(실패 시 보존). */
async function removeUnreferencedLaunchIntroImage(sb: Sb, path: string, sha256: string): Promise<void> {
  try {
    const pool = await sb.from("launch_intro_creatives").select("id").eq("image_sha256", sha256).limit(1);
    if (pool.error || (pool.data?.length ?? 0) > 0) return;
    // 재감사 L2: 게시본 전체(개수 제한 없이)에서 같은 그림을 쓰는지 — jsonb 포함 검사
    const pubs = await sb
      .from("launch_intro_publications")
      .select("id")
      .contains("assets", [{ sha256 }])
      .limit(1);
    if (pubs.error || (pubs.data?.length ?? 0) > 0) return;
    await sb.storage.from(LAUNCH_INTRO_PUBLIC_BUCKET).remove([path]);
  } catch {
    /* 보존 */
  }
}

/** 소재별 노출·건너뛰기·누름·완료 수(최근 30일) */
export async function loadLaunchIntroPoolStats(
  sb: Sb,
  idsIn: string[]
): Promise<Record<string, Record<LaunchIntroEventType, number>>> {
  const out: Record<string, Record<LaunchIntroEventType, number>> = {};
  let ids = idsIn;
  if (!ids.length) return out;
  // 재감사 M2: 소재 × 4 개수 조회 — 목록 화면에서 켜짐·꺼짐 소재 최대 20개만(종료 소재는 0 표시)
  ids = ids.slice(0, 20);
  const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
  await Promise.all(
    ids.flatMap((id) =>
      LAUNCH_INTRO_EVENT_TYPES.map(async (t) => {
        const { count } = await sb
          .from("launch_intro_events")
          .select("id", { count: "exact", head: true })
          .eq("creative_id", id)
          .eq("event_type", t)
          .gte("created_at", since);
        (out[id] ??= { impression: 0, skip: 0, click: 0, complete: 0 })[t] = count ?? 0;
      })
    )
  );
  return out;
}

export async function recordLaunchIntroEvent(
  sb: Sb,
  input: {
    creativeId: string;
    eventType: LaunchIntroEventType;
    renderer: "native" | "web";
    platform: string | null;
    exposureId: string;
    deviceKey: string | null;
    userId: string | null;
    meta?: Record<string, unknown>;
  }
): Promise<R<object>> {
  // 재감사 L6: 존재 확인은 외래 키(23503)로 — 조회 1번 줄임
  const { error } = await sb.from("launch_intro_events").insert({
    creative_id: input.creativeId,
    event_type: input.eventType,
    renderer: input.renderer,
    platform: input.platform,
    exposure_id: input.exposureId,
    device_key: input.deviceKey,
    user_id: input.userId,
    meta: input.meta ?? {},
  });
  // 같은 노출의 같은 기록 = 이미 저장됨(정상)
  if (error?.code === "23503") return { ok: false, error: "creative_not_found", status: 404 };
  if (error && error.code !== "23505") return { ok: false, error: "save_failed", status: 500 };
  return { ok: true };
}
