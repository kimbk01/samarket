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
  LAUNCH_INTRO_POOL_NAME_MAX,
  LAUNCH_INTRO_POOL_POLICY_KEY,
  normalizeLaunchIntroPoolKind,
  normalizeLaunchIntroPoolPolicy,
  selectLiveLaunchIntroPoolRows,
  validateLaunchIntroPoolInput,
  type LaunchIntroEventType,
  type LaunchIntroPoolImageMime,
  type LaunchIntroPoolInput,
  type LaunchIntroPoolKind,
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
  /** 마이그레이션 20271117140000 전이면 열이 없어 'ad' 로 채운다 */
  kind: LaunchIntroPoolKind;
  created_at: string;
  updated_at: string;
};

/**
 * 앱 진입 어드민 v3: `kind` 열은 운영 DB 에 아직 없을 수 있다 — 열 이름을 고정하지 않고 `*` 로 읽은 뒤
 * `normalizeLaunchIntroPoolRow` 가 `kind` 를 'ad' 로 채운다(열 목록을 고정하면 열이 없을 때 읽기 전체가 실패한다).
 */
const COLS = "*";

export function normalizeLaunchIntroPoolRow(raw: unknown): LaunchIntroPoolRow {
  const r = (raw ?? {}) as Record<string, unknown>;
  const rest = { ...r };
  delete rest.created_by;
  return { ...(rest as unknown as LaunchIntroPoolRow), kind: normalizeLaunchIntroPoolKind(r.kind) };
}

/** 열 없음 오류(PostgREST 스키마 캐시 PGRST204 · Postgres 42703)가 `kind` 열 때문인가 */
export function isMissingKindColumnError(
  error: { code?: string | null; message?: string | null } | null | undefined
): boolean {
  if (!error) return false;
  if (error.code !== "PGRST204" && error.code !== "42703") return false;
  return /\bkind\b/.test(String(error.message ?? ""));
}

type WriteError = { code?: string; message?: string } | null;

/**
 * `kind` 를 쓰는 저장 — 열이 없으면: 'ad'(= 열 기본값)는 `kind` 를 빼고 한 번 더, 다른 종류는 `kindMissing`.
 * `write` 는 같은 조건으로 다시 부를 수 있어야 한다(조건부 갱신 · 삽입).
 */
export async function writeLaunchIntroPoolWithKindTolerance<T>(
  row: Record<string, unknown>,
  write: (row: Record<string, unknown>) => PromiseLike<{ data: T | null; error: WriteError }>
): Promise<{ data: T | null; error: WriteError; kindMissing: boolean }> {
  const first = await write(row);
  if (!("kind" in row) || !isMissingKindColumnError(first.error)) return { ...first, kindMissing: false };
  if (row.kind !== "ad") return { data: null, error: first.error, kindMissing: true };
  const withoutKind = { ...row };
  delete withoutKind.kind;
  const second = await write(withoutKind);
  return { ...second, kindMissing: false };
}

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
  return { ok: true, rows: (data ?? []).map(normalizeLaunchIntroPoolRow) };
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
  // 종류를 안 보내면 열 기본값 'ad' — 「광고」 표기를 끈 채 만들 수 없다
  if ((v.row.kind ?? "ad") === "ad" && v.row.show_ad_label === false) return rejectWithDraftCleanup("ad_label_required");
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
  const { data, error, kindMissing } = await writeLaunchIntroPoolWithKindTolerance(
    {
      ...v.row,
      status: v.row.status ?? "paused",
      image_path: path,
      image_sha256: sha256,
      image_mime: mime,
      image_bytes: bytes.length,
      image_width: info.width,
      image_height: info.height,
      created_by: actor,
    },
    (row) => sb.from("launch_intro_creatives").insert(row).select(COLS).single()
  );
  if (error || !data) {
    await removeUnreferencedLaunchIntroImage(sb, path, sha256);
    if (kindMissing) return rejectWithDraftCleanup("kind_column_missing", 409);
    return { ok: false, error: "save_failed", status: 500 };
  }
  await sb.storage.from(LAUNCH_INTRO_DRAFT_BUCKET).remove([draftPath as string]);
  return { ok: true, row: normalizeLaunchIntroPoolRow(data) };
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
  const before = normalizeLaunchIntroPoolRow(cur.data);
  if (!expectedUpdatedAt || !sameRevision(before.updated_at, expectedUpdatedAt)) return { ok: false, error: "stale_revision", status: 409 };
  const next = { ...before, ...v.row } as LaunchIntroPoolRow;
  if (next.start_at && next.end_at && next.start_at >= next.end_at) return { ok: false, error: "window_invalid", status: 400 };
  // 종류·표기를 바꾸는 저장만 검사(표기를 끈 예전 소재의 순서·켜기 저장은 막지 않는다)
  if (("kind" in v.row || "show_ad_label" in v.row) && next.kind === "ad" && next.show_ad_label === false) {
    return { ok: false, error: "ad_label_required", status: 400 };
  }
  const { data, error, kindMissing } = await writeLaunchIntroPoolWithKindTolerance<unknown[]>(
    { ...v.row, updated_at: new Date().toISOString() },
    (row) => sb.from("launch_intro_creatives").update(row).eq("id", id).eq("updated_at", before.updated_at).select(COLS)
  );
  if (kindMissing) return { ok: false, error: "kind_column_missing", status: 409 };
  if (error) return { ok: false, error: "save_failed", status: 500 };
  if (!data?.length) return { ok: false, error: "stale_revision", status: 409 };
  return { ok: true, row: normalizeLaunchIntroPoolRow(data[0]), before };
}

