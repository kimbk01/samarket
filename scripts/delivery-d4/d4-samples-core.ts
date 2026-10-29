/**
 * D-4 샘플 매장 70곳 반영 코어 (진입점: apply-d4-samples.ts · 롤백: rollback-d4-samples.ts) (Owner 2026-10-29 승인 · 구성표 `delivery-d4-sample-70-plan-2026-10-29.md`).
 *
 * 기준: 운영 기존 샘플 35곳의 실제 행 구조(2026-10-29 PHT READ ONLY 확인)를 그대로 따른다.
 *   - stores: store_kind='sample' · owner_user_id NULL · approval_status='approved' · 처음엔 is_visible=false 로 만들고
 *     메뉴·이미지가 모두 들어간 뒤 is_visible=true 로 바꾼다(trg_stores_first_listed_at 이 first_listed_at 을 채움 — 기존 bulk_show 와 같은 순서).
 *   - store_sales_permissions: INSERT 트리거(stores_ensure_sales_perm)가 pending·allowed_to_sell=false 행을 만든다. 이 스크립트는 건드리지 않는다
 *     (샘플 승인은 trg_store_sales_permissions_block_sample_approval 이 거부 → 주문 DB 차단 유지).
 *   - 이미지: 오너 업로드와 같은 파이프라인 — processOwnerProductImageBuffer → storeProductListDerivativeOriginalPath
 *     (`{storeId}/{uuid}.l1.webp`) → uploadStoreProductWithHeroDerivative(hero·feed 파생본) → 공개 URL 저장.
 *   - 커버리지 rebuildStoreDeliveryCoverageForStore · 스케줄 projection refreshDiscoveryScheduleProjectionForStoreId.
 *   - 감사: audit_logs (기존 시드와 같은 action 이름: store.sample.create / image_upload / profile_update /
 *     menu_section_create / product_create / bulk_show).
 *   - 이미 같은 이름(store_name)의 샘플이 있으면 건너뜀(재실행 안전). 같은 slug 가 다른 매장에 있으면 중단.
 *   - 매장 단위 실패 시 그 매장만 롤백: 올린 Storage 경로 삭제 + admin_delete_sample_store 로 행 삭제(CASCADE).
 *
 * 실행 (작업 폴더에서):
 *   set -a; source .env.local; set +a
 *   D4_IMAGE_DIR=<이미지 폴더> npx vite-node --config vitest.config.ts scripts/delivery-d4/apply-d4-samples.ts            # dry-run (쓰기 0)
 *   D4_IMAGE_DIR=<이미지 폴더> npx vite-node --config vitest.config.ts scripts/delivery-d4/apply-d4-samples.ts -- --apply  # 실제 반영
 *   옵션: --only=<key,key>  일부 매장만 · --out=<파일>  결과 JSON 저장 · --check-images  dry-run 에서 이미지 처리 함수만 로컬 실행(업로드 없음)
 * 롤백: scripts/delivery-d4/rollback-d4-samples.ts (추가분만 admin_delete_sample_store).
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { processOwnerProductImageBuffer } from "../../lib/stores/owner-product-image-upload.server";
import { uploadStoreProductWithHeroDerivative, canonicalStoragePathsForOriginal } from "../../lib/media/canonical-image-upload.server";
import { storeProductListDerivativeOriginalPath } from "../../lib/media/canonical-image-path";
import { rebuildStoreDeliveryCoverageForStore } from "../../lib/stores/discovery/persist-store-delivery-coverage";
import { refreshDiscoveryScheduleProjectionForStoreId } from "../../lib/stores/discovery/persist-discovery-schedule-projection";
import { appendAuditLog } from "../../lib/audit/append-audit-log";

/** 기존 시드 감사 기록과 같은 주체(메인관리자 계정) */
export const D4_AUDIT_ACTOR_ID = "11111111-1111-1111-1111-111111111111";
export const D4_AUDIT_REASON = "2026-10-29 D-4 샘플 70곳 추가 (Owner 승인)";
export const D4_OPERATOR = "claude-ops";
export const D4_MIN_IMAGE_BYTES = 20 * 1024;
export const D4_MAX_IMAGE_BYTES = 12 * 1024 * 1024;
/** Metro Manila 범위 (좌표 오입력 차단용) */
export const D4_GEO_BOUNDS = { latMin: 14.4, latMax: 14.8, lngMin: 120.9, lngMax: 121.2 } as const;

