/**
 * CONTRACT — 고객 「메뉴」 읽기 단일 지점 (HOME·BROWSE·헤더 공통, 클라이언트·서버 공용).
 * - 메뉴가 없으면 빈 배열 → 고객 화면은 기존 업종 화면 (복구 스위치).
 * - 업종 스냅샷(categories·topics)은 바꾸지 않는다 — 메뉴는 따로 `menus` 로만 전달.
 */
import {
  deliveryMenuLinkHref,
  isDeliveryMenuLinkTarget,
  type DeliveryMenuFeatureCard,
  type DeliveryMenuPublic,
  type DeliveryMenuShortcut,
} from "@/lib/stores/delivery-menus/delivery-menu-types";

export type DeliveryMenuCarrier = { menus?: DeliveryMenuPublic[] };

function readString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function readFeature(v: unknown): DeliveryMenuFeatureCard | null {
  if (!v || typeof v !== "object") return null;
  const f = v as Record<string, unknown>;
  const title = readString(f.title);
  if (!title) return null;
  const bg = readString(f.bg);
  return {
    title,
    imageUrl: readString(f.imageUrl) || null,
    bg: /^#[0-9a-fA-F]{6}$/.test(bg) ? bg : null,
    linkTarget: isDeliveryMenuLinkTarget(f.linkTarget) ? f.linkTarget : null,
  };
}

function readShortcuts(v: unknown): DeliveryMenuShortcut[] {
  if (!Array.isArray(v)) return [];
  const out: DeliveryMenuShortcut[] = [];
  for (const item of v) {
    const s = item as Record<string, unknown>;
    const storeId = readString(s.storeId);
    const slug = readString(s.slug);
    const name = readString(s.name);
    if (!storeId || !slug || !name) continue;
    out.push({
      storeId,
      slug,
      name,
      imageUrl: readString(s.imageUrl) || null,
      caption: readString(s.caption) || null,
    });
  }
  return out;
}

/** GET /api/stores/taxonomy `deliveryMenus` → 검증된 배열 (형식 불량 항목은 버림) */
export function readDeliveryMenusFromTaxonomyJson(json: unknown): DeliveryMenuPublic[] {
  const raw = (json as { deliveryMenus?: unknown } | null)?.deliveryMenus;
  if (!Array.isArray(raw)) return [];
  const out: DeliveryMenuPublic[] = [];
  for (const item of raw) {
    const m = item as Record<string, unknown>;
    const id = readString(m.id);
    const slug = readString(m.slug).toLowerCase();
    const nameKo = readString(m.nameKo);
    if (!id || !slug || !nameKo) continue;
    out.push({
      id,
      slug,
      parentId: readString(m.parentId) || null,
      nameKo,
      nameEn: readString(m.nameEn) || null,
      iconUrl: readString(m.iconUrl) || null,
      sortOrder: Number(m.sortOrder ?? 0) || 0,
      showOnHome: m.showOnHome !== false,
      homeSortOrder: Number(m.homeSortOrder ?? 0) || 0,
      showInPageTab: m.showInPageTab !== false,
      linkTarget: isDeliveryMenuLinkTarget(m.linkTarget) ? m.linkTarget : null,
      pickupOnly: m.pickupOnly === true,
      badgeText: readString(m.badgeText) || null,
      feature: readFeature(m.feature),
      storeCount: Math.max(0, Number(m.storeCount ?? 0) || 0),
      shortcuts: readShortcuts(m.shortcuts),
    });
  }
  return out;
}

function bySortOrder(a: DeliveryMenuPublic, b: DeliveryMenuPublic): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.slug.localeCompare(b.slug);
}

function byHomeOrder(a: DeliveryMenuPublic, b: DeliveryMenuPublic): number {
  if (a.homeSortOrder !== b.homeSortOrder) return a.homeSortOrder - b.homeSortOrder;
  return bySortOrder(a, b);
}

/** 홈 상단 탭 (1단) — 순서대로 */
export function listDeliveryMenuRoots(menus: readonly DeliveryMenuPublic[] | undefined): DeliveryMenuPublic[] {
  if (!menus?.length) return [];
  return menus.filter((m) => m.parentId == null).sort(bySortOrder);
}

export function findDeliveryMenuRoot(
  menus: readonly DeliveryMenuPublic[] | undefined,
  rootSlug: string
): DeliveryMenuPublic | null {
  const key = rootSlug.trim().toLowerCase();
  if (!key || !menus?.length) return null;
  return menus.find((m) => m.parentId == null && m.slug === key) ?? null;
}

/** 홈 아이콘 판 — 「홈 아이콘에 표시」 2단, 홈 순서 */
export function listDeliveryMenuHomeIcons(
  menus: readonly DeliveryMenuPublic[] | undefined,
  rootId: string
): DeliveryMenuPublic[] {
  if (!menus?.length) return [];
  return menus.filter((m) => m.parentId === rootId && m.showOnHome).sort(byHomeOrder);
}

/** 메뉴 페이지 3단 탭 — 매장 목록 2단만 (화면 연결 메뉴는 탭 아님), 페이지 탭 순서 */
export function listDeliveryMenuPageTabs(
  menus: readonly DeliveryMenuPublic[] | undefined,
  rootSlug: string
): DeliveryMenuPublic[] | null {
  const root = findDeliveryMenuRoot(menus, rootSlug);
  if (!root || !menus) return null;
  return menus
    .filter((m) => m.parentId === root.id && m.showInPageTab && !m.linkTarget)
    .sort(bySortOrder);
}

/** 「더보기」 전체 — 그 1단의 2단 전부 (홈 표시 여부와 무관), 페이지 탭 순서 */
export function listDeliveryMenuAllChildren(
  menus: readonly DeliveryMenuPublic[] | undefined,
  rootId: string
): DeliveryMenuPublic[] {
  if (!menus?.length) return [];
  return menus.filter((m) => m.parentId === rootId).sort(bySortOrder);
}

/** 메뉴 페이지 경로 — 「홈」 탭이면 `menuSlug` 없음 */
export function buildDeliveryMenuPageHref(rootSlug: string, menuSlug?: string | null): string {
  const base = `/stores/browse/${encodeURIComponent(rootSlug.trim().toLowerCase())}`;
  const m = (menuSlug ?? "").trim().toLowerCase();
  return m ? `${base}?menu=${encodeURIComponent(m)}` : base;
}

/** 아이콘 1개를 누르면 갈 곳 — 화면 연결이면 그 화면, 아니면 메뉴 페이지(그 탭 선택) */
export function resolveDeliveryMenuItemHref(rootSlug: string, item: DeliveryMenuPublic): string {
  if (item.linkTarget) return deliveryMenuLinkHref(item.linkTarget);
  return buildDeliveryMenuPageHref(rootSlug, item.slug);
}

export function resolveDeliveryMenuLabel(item: Pick<DeliveryMenuPublic, "nameKo" | "nameEn">, language: string): string {
  if (language !== "ko" && item.nameEn?.trim()) return item.nameEn.trim();
  return item.nameKo;
}
