import {
  BOTTOM_NAV_BUILTIN_IDS,
  BOTTOM_NAV_ICON_KEYS,
  BOTTOM_NAV_ITEMS,
  type BottomNavBuiltinTabId,
  type BottomNavIconKey,
  type BottomNavItemConfig,
} from "@/lib/main-menu/bottom-nav-config";
import type { MainBottomNavAdminRow, MainBottomNavStoredItem, MainBottomNavStoredPayload } from "@/lib/main-menu/main-bottom-nav-types";

const BUILTIN_SET = new Set<string>(BOTTOM_NAV_BUILTIN_IDS);

const ICON_SET = new Set<string>(BOTTOM_NAV_ICON_KEYS);

const MAX_ITEMS = 10;

const CUSTOM_TAB_ID_RE = /^custom_[a-zA-Z0-9_-]{1,40}$/;

export function isBuiltinBottomNavTabId(id: string): id is BottomNavBuiltinTabId {
  return BUILTIN_SET.has(id);
}

export function isCustomBottomNavTabId(id: string): boolean {
  return CUSTOM_TAB_ID_RE.test(id);
}

export function generateCustomBottomNavTabId(): string {
  return `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function isIconKey(v: unknown): v is BottomNavIconKey {
  return typeof v === "string" && ICON_SET.has(v);
}

/** 내부 경로만 허용 (오픈 리다이렉트 방지) */
export function isSafeMainBottomNavHref(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const t = v.trim();
  if (t.length === 0 || t.length > 160) return false;
  if (!t.startsWith("/")) return false;
  if (t.includes("//") || t.includes("..")) return false;
  return /^\/[A-Za-z0-9/_-]*$/.test(t);
}

function trimLabel(v: unknown, fallback: string): string {
  if (typeof v !== "string") return fallback;
  const t = v.trim().slice(0, 24);
  return t.length > 0 ? t : fallback;
}

function cloneDefaults(): BottomNavItemConfig[] {
  return BOTTOM_NAV_ITEMS.map((row) => ({ ...row }));
}

function defaultById(): Map<BottomNavBuiltinTabId, BottomNavItemConfig> {
  const m = new Map<BottomNavBuiltinTabId, BottomNavItemConfig>();
  for (const row of BOTTOM_NAV_ITEMS) m.set(row.id as BottomNavBuiltinTabId, { ...row });
  return m;
}

function optTwClass(v: unknown, base: string | undefined): string | undefined {
  if (typeof v !== "string") return base;
  const t = v.trim();
  if (t.length === 0 || t.length > 120) return base;
  return t;
}

function isValidTabId(id: string): boolean {
  return isBuiltinBottomNavTabId(id) || isCustomBottomNavTabId(id);
}

function mergeRow(base: BottomNavItemConfig, raw: MainBottomNavStoredItem): MainBottomNavAdminRow {
  const href = isSafeMainBottomNavHref(raw.href) ? raw.href.trim() : base.href;
  const label = trimLabel(raw.label, base.label);
  let icon: BottomNavIconKey = isIconKey(raw.icon) ? raw.icon : base.icon;
  /* 예전 TRADE 탭이 라벨만 TRADE이고 icon=home(집)으로 저장된 경우 → trade 아이콘으로 통일 */
  if (base.id === "home" && icon === "home" && label.trim().toUpperCase() === "TRADE") {
    icon = "trade";
  }
  return {
    id: base.id,
    href,
    label,
    icon,
    iconSizeClass: optTwClass(raw.iconSizeClass, base.iconSizeClass),
    labelInactiveExtraClass: optTwClass(raw.labelInactiveExtraClass, base.labelInactiveExtraClass),
    labelActiveExtraClass: optTwClass(raw.labelActiveExtraClass, base.labelActiveExtraClass),
    iconInactiveClass: optTwClass(raw.iconInactiveClass, base.iconInactiveClass),
    iconActiveClass: optTwClass(raw.iconActiveClass, base.iconActiveClass),
    labelInactiveClass: optTwClass(raw.labelInactiveClass, base.labelInactiveClass),
    labelActiveClass: optTwClass(raw.labelActiveClass, base.labelActiveClass),
    labelSizeClass: optTwClass(raw.labelSizeClass, base.labelSizeClass),
    labelFontFamilyClass: optTwClass(raw.labelFontFamilyClass, base.labelFontFamilyClass),
    visible: raw.visible !== false,
  };
}

function mergeCustomRow(raw: MainBottomNavStoredItem): MainBottomNavAdminRow | null {
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!isCustomBottomNavTabId(id)) return null;
  const href = isSafeMainBottomNavHref(raw.href) ? raw.href.trim() : "/home";
  const icon = isIconKey(raw.icon) ? raw.icon : "home";
  return {
    id,
    href,
    label: trimLabel(raw.label, "새 메뉴"),
    icon,
    iconSizeClass: optTwClass(raw.iconSizeClass, undefined),
    labelInactiveExtraClass: optTwClass(raw.labelInactiveExtraClass, undefined),
    labelActiveExtraClass: optTwClass(raw.labelActiveExtraClass, undefined),
    iconInactiveClass: optTwClass(raw.iconInactiveClass, undefined),
    iconActiveClass: optTwClass(raw.iconActiveClass, undefined),
    labelInactiveClass: optTwClass(raw.labelInactiveClass, undefined),
    labelActiveClass: optTwClass(raw.labelActiveClass, undefined),
    labelSizeClass: optTwClass(raw.labelSizeClass, undefined),
    labelFontFamilyClass: optTwClass(raw.labelFontFamilyClass, undefined),
    visible: raw.visible !== false,
  };
}

/** 관리자·공통: DB JSON → 전체 행(숨김 포함, 순서 유지) */
export function resolveMainBottomNavAdminRows(valueJson: unknown): MainBottomNavAdminRow[] {
  const fallback = getDefaultMainBottomNavAdminRows();
  if (valueJson == null || typeof valueJson !== "object") {
    return fallback;
  }

  const items = (valueJson as MainBottomNavStoredPayload).items;
  if (!Array.isArray(items) || items.length === 0) {
    return fallback;
  }

  const defaults = defaultById();
  const ordered: MainBottomNavAdminRow[] = [];

  for (const raw of items) {
    if (raw == null || typeof raw !== "object") continue;
    const id = String((raw as MainBottomNavStoredItem).id ?? "").trim();
    if (!isValidTabId(id)) continue;

    if (isBuiltinBottomNavTabId(id)) {
      const base = defaults.get(id);
      if (base) ordered.push(mergeRow(base, raw as MainBottomNavStoredItem));
    } else {
      const row = mergeCustomRow({ ...(raw as MainBottomNavStoredItem), id });
      if (row) ordered.push(row);
    }
  }

  if (ordered.length === 0) return fallback;
  return ordered;
}

/** 앱 하단 탭: 노출 항목만, 순서 유지 */
export function resolveMainBottomNavDisplayItems(valueJson: unknown): BottomNavItemConfig[] {
  return resolveMainBottomNavAdminRows(valueJson)
    .filter((r) => r.visible)
    .map(({ visible: _v, ...rest }) => rest);
}

export function mainBottomNavAdminRowToStoredItem(merged: MainBottomNavAdminRow): MainBottomNavStoredItem {
  return {
    id: merged.id,
    visible: merged.visible,
    label: merged.label,
    href: merged.href,
    icon: merged.icon,
    iconSizeClass: merged.iconSizeClass,
    labelInactiveExtraClass: merged.labelInactiveExtraClass,
    labelActiveExtraClass: merged.labelActiveExtraClass,
    iconInactiveClass: merged.iconInactiveClass,
    iconActiveClass: merged.iconActiveClass,
    labelInactiveClass: merged.labelInactiveClass,
    labelActiveClass: merged.labelActiveClass,
    labelSizeClass: merged.labelSizeClass,
    labelFontFamilyClass: merged.labelFontFamilyClass,
  };
}

/** 저장 전 검증 — 1~10개, id 고유, 내장·custom_* 만, 최소 1개 노출 */
export function validateMainBottomNavPayload(body: unknown): { ok: true; payload: MainBottomNavStoredPayload } | { ok: false; error: string } {
  if (body == null || typeof body !== "object") return { ok: false, error: "invalid_body" };
  const items = (body as MainBottomNavStoredPayload).items;
  if (!Array.isArray(items)) return { ok: false, error: "items_required" };
  if (items.length < 1 || items.length > MAX_ITEMS) return { ok: false, error: "items_count" };

  const seen = new Set<string>();
  let visibleCount = 0;

  for (const raw of items) {
    if (raw == null || typeof raw !== "object") return { ok: false, error: "item_shape" };
    const id = String((raw as MainBottomNavStoredItem).id ?? "").trim();
    if (!isValidTabId(id)) return { ok: false, error: "invalid_id" };
    if (seen.has(id)) return { ok: false, error: "duplicate_id" };
    seen.add(id);

    const href = (raw as MainBottomNavStoredItem).href;
    if (href === undefined || href === null || !isSafeMainBottomNavHref(href)) return { ok: false, error: "invalid_href" };

    const icon = (raw as MainBottomNavStoredItem).icon;
    if (icon === undefined || icon === null || !isIconKey(icon)) return { ok: false, error: "invalid_icon" };

    const label = (raw as MainBottomNavStoredItem).label;
    if (typeof label !== "string" || label.trim().length === 0) return { ok: false, error: "invalid_label" };

    if ((raw as MainBottomNavStoredItem).visible !== false) visibleCount += 1;
  }

  if (visibleCount < 1) return { ok: false, error: "min_one_visible" };

  const defaults = defaultById();
  const normalized: MainBottomNavStoredItem[] = items.map((raw) => {
    const r = raw as MainBottomNavStoredItem;
    const id = String(r.id).trim();
    if (isBuiltinBottomNavTabId(id)) {
      const base = defaults.get(id)!;
      return mainBottomNavAdminRowToStoredItem(mergeRow(base, r));
    }
    const custom = mergeCustomRow(r);
    if (!custom) return { id, visible: true, label: "메뉴", href: "/home", icon: "home" as BottomNavIconKey };
    return mainBottomNavAdminRowToStoredItem(custom);
  });

  return { ok: true, payload: { items: normalized } };
}

export function getDefaultMainBottomNavAdminRows(): MainBottomNavAdminRow[] {
  return cloneDefaults().map((row) => ({ ...row, visible: true }));
}