export type D4Menu = { title: string; price: number; section: number; sort_order: number; image: string };
export type D4Store = {
  key: string;
  store_name: string;
  slug: string;
  category: { slug: string; id: string; name: string };
  topic: { slug: string; id: string; name: string };
  business_type: string;
  item_type: "menu" | "product" | "service";
  description: string;
  delivery_available: boolean;
  pickup_available: boolean;
  visit_available: boolean;
  reservation_available: boolean;
  business_hours_json: Record<string, unknown>;
  sections: Array<{ name: string; sort_order: number }>;
  images: { profile: string; cover: string };
  menus: D4Menu[];
  location: {
    landmark: string;
    region: string;
    city: string;
    district: string;
    address_line1: string;
    lat: number;
    lng: number;
    source_url: string;
  };
  delivery_radius_km: number;
};
export type D4File = { stores: D4Store[] };

export function parseD4Args(argv: string[]): { apply: boolean; only: string[] | null; out: string | null } {
  const apply = argv.includes("--apply");
  const onlyArg = argv.find((a) => a.startsWith("--only="));
  const outArg = argv.find((a) => a.startsWith("--out="));
  return {
    apply,
    only: onlyArg ? onlyArg.slice("--only=".length).split(",").map((s) => s.trim()).filter(Boolean) : null,
    out: outArg ? outArg.slice("--out=".length) : null,
  };
}

export function loadD4Samples(): D4File {
  const p = path.resolve(process.cwd(), "scripts/delivery-d4/samples.json");
  return JSON.parse(fs.readFileSync(p, "utf8")) as D4File;
}

export function buildD4StoreInsertRow(s: D4Store): Record<string, unknown> {
  const loc = s.location;
  return {
    owner_user_id: null,
    store_kind: "sample",
    store_name: s.store_name,
    slug: s.slug,
    business_type: s.business_type,
    store_category_id: s.category.id,
    store_topic_id: s.topic.id,
    description: s.description,
    region: loc.region,
    city: loc.city,
    district: loc.district,
    address_line1: loc.address_line1,
    formatted_address: `${loc.address_line1}, ${loc.city}, ${loc.region}`,
    lat: loc.lat,
    lng: loc.lng,
    business_hours_json: s.business_hours_json,
    gallery_images_json: [],
    is_open: true,
    is_visible: false,
    approval_status: "approved",
    approved_at: new Date().toISOString(),
    delivery_available: s.delivery_available,
    pickup_available: s.pickup_available,
    visit_available: s.visit_available,
    reservation_available: s.reservation_available,
    owner_can_edit_store_identity: false,
    delivery_radius_km: s.delivery_radius_km,
    delivery_service_area_authority: "legacy_radius",
  };
}

export function buildD4ProductRow(
  s: D4Store,
  storeId: string,
  menu: D4Menu,
  index: number,
  sectionId: string,
  thumbnailUrl: string
): Record<string, unknown> {
  return {
    store_id: storeId,
    title: menu.title,
    price: menu.price,
    stock_qty: 0,
    min_order_qty: 1,
    max_order_qty: 99,
    product_status: "active",
    pickup_available: false,
    local_delivery_available: false,
    shipping_available: false,
    thumbnail_url: thumbnailUrl,
    images_json: [],
    options_json: [],
    // has_options 는 DB 생성 열(GENERATED ALWAYS) — 값 넣지 않음 (시험 반영에서 발견)
    admin_review_status: "none",
    item_type: s.item_type,
    is_featured: false,
    sort_order: menu.sort_order,
    menu_section_id: sectionId,
    track_inventory: false,
    client_request_id: `sample-d4-${s.key}-${index}`,
  };
}

type Problem = { key: string; problem: string };