/** 삭제 — 켜진 소재는 거절(먼저 끄기). 그림은 다른 소재·게시본이 안 쓰면 지운다(저장 누수 방지) */
export async function deleteLaunchIntroPoolCreative(sb: Sb, id: string): Promise<R<{ before: LaunchIntroPoolRow }>> {
  const cur = await sb.from("launch_intro_creatives").select(COLS).eq("id", id).maybeSingle();
  if (cur.error) return { ok: false, error: "read_failed", status: 500 };
  if (!cur.data) return { ok: false, error: "not_found", status: 404 };
  const row = normalizeLaunchIntroPoolRow(cur.data);
  if (row.status === "active") return { ok: false, error: "active_cannot_delete", status: 409 };
  const del = await sb.from("launch_intro_creatives").delete().eq("id", id);
  if (del.error) return { ok: false, error: "delete_failed", status: 500 };
  await removeUnreferencedLaunchIntroImage(sb, row.image_path, row.image_sha256);
  return { ok: true, before: row };
}

/**
 * 복제 — 같은 그림(같은 공개 파일)을 쓰는 새 행 · 꺼짐 · 맨 뒤 순서. 이름은 화면이 화면 언어로 만든다(서버 문구 금지).
 * 그림 파일은 공유한다 — 삭제할 때 `removeUnreferencedLaunchIntroImage` 가 다른 행이 쓰면 남긴다.
 */
export async function duplicateLaunchIntroPoolCreative(
  sb: Sb,
  sourceId: string,
  nameIn: unknown,
  actor: string | null
): Promise<R<{ row: LaunchIntroPoolRow }>> {
  const name = typeof nameIn === "string" ? nameIn.trim().slice(0, LAUNCH_INTRO_POOL_NAME_MAX).trim() : "";
  if (!name) return { ok: false, error: "name_invalid", status: 400 };
  const cur = await sb.from("launch_intro_creatives").select(COLS).eq("id", sourceId).maybeSingle();
  if (cur.error) return { ok: false, error: "read_failed", status: 500 };
  if (!cur.data) return { ok: false, error: "not_found", status: 404 };
  const raw = cur.data as Record<string, unknown>;
  const src = normalizeLaunchIntroPoolRow(raw);
  const last = await sb
    .from("launch_intro_creatives")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1);
  if (last.error) return { ok: false, error: "read_failed", status: 500 };
  const maxOrder = Number((last.data?.[0] as { sort_order?: number } | undefined)?.sort_order ?? 0);
  const ended = Boolean(src.end_at && Date.parse(src.end_at) <= Date.now());
  const row: Record<string, unknown> = {
    name,
    status: "paused",
    sort_order: Math.min(100000, (Number.isFinite(maxOrder) ? maxOrder : 0) + 10),
    // 기간이 이미 끝난 원본을 복제하면 기간을 비운다(그대로 두면 만들자마자 「기간 끝남」)
    start_at: ended ? null : src.start_at,
    end_at: ended ? null : src.end_at,
    image_path: src.image_path,
    image_sha256: src.image_sha256,
    image_mime: src.image_mime,
    image_bytes: src.image_bytes,
    image_width: src.image_width,
    image_height: src.image_height,
    background_color: src.background_color,
    duration_ms: src.duration_ms,
    cta_href: src.cta_href,
    show_ad_label: src.show_ad_label,
    created_by: actor,
  };
  // 열이 있을 때만 종류를 옮긴다(없으면 기본 'ad' — 원본도 'ad' 로 읽힌 상태)
  if ("kind" in raw) row.kind = src.kind;
  const { data, error } = await sb.from("launch_intro_creatives").insert(row).select(COLS).single();
  if (error || !data) return { ok: false, error: "save_failed", status: 500 };
  return { ok: true, row: normalizeLaunchIntroPoolRow(data) };
}