/** 쓰기 없이 samples.json·이미지 파일·운영 DB 조회만으로 검증 */
export async function preflightD4(
  sb: SupabaseClient<any>,
  stores: D4Store[],
  imageDir: string
): Promise<{ problems: Problem[]; skipExisting: Set<string>; imageCount: number; imageBytes: number }> {
  const problems: Problem[] = [];
  const skipExisting = new Set<string>();
  let imageCount = 0;
  let imageBytes = 0;

  const topicIds = [...new Set(stores.map((s) => s.topic.id))];
  const { data: topics, error: tErr } = await sb.from("store_topics").select("id, store_category_id, slug").in("id", topicIds);
  if (tErr) throw new Error(`store_topics select failed: ${tErr.message}`);
  const topicMap = new Map((topics ?? []).map((t: any) => [String(t.id), t]));

  const slugs = stores.map((s) => s.slug);
  const names = stores.map((s) => s.store_name);
  const [{ data: slugRows, error: sErr }, { data: nameRows, error: nErr }] = await Promise.all([
    sb.from("stores").select("id, slug, store_name, store_kind").in("slug", slugs),
    sb.from("stores").select("id, slug, store_name, store_kind").in("store_name", names),
  ]);
  if (sErr || nErr) throw new Error(`stores select failed: ${(sErr ?? nErr)?.message}`);

  if (new Set(slugs).size !== slugs.length) problems.push({ key: "*", problem: "samples.json slug 중복" });
  if (new Set(names).size !== names.length) problems.push({ key: "*", problem: "samples.json 매장명 중복" });

  for (const s of stores) {
    const t = topicMap.get(s.topic.id) as { store_category_id: string; slug: string } | undefined;
    if (!t) problems.push({ key: s.key, problem: `2차 업종 id 없음 ${s.topic.id}` });
    else if (String(t.store_category_id) !== s.category.id) problems.push({ key: s.key, problem: "2차 업종이 1차 업종에 속하지 않음" });
    else if (t.slug !== s.topic.slug) problems.push({ key: s.key, problem: `2차 업종 slug 불일치 ${t.slug}` });

    const sameName = (nameRows ?? []).find((r: any) => r.store_name === s.store_name);
    if (sameName) {
      if (sameName.store_kind === "sample") skipExisting.add(s.key);
      else problems.push({ key: s.key, problem: `같은 이름의 비샘플 매장 존재 (${sameName.store_kind})` });
    }
    const sameSlug = (slugRows ?? []).find((r: any) => r.slug === s.slug);
    if (sameSlug && !(sameName && sameName.id === sameSlug.id)) problems.push({ key: s.key, problem: `slug 사용 중 ${s.slug}` });

    const { lat, lng } = s.location;
    const b = D4_GEO_BOUNDS;
    if (!(lat >= b.latMin && lat <= b.latMax && lng >= b.lngMin && lng <= b.lngMax)) {
      problems.push({ key: s.key, problem: `좌표 범위 밖 ${lat},${lng}` });
    }
    if (s.delivery_radius_km !== 5000) problems.push({ key: s.key, problem: "반경 5000 아님" });
    if (s.menus.length !== 6) problems.push({ key: s.key, problem: `메뉴 ${s.menus.length}개` });
    if (s.sections.length < 2) problems.push({ key: s.key, problem: "메뉴 섹션 2개 미만" });
    for (const m of s.menus) {
      if (!s.sections[m.section]) problems.push({ key: s.key, problem: `메뉴 섹션 없음 ${m.title}` });
      if (!Number.isInteger(m.price) || m.price < 0) problems.push({ key: s.key, problem: `가격 오류 ${m.title}` });
    }
    for (const rel of [s.images.profile, s.images.cover, ...s.menus.map((m) => m.image)]) {
      const abs = path.join(imageDir, rel);
      if (!fs.existsSync(abs)) {
        problems.push({ key: s.key, problem: `이미지 없음 ${rel}` });
        continue;
      }
      const size = fs.statSync(abs).size;
      const head = Buffer.alloc(3);
      const fd = fs.openSync(abs, "r");
      fs.readSync(fd, head, 0, 3, 0);
      fs.closeSync(fd);
      if (!(head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff)) problems.push({ key: s.key, problem: `JPEG 아님 ${rel}` });
      if (size < D4_MIN_IMAGE_BYTES || size > D4_MAX_IMAGE_BYTES) problems.push({ key: s.key, problem: `이미지 크기 ${size} ${rel}` });
      imageCount += 1;
      imageBytes += size;
    }
  }
  return { problems, skipExisting, imageCount, imageBytes };
}

type StoreResult = {
  key: string;
  store_name: string;
  status: "dry_run" | "skipped_existing" | "created" | "failed_rolled_back" | "failed_rollback_incomplete";
  store_id?: string;
  uploaded_paths?: string[];
  error?: string;
};

async function audit(sb: SupabaseClient<any>, storeId: string, action: string, after: Record<string, unknown>) {
  await appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: D4_AUDIT_ACTOR_ID,
    target_type: "store",
    target_id: storeId,
    action,
    after_json: { ...after, reason: D4_AUDIT_REASON, operator: D4_OPERATOR },
  });
}

async function uploadOne(
  sb: SupabaseClient<any>,
  storeId: string,
  abs: string,
  uploaded: string[]
): Promise<string> {
  const raw = fs.readFileSync(abs);
  const processed = await processOwnerProductImageBuffer(raw, "image/jpeg");
  const originalPath = storeProductListDerivativeOriginalPath(storeId, randomUUID(), processed.ext);
  const result = await uploadStoreProductWithHeroDerivative({
    sb,
    originalPath,
    primaryBuf: processed.buf,
    primaryContentType: processed.contentType,
  });
  uploaded.push(...canonicalStoragePathsForOriginal(result.originalPath, "store-product-images"));
  return result.publicUrl;
}

async function applyOne(sb: SupabaseClient<any>, s: D4Store, imageDir: string): Promise<StoreResult> {
  const uploaded: string[] = [];
  let storeId: string | null = null;
  try {
    const { data: ins, error: insErr } = await sb.from("stores").insert(buildD4StoreInsertRow(s)).select("id").single();
    if (insErr || !ins?.id) throw new Error(`store_insert: ${insErr?.message ?? "no id"}`);
    storeId = String(ins.id);
    await audit(sb, storeId, "store.sample.create", { store_name: s.store_name, store_category_id: s.category.id, batch: "d4" });

    const profileUrl = await uploadOne(sb, storeId, path.join(imageDir, s.images.profile), uploaded);
    await audit(sb, storeId, "store.sample.image_upload", { key: `${s.key}_profile`, path: uploaded[0] });
    const coverStart = uploaded.length;
    const coverUrl = await uploadOne(sb, storeId, path.join(imageDir, s.images.cover), uploaded);
    await audit(sb, storeId, "store.sample.image_upload", { key: `${s.key}_cover`, path: uploaded[coverStart] });

    const { error: profErr } = await sb
      .from("stores")
      .update({ profile_image_url: profileUrl, cover_image_url: coverUrl })
      .eq("id", storeId);
    if (profErr) throw new Error(`profile_update: ${profErr.message}`);
    await audit(sb, storeId, "store.sample.profile_update", { profile_image_url: profileUrl, cover_image_url: coverUrl });

    const sectionIds: string[] = [];
    for (const sec of s.sections) {
      const { data: secRow, error: secErr } = await sb
        .from("store_menu_sections")
        .insert({ store_id: storeId, name: sec.name, sort_order: sec.sort_order, is_hidden: false })
        .select("id")
        .single();
      if (secErr || !secRow?.id) throw new Error(`section_insert: ${secErr?.message ?? "no id"}`);
      sectionIds.push(String(secRow.id));
      await audit(sb, storeId, "store.sample.menu_section_create", { name: sec.name });
    }

    for (let i = 0; i < s.menus.length; i += 1) {
      const m = s.menus[i];
      const imgStart = uploaded.length;
      const url = await uploadOne(sb, storeId, path.join(imageDir, m.image), uploaded);
      await audit(sb, storeId, "store.sample.image_upload", { key: `${s.key}_m${i}`, path: uploaded[imgStart] });
      const { error: pErr } = await sb.from("store_products").insert(buildD4ProductRow(s, storeId, m, i, sectionIds[m.section], url));
      if (pErr) throw new Error(`product_insert ${m.title}: ${pErr.message}`);
      await audit(sb, storeId, "store.sample.product_create", { title: m.title });
    }

    const { error: visErr } = await sb.from("stores").update({ is_visible: true }).eq("id", storeId);
    if (visErr) throw new Error(`show: ${visErr.message}`);
    await audit(sb, storeId, "store.sample.bulk_show", { is_visible: true });

    const cov = await rebuildStoreDeliveryCoverageForStore(sb, storeId);
    if (!cov.ok) throw new Error(`coverage: ${cov.error}`);
    const sch = await refreshDiscoveryScheduleProjectionForStoreId(sb, storeId);
    if (!sch.ok) throw new Error(`schedule: ${sch.error}`);

    return { key: s.key, store_name: s.store_name, status: "created", store_id: storeId, uploaded_paths: uploaded };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    let rollbackOk = true;
    if (uploaded.length) {
      const { error } = await sb.storage.from("store-product-images").remove(uploaded);
      if (error) rollbackOk = false;
    }
    if (storeId) {
      const { data, error } = await sb.rpc("admin_delete_sample_store", { p_store_id: storeId, p_actor: D4_AUDIT_ACTOR_ID });
      const st = (data as { status?: string } | null)?.status;
      if (error || (st !== "deleted" && st !== "already_deleted")) rollbackOk = false;
    }
    return {
      key: s.key,
      store_name: s.store_name,
      status: rollbackOk ? "failed_rolled_back" : "failed_rollback_incomplete",
      store_id: storeId ?? undefined,
      uploaded_paths: uploaded,
      error: msg,
    };
  }
}