export type LaunchIntroPoolOrderItem = { id: string; expectedUpdatedAt: string; sortOrder: number };

const POOL_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateLaunchIntroPoolOrder(
  raw: unknown
): { ok: true; items: LaunchIntroPoolOrderItem[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 200) return { ok: false, error: "order_invalid" };
  const seen = new Set<string>();
  const items: LaunchIntroPoolOrderItem[] = [];
  for (const it of raw) {
    const o = (it ?? {}) as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    if (!POOL_UUID_RE.test(id) || seen.has(id)) return { ok: false, error: "order_invalid" };
    if (typeof o.expectedUpdatedAt !== "string" || !o.expectedUpdatedAt) return { ok: false, error: "order_invalid" };
    if (typeof o.sortOrder !== "number" || !Number.isInteger(o.sortOrder) || Math.abs(o.sortOrder) > 100000) {
      return { ok: false, error: "sort_order_invalid" };
    }
    seen.add(id);
    items.push({ id, expectedUpdatedAt: o.expectedUpdatedAt, sortOrder: o.sortOrder });
  }
  return { ok: true, items };
}

/**
 * 순서 저장(한 요청) — 먼저 모든 행의 판(updated_at)을 확인해 하나라도 다르면 아무것도 쓰지 않고 409.
 * 그 다음 바뀐 행만 조건부 갱신(읽은 판일 때만). 확인과 쓰기 사이에 다른 관리자가 저장한 행이 있으면 거기서 멈추고 409
 * (그 앞 행은 순서 값만 바뀐 상태 — 화면은 409 에 다시 불러와 실제 순서를 보여 준다).
 */
export async function reorderLaunchIntroPoolCreatives(
  sb: Sb,
  items: readonly LaunchIntroPoolOrderItem[]
): Promise<R<{ before: Record<string, number>; after: Record<string, number> }>> {
  const cur = await sb
    .from("launch_intro_creatives")
    .select("id, sort_order, updated_at")
    .in(
      "id",
      items.map((i) => i.id)
    );
  if (cur.error) return { ok: false, error: "read_failed", status: 500 };
  const byId = new Map(
    ((cur.data ?? []) as { id: string; sort_order: number; updated_at: string }[]).map((r) => [r.id, r] as const)
  );
  for (const it of items) {
    const row = byId.get(it.id);
    if (!row) return { ok: false, error: "not_found", status: 404 };
    if (!sameRevision(row.updated_at, it.expectedUpdatedAt)) return { ok: false, error: "stale_revision", status: 409 };
  }
  const before: Record<string, number> = {};
  const after: Record<string, number> = {};
  const now = new Date().toISOString();
  for (const it of items) {
    const row = byId.get(it.id)!;
    if (row.sort_order === it.sortOrder) continue;
    const { data, error } = await sb
      .from("launch_intro_creatives")
      .update({ sort_order: it.sortOrder, updated_at: now })
      .eq("id", it.id)
      .eq("updated_at", row.updated_at)
      .select("id");
    if (error) return { ok: false, error: "save_failed", status: 500 };
    if (!data?.length) return { ok: false, error: "stale_revision", status: 409 };
    before[it.id] = row.sort_order;
    after[it.id] = it.sortOrder;
  }
  return { ok: true, before, after };
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