/** 실행 진입점 — `apply-d4-samples.ts` 가 호출. 기본 dry-run, `--apply` 일 때만 쓰기. */
export async function runApplyD4(): Promise<void> {
  const args = parseD4Args(process.argv);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const imageDir = process.env.D4_IMAGE_DIR?.trim();
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(1);
  }
  if (!imageDir) {
    console.error("D4_IMAGE_DIR required");
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const all = loadD4Samples().stores;
  const stores = args.only ? all.filter((s) => args.only!.includes(s.key)) : all;

  const pre = await preflightD4(sb, stores, imageDir);
  const summary = {
    mode: args.apply ? "apply" : "dry_run",
    stores: stores.length,
    menus: stores.reduce((n, s) => n + s.menus.length, 0),
    sections: stores.reduce((n, s) => n + s.sections.length, 0),
    images: pre.imageCount,
    image_mb: Math.round((pre.imageBytes / 1024 / 1024) * 10) / 10,
    skip_existing: [...pre.skipExisting],
    problems: pre.problems,
    db_writes: 0,
  };
  if (!args.apply && process.argv.includes("--check-images")) {
    // 업로드 없이 같은 처리 함수(processOwnerProductImageBuffer)만 로컬 실행 — 크기·형식 거부 여부 사전 확인
    const failedImages: Problem[] = [];
    for (const s of stores) {
      for (const rel of [s.images.profile, s.images.cover, ...s.menus.map((m) => m.image)]) {
        try {
          await processOwnerProductImageBuffer(fs.readFileSync(path.join(imageDir, rel)), "image/jpeg");
        } catch (e) {
          failedImages.push({ key: s.key, problem: `이미지 처리 실패 ${rel}: ${e instanceof Error ? e.message : String(e)}` });
        }
      }
    }
    pre.problems.push(...failedImages);
    (summary as Record<string, unknown>).image_process_checked = pre.imageCount;
  }
  if (!args.apply || pre.problems.length > 0) {
    console.log(JSON.stringify(summary, null, 2));
    if (pre.problems.length > 0) process.exit(2);
    return;
  }

  const results: StoreResult[] = [];
  for (const s of stores) {
    if (pre.skipExisting.has(s.key)) {
      results.push({ key: s.key, store_name: s.store_name, status: "skipped_existing" });
      continue;
    }
    const r = await applyOne(sb, s, imageDir);
    console.log(`[d4] ${r.status} ${s.key} ${s.store_name}${r.error ? ` — ${r.error}` : ""}`);
    results.push(r);
  }

  // 업종 browse 스냅샷(재생성 가능한 응답 캐시) 무효화 — 추가 매장 업종만
  const primarySlugs = [...new Set(stores.map((s) => s.category.slug)), "all"];
  const { error: snapErr } = await sb.from("stores_browse_snapshots").delete().in("primary_slug", primarySlugs);
  if (snapErr) console.error("[d4] browse snapshot invalidate failed", snapErr.message);

  const out = { ...summary, db_writes: undefined, results };
  if (args.out) fs.writeFileSync(args.out, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ created: results.filter((r) => r.status === "created").length, skipped: results.filter((r) => r.status === "skipped_existing").length, failed: results.filter((r) => r.status.startsWith("failed")).map((r) => ({ key: r.key, status: r.status, error: r.error, uploaded_paths: r.uploaded_paths })) }, null, 2));
  if (results.some((r) => r.status.startsWith("failed"))) process.exit(3);
}

