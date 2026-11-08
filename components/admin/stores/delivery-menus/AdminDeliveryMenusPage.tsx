"use client";

/**
 * 어드민 「배달·매장 › 메뉴 관리」 (배민 미러링 · 설계 v5 A~H · v6 §8).
 * 왼쪽 = 고객 앱과 같은 미리보기, 오른쪽 = 미리보기에서 누른 것의 편집 칸.
 * 상단 탭·아이콘(메뉴)·대표 카드·배지·매장 바로가기 줄·페이지 탭·매장 지정·업종 기본 메뉴를 여기서 추가·수정·삭제한다.
 * 업종·수수료·매장 신청은 바꾸지 않는다. 노출 매장은 메뉴 1개 이상 (마지막 메뉴 빼기·매장 남은 메뉴 삭제 거부).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";
import { AdminListItemButton } from "@/components/admin/ui/AdminListItemButton";
import { AdminSwitch } from "@/components/admin/ui/AdminSwitch";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { dibayAlert } from "@/components/ui/dibay-overlay";
import { clearStoresTaxonomyClientCache } from "@/lib/stores/store-delivery-api-client";
import { computeDeliveryMenuStoreIds } from "@/lib/stores/delivery-menus/delivery-menu-compute";
import {
  DELIVERY_MENU_LINK_TARGET_LABEL_KEYS,
  DELIVERY_MENU_LINK_TARGETS,
  type DeliveryMenuAdminRow,
} from "@/lib/stores/delivery-menus/delivery-menu-types";
import { MIRROR_GOLD } from "@/lib/design/delivery-baemin-mirror";
import {
  DeliveryMenuPreviewPhone,
  type DeliveryMenuPreviewItem,
  type DeliveryMenuPreviewPick,
  type DeliveryMenuPreviewScreen,
  type DeliveryMenuPreviewStore,
} from "@/components/stores/home/DeliveryMenuPreviewPhone";
import {
  createDeliveryMenu,
  deleteDeliveryMenu,
  deleteDeliveryMenuImage,
  deliveryMenuAdminErrorText,
  fetchDeliveryMenusAdmin,
  reorderDeliveryMenus,
  saveDeliveryMenuDefaults,
  saveDeliveryMenuShortcuts,
  saveDeliveryMenuStores,
  updateDeliveryMenu,
  uploadDeliveryMenuImage,
  type DeliveryMenuAdminStore,
  type DeliveryMenusAdminPayload,
} from "./delivery-menus-admin-api";
import { translateBy } from "@/lib/i18n/translate-by";

const INPUT =
  "w-full rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1.5 text-[13px] text-sam-fg disabled:bg-sam-surface-muted";
const LABEL = "w-28 shrink-0 text-[13px] text-sam-muted";
const ROW = "flex flex-wrap items-center gap-2";
const CARD = "rounded-ui-rect border border-sam-border bg-sam-surface p-3";
const HINT = "text-[12px] text-sam-muted";

type Pick = DeliveryMenuPreviewPick | { kind: "defaults" } | { kind: "unassigned" };

function isVisibleStore(s: DeliveryMenuAdminStore): boolean {
  return s.approval_status === "approved" && s.is_visible === true;
}

function moveInList<T extends { id: string }>(list: T[], id: string, delta: -1 | 1): T[] | null {
  const i = list.findIndex((x) => x.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return null;
  const next = [...list];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

export function AdminDeliveryMenusPage() {
  const { t, language } = useI18n();
  const ko = language === "ko";
  const [data, setData] = useState<DeliveryMenusAdminPayload | null>(null);
  const [loadError, setLoadError] = useState<{ code: string; status?: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [screen, setScreen] = useState<DeliveryMenuPreviewScreen>({ kind: "home", rootId: null });
  const [pick, setPick] = useState<Pick | null>(null);

  const reload = useCallback(async () => {
    const r = await fetchDeliveryMenusAdmin();
    if (!r.ok) {
      setLoadError({ code: r.code, status: r.status });
      return;
    }
    setLoadError(null);
    setData(r.value);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const fail = useCallback(
    async (code: string) => {
      await dibayAlert({ title: deliveryMenuAdminErrorText(code, ko) });
    },
    [ko]
  );

  /** 저장 → 고객 taxonomy 캐시 비우고 다시 읽기 */
  const run = useCallback(
    async (fn: () => Promise<{ ok: boolean; code?: string } | { ok: false; code: string }>) => {
      setBusy(true);
      try {
        const r = await fn();
        if (!r.ok) await fail((r as { code: string }).code);
        clearStoresTaxonomyClientCache();
        await reload();
        return r.ok;
      } finally {
        setBusy(false);
      }
    },
    [fail, reload]
  );

  const menus = data?.menus ?? [];
  const stores = data?.stores ?? [];
  const storeById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);
  const visibleStores = useMemo(() => stores.filter(isVisibleStore), [stores]);
  const roots = useMemo(() => menus.filter((m) => m.parent_id == null).sort((a, b) => a.sort_order - b.sort_order), [menus]);
  const childrenOf = useCallback(
    (rootId: string) => menus.filter((m) => m.parent_id === rootId),
    [menus]
  );

  /** 고객과 같은 계산 — 지정 매장 + 미지정 노출 매장의 업종 기본 메뉴 폴백 */
  const computed = useMemo(
    () =>
      computeDeliveryMenuStoreIds(
        {
          assignments: menus.flatMap((m) => m.store_ids.map((sid, i) => ({ menu_id: m.id, store_id: sid, sort_order: i + 1 }))),
          defaults: data?.defaults ?? [],
        },
        visibleStores.map((s) => ({
          id: s.id,
          slug: s.slug ?? "",
          store_name: s.store_name ?? "",
          profile_image_url: s.profile_image_url,
          store_category_id: s.store_category_id,
          store_topic_id: s.store_topic_id,
          pickup_available: s.pickup_available,
        }))
      ),
    [menus, data?.defaults, visibleStores]
  );

  const menuNamesByStore = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const m of menus) {
      if (m.parent_id == null) continue;
      for (const sid of m.store_ids) {
        const list = map.get(sid) ?? [];
        list.push(m.name_ko);
        map.set(sid, list);
      }
    }
    return map;
  }, [menus]);

  const previewItems: DeliveryMenuPreviewItem[] = useMemo(
    () =>
      menus.map((m) => {
        const root = m.parent_id ? menus.find((r) => r.id === m.parent_id) : m;
        const ids = computed.byMenu.get(m.id) ?? [];
        const count = root?.pickup_only ? ids.filter((id) => storeById.get(id)?.pickup_available !== false).length : ids.length;
        return {
          id: m.id,
          slug: m.slug,
          parentId: m.parent_id,
          nameKo: m.name_ko,
          iconUrl: m.icon_url,
          sortOrder: m.sort_order,
          homeSortOrder: m.home_sort_order,
          showOnHome: m.show_on_home,
          showInPageTab: m.show_in_page_tab,
          isActive: m.is_active,
          linkTarget: m.link_target,
          pickupOnly: m.pickup_only,
          badgeText: m.badge_text,
          feature:
            m.parent_id == null && m.show_feature && (m.feature_title ?? "").trim()
              ? { title: m.feature_title ?? "", imageUrl: m.feature_image_url, bg: m.feature_bg }
              : null,
          storeCount: count,
        };
      }),
    [menus, computed, storeById]
  );

  const toPreviewStore = useCallback(
    (id: string, caption?: string | null): DeliveryMenuPreviewStore | null => {
      const s = storeById.get(id);
      if (!s) return null;
      return { id, name: s.store_name ?? "", imageUrl: s.profile_image_url, caption: caption ?? null };
    },
    [storeById]
  );

  const shortcutsByRoot = useMemo(() => {
    const out: Record<string, DeliveryMenuPreviewStore[]> = {};
    for (const sc of [...(data?.shortcuts ?? [])].sort((a, b) => a.sort_order - b.sort_order)) {
      const p = toPreviewStore(sc.store_id, sc.caption);
      if (!p) continue;
      (out[sc.root_menu_id] ??= []).push(p);
    }
    return out;
  }, [data?.shortcuts, toPreviewStore]);

  const storesByMenu = useMemo(() => {
    const out: Record<string, DeliveryMenuPreviewStore[]> = {};
    for (const [menuId, ids] of computed.byMenu) {
      out[menuId] = ids.map((id) => toPreviewStore(id)).filter((x): x is DeliveryMenuPreviewStore => !!x);
    }
    return out;
  }, [computed, toPreviewStore]);

  if (loadError) {
    return <AdminErrorState ko={ko} code={loadError.code} httpStatus={loadError.status} onRetry={() => void reload()} />;
  }
  if (!data) return <AdminLoadingState ko={ko} />;
  if (data.menus == null) {
    return (
      <div className={CARD}>
        <p className="text-[14px] text-sam-fg">
          {t("admin_stores_menu_tables_are_not_applied_yet")}
        </p>
      </div>
    );
  }

  const unassigned = computed.unassignedStoreIds.map((id) => storeById.get(id)).filter((s): s is DeliveryMenuAdminStore => !!s);
  const pickedMenu =
    pick && (pick.kind === "root" || pick.kind === "menu" || pick.kind === "stores")
      ? menus.find((m) => m.id === pick.id) ?? null
      : null;

  return (
    <div className="space-y-3" data-admin-delivery-menus>
      <div className={`${CARD} space-y-1`}>
        <p className="text-[16px] font-semibold text-sam-fg">{t("admin_stores_delivery_menus")}</p>
        <p className={HINT}>
          {t("admin_stores_build_customer_delivery_top_tabs_icons")}
        </p>
        <div className={`${ROW} pt-1`}>
          <AdminChipButton selected={screen.kind === "home"} onClick={() => setScreen({ kind: "home", rootId: screen.rootId })}>
            {t("admin_stores_delivery_home")}
          </AdminChipButton>
          {roots.map((r) => (
            <AdminChipButton
              key={r.id}
              selected={screen.kind === "page" && screen.rootId === r.id}
              onClick={() => setScreen({ kind: "page", rootId: r.id, menuId: null })}
            >
              {t("admin_stores_page", { name_ko: r.name_ko })}
            </AdminChipButton>
          ))}
          <AdminChipButton selected={pick?.kind === "defaults"} onClick={() => setPick({ kind: "defaults" })}>
            {t("admin_stores_category_defaults")}
          </AdminChipButton>
        </div>
      </div>

      {unassigned.length > 0 ?
        <div className="rounded-ui-rect border border-sam-danger bg-sam-danger-soft p-3" role="alert">
          <div className={ROW}>
            <p className="text-[14px] font-semibold text-sam-danger">
              {t("admin_stores_visible_stores_without_menu", { unassigned: unassigned.length })}
            </p>
            <AdminActionButton size="sm" variant="secondary" onClick={() => setPick({ kind: "unassigned" })}>
              {t("admin_stores_assign_menus")}
            </AdminActionButton>
          </div>
          <p className={HINT}>
            {t("admin_stores_customers_see_them_in_category_default")}
          </p>
        </div>
      : null}

      <div className="grid gap-4 lg:grid-cols-[336px_minmax(0,1fr)]">
        <div className="flex justify-center lg:justify-start">
          <DeliveryMenuPreviewPhone
            items={previewItems}
            screen={screen}
            picked={pick && "kind" in pick && pick.kind !== "defaults" && pick.kind !== "unassigned" ? pick : null}
            shortcutsByRoot={shortcutsByRoot}
            storesByMenu={storesByMenu}
            onPick={(p) => setPick(p)}
            onScreen={setScreen}
          />
        </div>
        <div className="min-w-0 space-y-3">
          {!pick ?
            <div className={CARD}>
              <p className="text-[14px] text-sam-fg">
                {t("admin_stores_tap_something_in_preview_to_edit")}
              </p>
            </div>
          : null}
          {pick?.kind === "add-root" ?
            <AddMenuEditor ko={ko} busy={busy} title={t("admin_stores_add_top_tab")} onCreate={(nameKo, nameEn) =>
              run(async () => {
                const r = await createDeliveryMenu({ parent_id: null, name_ko: nameKo, name_en: nameEn });
                if (r.ok && r.value) {
                  setScreen({ kind: "home", rootId: r.value });
                  setPick({ kind: "root", id: r.value });
                }
                return r;
              })
            } />
          : null}
          {pick?.kind === "add-menu" ?
            <AddMenuEditor
              ko={ko}
              busy={busy}
              title={translateBy(ko ? "ko" : "en", "admin_stores_delivery_menu_add_title", {
                name: (() => {
                  const root = menus.find((m) => m.id === pick.rootId);
                  return (ko ? root?.name_ko : root?.name_en || root?.name_ko) ?? "";
                })(),
              })}
              onCreate={(nameKo, nameEn) =>
                run(async () => {
                  const r = await createDeliveryMenu({ parent_id: pick.rootId, name_ko: nameKo, name_en: nameEn });
                  if (r.ok && r.value) setPick({ kind: "menu", id: r.value });
                  return r;
                })
              }
            />
          : null}
          {pick?.kind === "root" && pickedMenu ?
            <RootEditor
              key={pickedMenu.id}
              ko={ko}
              busy={busy}
              root={pickedMenu}
              roots={roots}
              allMenus={menus}
              onSave={(patch) => run(() => updateDeliveryMenu(pickedMenu.id, patch))}
              onMove={(delta) => {
                const next = moveInList(roots, pickedMenu.id, delta);
                if (!next) return;
                void run(() => reorderDeliveryMenus("order", next.map((m, i) => ({ id: m.id, value: i + 1 }))));
              }}
              onFeature={() => setPick({ kind: "feature", rootId: pickedMenu.id })}
              onDelete={async (moveTo) => {
                const c = await confirmAdminAction({
                  level: adminActionLevel("delete"),
                  ko,
                  title: t("admin_stores_delete_top_tab", { name_ko: pickedMenu.name_ko }),
                  description: `${translateBy(ko ? "ko" : "en", "admin_stores_delivery_menu_delete_children", { n: childrenOf(pickedMenu.id).length })}${moveTo ? translateBy(ko ? "ko" : "en", "admin_stores_delivery_menu_delete_move_note") : ""}`,
                  confirmLabel: adminCta("delete", ko),
                  destructive: true,
                });
                if (!c.ok) return;
                const ok = await run(() => deleteDeliveryMenu(pickedMenu.id, moveTo));
                if (ok) {
                  setPick(null);
                  setScreen({ kind: "home", rootId: null });
                }
              }}
            />
          : null}
          {pick?.kind === "feature" ?
            (() => {
              const root = menus.find((m) => m.id === pick.rootId);
              return root ?
                  <FeatureEditor
                    key={root.id}
                    ko={ko}
                    busy={busy}
                    root={root}
                    onSave={(patch) => run(() => updateDeliveryMenu(root.id, patch))}
                    onUpload={(file) => run(() => uploadDeliveryMenuImage("menu_feature", root.id, file))}
                    onDeleteImage={() => run(() => deleteDeliveryMenuImage("menu_feature", root.id))}
                  />
                : null;
            })()
          : null}
          {pick?.kind === "menu" && pickedMenu ?
            <MenuEditor
              key={pickedMenu.id}
              ko={ko}
              busy={busy}
              menu={pickedMenu}
              roots={roots}
              siblings={childrenOf(pickedMenu.parent_id ?? "")}
              allMenus={menus}
              storeCount={(computed.byMenu.get(pickedMenu.id) ?? []).length}
              onSave={(patch) => run(() => updateDeliveryMenu(pickedMenu.id, patch))}
              onReorder={(key, list) => run(() => reorderDeliveryMenus(key, list))}
              onUpload={(file) => run(() => uploadDeliveryMenuImage("menu", pickedMenu.id, file))}
              onDeleteImage={() => run(() => deleteDeliveryMenuImage("menu", pickedMenu.id))}
              onStores={() => setPick({ kind: "stores", id: pickedMenu.id })}
              onDelete={async (moveTo) => {
                const c = await confirmAdminAction({
                  level: adminActionLevel("delete"),
                  ko,
                  title: t("admin_stores_delete_menu", { name_ko: pickedMenu.name_ko }),
                  description: t("admin_stores_only_menu_assignment_is_removed"),
                  confirmLabel: adminCta("delete", ko),
                  destructive: true,
                });
                if (!c.ok) return;
                const ok = await run(() => deleteDeliveryMenu(pickedMenu.id, moveTo));
                if (ok) setPick(null);
              }}
            />
          : null}
          {pick?.kind === "stores" && pickedMenu ?
            <StoresEditor
              key={pickedMenu.id}
              ko={ko}
              busy={busy}
              menu={pickedMenu}
              stores={stores}
              categories={data.categories}
              topics={data.topics}
              menuNamesByStore={menuNamesByStore}
              onSave={async (ids) => {
                setBusy(true);
                try {
                  const r = await saveDeliveryMenuStores(pickedMenu.id, ids);
                  if (!r.ok) {
                    const names = (r.storeIds ?? []).map((id) => storeById.get(id)?.store_name ?? id).join(", ");
                    await dibayAlert({
                      title: deliveryMenuAdminErrorText(r.code, ko),
                      ...(names ? { description: names } : {}),
                    });
                  }
                  clearStoresTaxonomyClientCache();
                  await reload();
                } finally {
                  setBusy(false);
                }
              }}
            />
          : null}
          {pick?.kind === "shortcuts" ?
            <ShortcutsEditor
              key={pick.rootId}
              ko={ko}
              busy={busy}
              rootName={(() => {
                const root = menus.find((m) => m.id === pick.rootId);
                return (ko ? root?.name_ko : root?.name_en || root?.name_ko) ?? "";
              })()}
              initial={[...data.shortcuts]
                .filter((s) => s.root_menu_id === pick.rootId)
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((s) => ({ store_id: s.store_id, caption: s.caption }))}
              stores={visibleStores}
              onSave={(list) => run(() => saveDeliveryMenuShortcuts(pick.rootId, list))}
            />
          : null}
          {pick?.kind === "defaults" ?
            <DefaultsEditor
              ko={ko}
              busy={busy}
              categories={data.categories}
              topics={data.topics}
              defaults={data.defaults}
              menus={menus}
              onSave={(list) => run(() => saveDeliveryMenuDefaults(list))}
            />
          : null}
          {pick?.kind === "unassigned" ?
            <UnassignedEditor
              ko={ko}
              busy={busy}
              stores={unassigned}
              menus={menus}
              onAssign={(menuId, storeId) => {
                const m = menus.find((x) => x.id === menuId);
                if (!m) return;
                void run(() => saveDeliveryMenuStores(menuId, [...m.store_ids, storeId]));
              }}
            />
          : null}
        </div>
      </div>
    </div>
  );
}

function AddMenuEditor({
  ko,
  busy,
  title,
  onCreate,
}: {
  ko: boolean;
  busy: boolean;
  title: string;
  onCreate: (nameKo: string, nameEn: string | null) => void;
}) {
  const [nameKo, setNameKo] = useState("");
  const [nameEn, setNameEn] = useState("");
  return (
    <div className={`${CARD} space-y-2`}>
      <p className="text-[14px] font-semibold text-sam-fg">{title}</p>
      <div className={ROW}>
        <span className={LABEL}>{translateBy(ko ? "ko" : "en", "admin_stores_name")}</span>
        <input className={`${INPUT} max-w-xs`} value={nameKo} maxLength={60} onChange={(e) => setNameKo(e.target.value)} />
      </div>
      <div className={ROW}>
        <span className={LABEL}>{translateBy(ko ? "ko" : "en", "admin_stores_english_name")}</span>
        <input className={`${INPUT} max-w-xs`} value={nameEn} maxLength={60} onChange={(e) => setNameEn(e.target.value)} />
      </div>
      <p className={HINT}>{translateBy(ko ? "ko" : "en", "admin_stores_added_at_end")}</p>
      <AdminActionButton variant="primary" disabled={busy || !nameKo.trim()} onClick={() => onCreate(nameKo.trim(), nameEn.trim() || null)}>
        {adminCta("create", ko)}
      </AdminActionButton>
    </div>
  );
}

function MoveSelect({
  ko,
  value,
  onChange,
  options,
}: {
  ko: boolean;
  value: string;
  onChange: (v: string) => void;
  options: DeliveryMenuAdminRow[];
}) {
  return (
    <select className={`${INPUT} max-w-xs`} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{translateBy(ko ? "ko" : "en", "admin_stores_do_not_move")}</option>
      {options.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name_ko}
        </option>
      ))}
    </select>
  );
}

function RootEditor({
  ko,
  busy,
  root,
  roots,
  allMenus,
  onSave,
  onMove,
  onFeature,
  onDelete,
}: {
  ko: boolean;
  busy: boolean;
  root: DeliveryMenuAdminRow;
  roots: DeliveryMenuAdminRow[];
  allMenus: DeliveryMenuAdminRow[];
  onSave: (patch: Record<string, unknown>) => void;
  onMove: (delta: -1 | 1) => void;
  onFeature: () => void;
  onDelete: (moveTo: string | null) => void;
}) {
  const [nameKo, setNameKo] = useState(root.name_ko);
  const [nameEn, setNameEn] = useState(root.name_en ?? "");
  const [badge, setBadge] = useState(root.badge_text ?? "");
  const [moveTo, setMoveTo] = useState("");
  const idx = roots.findIndex((r) => r.id === root.id);
  const moveOptions = allMenus.filter((m) => m.parent_id != null && m.parent_id !== root.id && !m.link_target);
  return (
    <div className={`${CARD} space-y-2`} data-admin-delivery-menu-editor="root">
      <p className="text-[12px] font-semibold text-sam-primary">{translateBy(ko ? "ko" : "en", "admin_stores_selected_top_tab")}</p>
      <p className="text-[16px] font-semibold text-sam-fg">{root.name_ko}</p>
      <div className={ROW}>
        <span className={LABEL}>{translateBy(ko ? "ko" : "en", "admin_stores_name")}</span>
        <input className={`${INPUT} max-w-[200px]`} value={nameKo} maxLength={60} onChange={(e) => setNameKo(e.target.value)} />
        <input className={`${INPUT} max-w-[200px]`} value={nameEn} maxLength={60} placeholder={translateBy(ko ? "ko" : "en", "admin_stores_english")} onChange={(e) => setNameEn(e.target.value)} />
        <AdminActionButton size="sm" variant="primary" disabled={busy || !nameKo.trim()} onClick={() => onSave({ name_ko: nameKo, name_en: nameEn || null })}>
          {adminCta("save", ko)}
        </AdminActionButton>
      </div>
      <div className={ROW}>
        <span className={LABEL}>{translateBy(ko ? "ko" : "en", "admin_stores_home_shelves_col_order")}</span>
        <AdminActionButton size="sm" disabled={busy || idx <= 0} onClick={() => onMove(-1)}>
          {translateBy(ko ? "ko" : "en", "admin_stores_left")}
        </AdminActionButton>
        <AdminActionButton size="sm" disabled={busy || idx >= roots.length - 1} onClick={() => onMove(1)}>
          {translateBy(ko ? "ko" : "en", "admin_stores_right")}
        </AdminActionButton>
        <span className={HINT}>{translateBy(ko ? "ko" : "en", "admin_stores_text_2", { idx: idx + 1 })}</span>
      </div>
      <div className={ROW}>
        <span className={LABEL}>{translateBy(ko ? "ko" : "en", "admin_stores_visible_3")}</span>
        <AdminSwitch checked={root.is_active} disabled={busy} onChange={(v) => onSave({ is_active: v })} label={translateBy(ko ? "ko" : "en", "admin_stores_visible_3")} />
        <span className={HINT}>{translateBy(ko ? "ko" : "en", "admin_stores_hidden_keeps_menus")}</span>
      </div>
      <div className={ROW}>
        <span className={LABEL}>{translateBy(ko ? "ko" : "en", "admin_stores_pickup_only")}</span>
        <AdminSwitch checked={root.pickup_only} disabled={busy} onChange={(v) => onSave({ pickup_only: v })} label={translateBy(ko ? "ko" : "en", "admin_stores_pickup_only")} />
        <span className={HINT}>{translateBy(ko ? "ko" : "en", "admin_stores_only_pickup_stores")}</span>
      </div>
      <div className={ROW}>
        <span className={LABEL}>{translateBy(ko ? "ko" : "en", "admin_stores_tab_badge")}</span>
        <input className={`${INPUT} max-w-[160px]`} value={badge} maxLength={16} placeholder={translateBy(ko ? "ko" : "en", "admin_stores_e_g_deal")} onChange={(e) => setBadge(e.target.value)} />
        <AdminActionButton size="sm" disabled={busy} onClick={() => onSave({ badge_text: badge || null })}>
          {adminCta("save", ko)}
        </AdminActionButton>
      </div>
      <div className={ROW}>
        <span className={LABEL}>{translateBy(ko ? "ko" : "en", "admin_stores_feature_card")}</span>
        <AdminActionButton size="sm" disabled={busy} onClick={onFeature}>
          {translateBy(ko ? "ko" : "en", "admin_stores_edit_feature_card")}
        </AdminActionButton>
      </div>
      <div className={`${ROW} border-t border-sam-border pt-2`}>
        <span className={LABEL}>{translateBy(ko ? "ko" : "en", "common_delete")}</span>
        <MoveSelect ko={ko} value={moveTo} onChange={setMoveTo} options={moveOptions} />
        <AdminActionButton size="sm" variant="danger" disabled={busy} onClick={() => onDelete(moveTo || null)}>
          {translateBy(ko ? "ko" : "en", "admin_stores_delete_tab")}
        </AdminActionButton>
      </div>
      <p className={HINT}>
        {translateBy(ko ? "ko" : "en", "admin_stores_choose_menu_to_move_stores_that")}
      </p>
    </div>
  );
}

function FeatureEditor({
  ko,
  busy,
  root,
  onSave,
  onUpload,
  onDeleteImage,
}: {
  ko: boolean;
  busy: boolean;
  root: DeliveryMenuAdminRow;
  onSave: (patch: Record<string, unknown>) => void;
  onUpload: (file: File) => void;
  onDeleteImage: () => void;
}) {
  const [title, setTitle] = useState(root.feature_title ?? "");
  const [bg, setBg] = useState(root.feature_bg ?? MIRROR_GOLD);
  const [link, setLink] = useState(root.feature_link_target ?? "");
  return (
    <div className={`${CARD} space-y-2`} data-admin-delivery-menu-editor="feature">
      <p className="text-[12px] font-semibold text-sam-primary">{translateBy(ko ? "ko" : "en", "admin_stores_delivery_menu_selected_feature", { name: (ko ? root.name_ko : root.name_en || root.name_ko) ?? "" })}</p>
      <div className={ROW}>
        <span className={LABEL}>{translateBy(ko ? "ko" : "en", "admin_stores_visible_3")}</span>
        <AdminSwitch checked={root.show_feature} disabled={busy} onChange={(v) => onSave({ show_feature: v })} label={translateBy(ko ? "ko" : "en", "admin_stores_feature_card")} />
        <span className={HINT}>{translateBy(ko ? "ko" : "en", "admin_stores_off_icons_only")}</span>
      </div>
      <div className={ROW}>
        <span className={LABEL}>{translateBy(ko ? "ko" : "en", "admin_stores_text_3")}</span>
        <input className={`${INPUT} max-w-sm`} value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className={ROW}>
        <span className={LABEL}>{translateBy(ko ? "ko" : "en", "admin_stores_accent")}</span>
        <input type="color" className="h-8 w-12 rounded-ui-rect border border-sam-border" value={bg} onChange={(e) => setBg(e.target.value)} />
        <input className={`${INPUT} max-w-[110px]`} value={bg} maxLength={7} onChange={(e) => setBg(e.target.value)} />
      </div>
      <div className={ROW}>
        <span className={LABEL}>{translateBy(ko ? "ko" : "en", "admin_stores_on_tap")}</span>
        <select className={`${INPUT} max-w-xs`} value={link} onChange={(e) => setLink(e.target.value)}>
          <option value="">{translateBy(ko ? "ko" : "en", "admin_stores_this_tab_s_menu_page")}</option>
          {DELIVERY_MENU_LINK_TARGETS.map((t) => (
            <option key={t} value={t}>
              {translateBy(ko ? "ko" : "en", DELIVERY_MENU_LINK_TARGET_LABEL_KEYS[t])}
            </option>
          ))}
        </select>
      </div>
      <AdminActionButton
        variant="primary"
        disabled={busy}
        onClick={() => onSave({ feature_title: title || null, feature_bg: bg || null, feature_link_target: link || null })}
      >
        {adminCta("save", ko)}
      </AdminActionButton>
      <div className={`${ROW} border-t border-sam-border pt-2`}>
        <span className={LABEL}>{translateBy(ko ? "ko" : "en", "admin_stores_background")}</span>
        <input
          type="file"
          accept="image/*"
          className="text-[13px]"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = "";
          }}
        />
        {root.feature_image_url ?
          <AdminActionButton size="sm" variant="danger" disabled={busy} onClick={onDeleteImage}>
            {translateBy(ko ? "ko" : "en", "admin_stores_delete_image_2")}
          </AdminActionButton>
        : <span className={HINT}>{translateBy(ko ? "ko" : "en", "admin_stores_none_built_in_art")}</span>}
      </div>
    </div>
  );
}

function MenuEditor({
  ko,
  busy,
  menu,
  roots,
  siblings,
  allMenus,
  storeCount,
  onSave,
  onReorder,
  onUpload,
  onDeleteImage,
  onStores,
  onDelete,
}: {
  ko: boolean;
  busy: boolean;
  menu: DeliveryMenuAdminRow;
  roots: DeliveryMenuAdminRow[];
  siblings: DeliveryMenuAdminRow[];
  allMenus: DeliveryMenuAdminRow[];
  storeCount: number;
  onSave: (patch: Record<string, unknown>) => void;
  onReorder: (key: "order" | "home_order", list: { id: string; value: number }[]) => void;
  onUpload: (file: File) => void;
  onDeleteImage: () => void;
  onStores: () => void;
  onDelete: (moveTo: string | null) => void;
}) {
  const [nameKo, setNameKo] = useState(menu.name_ko);
  const [nameEn, setNameEn] = useState(menu.name_en ?? "");
  const [moveTo, setMoveTo] = useState("");
  const homeList = [...siblings].sort((a, b) => a.home_sort_order - b.home_sort_order);
  const pageList = [...siblings].sort((a, b) => a.sort_order - b.sort_order);
  const homeIdx = homeList.findIndex((m) => m.id === menu.id);
  const pageIdx = pageList.findIndex((m) => m.id === menu.id);
  const moveOptions = allMenus.filter((m) => m.parent_id != null && m.id !== menu.id && !m.link_target);
  const reorder = (key: "order" | "home_order", list: DeliveryMenuAdminRow[], delta: -1 | 1) => {
    const next = moveInList(list, menu.id, delta);
    if (next) onReorder(key, next.map((m, i) => ({ id: m.id, value: i + 1 })));
  };
  return (
    <div className={`${CARD} space-y-2`} data-admin-delivery-menu-editor="menu">
      <p className="text-[12px] font-semibold text-sam-primary">{translateBy(ko ? "ko" : "en", "admin_stores_selected_menu")}</p>
      <p className="text-[16px] font-semibold text-sam-fg">
        {menu.name_ko} <span className={HINT}>— {roots.find((r) => r.id === menu.parent_id)?.name_ko ?? ""}</span>
      </p>
      <div className={ROW}>
        <span className={LABEL}>{translateBy(ko ? "ko" : "en", "admin_stores_name")}</span>
        <input className={`${INPUT} max-w-[200px]`} value={nameKo} maxLength={60} onChange={(e) => setNameKo(e.target.value)} />
        <input className={`${INPUT} max-w-[200px]`} value={nameEn} maxLength={60} placeholder={translateBy(ko ? "ko" : "en", "admin_stores_english")} onChange={(e) => setNameEn(e.target.value)} />
        <AdminActionButton size="sm" variant="primary" disabled={busy || !nameKo.trim()} onClick={() => onSave({ name_ko: nameKo, name_en: nameEn || null })}>
          {adminCta("save", ko)}
        </AdminActionButton>
      </div>
      <div className={ROW}>
        <span className={LABEL}>{translateBy(ko ? "ko" : "en", "admin_stores_icon")}</span>
        <input
          type="file"
          accept="image/*"
          className="text-[13px]"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = "";
          }}
        />
        {menu.icon_url ?
          <AdminActionButton size="sm" variant="danger" disabled={busy} onClick={onDeleteImage}>
            {translateBy(ko ? "ko" : "en", "admin_stores_delete_icon")}
          </AdminActionButton>
        : <span className={HINT}>{translateBy(ko ? "ko" : "en", "admin_stores_none_built_in_icon")}</span>}
      </div>
      <div className={ROW}>
        <span className={LABEL}>{translateBy(ko ? "ko" : "en", "admin_stores_on_tap")}</span>
        <select className={`${INPUT} max-w-xs`} value={menu.link_target ?? ""} disabled={busy} onChange={(e) => onSave({ link_target: e.target.value || null })}>
          <option value="">{translateBy(ko ? "ko" : "en", "admin_stores_store_list_menu_page")}</option>
          {DELIVERY_MENU_LINK_TARGETS.map((t) => (
            <option key={t} value={t}>
              {translateBy(ko ? "ko" : "en", "admin_stores_screen_link_option", { target: translateBy(ko ? "ko" : "en", DELIVERY_MENU_LINK_TARGET_LABEL_KEYS[t]) })}
            </option>
          ))}
        </select>
      </div>
      <div className={ROW}>
        <span className={LABEL}>{translateBy(ko ? "ko" : "en", "admin_stores_show_on_home")}</span>
        <AdminSwitch checked={menu.show_on_home} disabled={busy} onChange={(v) => onSave({ show_on_home: v })} label={translateBy(ko ? "ko" : "en", "admin_stores_home_icon")} />
        <span className={LABEL}>{translateBy(ko ? "ko" : "en", "admin_stores_show_as_page_tab")}</span>
        <AdminSwitch checked={menu.show_in_page_tab} disabled={busy} onChange={(v) => onSave({ show_in_page_tab: v })} label={translateBy(ko ? "ko" : "en", "admin_stores_page_tab")} />
      </div>
      <div className={ROW}>
        <span className={LABEL}>{translateBy(ko ? "ko" : "en", "admin_stores_home_order")}</span>
        <AdminActionButton size="sm" disabled={busy || homeIdx <= 0} onClick={() => reorder("home_order", homeList, -1)}>
          ◀
        </AdminActionButton>
        <AdminActionButton size="sm" disabled={busy || homeIdx >= homeList.length - 1} onClick={() => reorder("home_order", homeList, 1)}>
          ▶
        </AdminActionButton>
        <span className={HINT}>{translateBy(ko ? "ko" : "en", "admin_stores_text_4", { homeIdx: homeIdx + 1 })}</span>
      </div>
      <div className={ROW}>
        <span className={LABEL}>{translateBy(ko ? "ko" : "en", "admin_stores_page_tab_order")}</span>
        <AdminActionButton size="sm" disabled={busy || pageIdx <= 0} onClick={() => reorder("order", pageList, -1)}>
          ◀
        </AdminActionButton>
        <AdminActionButton size="sm" disabled={busy || pageIdx >= pageList.length - 1} onClick={() => reorder("order", pageList, 1)}>
          ▶
        </AdminActionButton>
        <span className={HINT}>{translateBy(ko ? "ko" : "en", "admin_stores_text_5", { pageIdx: pageIdx + 1 })}</span>
      </div>
      <div className={ROW}>
        <span className={LABEL}>{translateBy(ko ? "ko" : "en", "admin_stores_visible_3")}</span>
        <AdminSwitch checked={menu.is_active} disabled={busy} onChange={(v) => onSave({ is_active: v })} label={translateBy(ko ? "ko" : "en", "admin_stores_visible_3")} />
      </div>
      <div className={ROW}>
        <span className={LABEL}>{translateBy(ko ? "ko" : "en", "admin_stores_move_to_tab")}</span>
        <select className={`${INPUT} max-w-xs`} value={menu.parent_id ?? ""} disabled={busy} onChange={(e) => onSave({ parent_id: e.target.value })}>
          {roots.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name_ko}
            </option>
          ))}
        </select>
      </div>
      {!menu.link_target ?
        <div className={ROW}>
          <span className={LABEL}>{translateBy(ko ? "ko" : "en", "admin_stores_stores")}</span>
          <span className="text-[14px] font-semibold text-sam-fg">{translateBy(ko ? "ko" : "en", "admin_stores_store_count_n", { n: storeCount })}</span>
          <AdminActionButton size="sm" variant="primary" disabled={busy} onClick={onStores}>
            {translateBy(ko ? "ko" : "en", "admin_stores_assign_stores")}
          </AdminActionButton>
        </div>
      : null}
      <div className={`${ROW} border-t border-sam-border pt-2`}>
        <span className={LABEL}>{translateBy(ko ? "ko" : "en", "common_delete")}</span>
        <MoveSelect ko={ko} value={moveTo} onChange={setMoveTo} options={moveOptions} />
        <AdminActionButton size="sm" variant="danger" disabled={busy} onClick={() => onDelete(moveTo || null)}>
          {translateBy(ko ? "ko" : "en", "admin_stores_delete_menu_2")}
        </AdminActionButton>
      </div>
    </div>
  );
}

function StoresEditor({
  ko,
  busy,
  menu,
  stores,
  categories,
  topics,
  menuNamesByStore,
  onSave,
}: {
  ko: boolean;
  busy: boolean;
  menu: DeliveryMenuAdminRow;
  stores: DeliveryMenuAdminStore[];
  categories: { id: string; name: string }[];
  topics: { id: string; name: string; store_category_id: string }[];
  menuNamesByStore: Map<string, string[]>;
  onSave: (ids: string[]) => void;
}) {
  const [ids, setIds] = useState<string[]>(menu.store_ids);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [state, setState] = useState<"all" | "visible" | "hidden">("all");
  const byId = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);
  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "";
  const topicName = (id: string | null) => topics.find((t) => t.id === id)?.name ?? "";
  const label = (s: DeliveryMenuAdminStore) => [catName(s.store_category_id), topicName(s.store_topic_id)].filter(Boolean).join("·");
  const candidates = stores.filter((s) => {
    if (cat && s.store_category_id !== cat) return false;
    if (state === "visible" && !isVisibleStore(s)) return false;
    if (state === "hidden" && isVisibleStore(s)) return false;
    if (q.trim() && !(s.store_name ?? "").toLowerCase().includes(q.trim().toLowerCase())) return false;
    return true;
  });
  const dirty = ids.join(",") !== menu.store_ids.join(",");
  return (
    <div className="grid gap-3 xl:grid-cols-2" data-admin-delivery-menu-editor="stores">
      <div className={`${CARD} space-y-2`}>
        <p className="text-[12px] font-semibold text-sam-primary">{translateBy(ko ? "ko" : "en", "admin_stores_stores_in_this_menu")}</p>
        <p className="text-[16px] font-semibold text-sam-fg">
          {menu.name_ko} — {translateBy(ko ? "ko" : "en", "admin_stores_store_count_n", { n: ids.length })}
        </p>
        <ul className="divide-y divide-sam-border">
          {ids.map((id, i) => {
            const s = byId.get(id);
            return (
              <li key={id} className="flex items-center gap-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-[13px] text-sam-fg">
                  {s?.store_name ?? id}
                  <span className="ml-1 text-[12px] text-sam-muted">{s ? label(s) : ""}</span>
                  {s && !isVisibleStore(s) ? <span className="ml-1 text-[12px] text-sam-danger">{translateBy(ko ? "ko" : "en", "admin_stores_hidden_2")}</span> : null}
                </span>
                <AdminActionButton size="sm" variant="quiet" disabled={i === 0} onClick={() => setIds((p) => moveInList(p.map((x) => ({ id: x })), id, -1)?.map((x) => x.id) ?? p)}>
                  ↑
                </AdminActionButton>
                <AdminActionButton
                  size="sm"
                  variant="quiet"
                  disabled={i === ids.length - 1}
                  onClick={() => setIds((p) => moveInList(p.map((x) => ({ id: x })), id, 1)?.map((x) => x.id) ?? p)}
                >
                  ↓
                </AdminActionButton>
                <AdminActionButton size="sm" variant="ghost" onClick={() => setIds((p) => p.filter((x) => x !== id))}>
                  {translateBy(ko ? "ko" : "en", "admin_stores_remove")}
                </AdminActionButton>
              </li>
            );
          })}
        </ul>
        <p className={HINT}>
          {translateBy(ko ? "ko" : "en", "admin_stores_order_default_sort_order")}
        </p>
        <AdminActionButton variant="primary" disabled={busy || !dirty} onClick={() => onSave(ids)}>
          {adminCta("save", ko)}
        </AdminActionButton>
      </div>
      <div className={`${CARD} space-y-2`}>
        <p className="text-[12px] font-semibold text-sam-primary">{translateBy(ko ? "ko" : "en", "admin_stores_add_stores")}</p>
        <div className={ROW}>
          <input className={`${INPUT} max-w-[180px]`} value={q} placeholder={translateBy(ko ? "ko" : "en", "admin_stores_store_name_2")} onChange={(e) => setQ(e.target.value)} />
          <select className={`${INPUT} max-w-[140px]`} value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">{translateBy(ko ? "ko" : "en", "admin_stores_all_categories")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select className={`${INPUT} max-w-[120px]`} value={state} onChange={(e) => setState(e.target.value as "all" | "visible" | "hidden")}>
            <option value="all">{translateBy(ko ? "ko" : "en", "admin_stores_all")}</option>
            <option value="visible">{translateBy(ko ? "ko" : "en", "admin_stores_visible_4")}</option>
            <option value="hidden">{translateBy(ko ? "ko" : "en", "admin_stores_hidden_3")}</option>
          </select>
        </div>
        <p className={HINT}>{translateBy(ko ? "ko" : "en", "admin_stores_category_is_only_search_filter")}</p>
        <ul className="max-h-[420px] divide-y divide-sam-border overflow-y-auto">
          {candidates.map((s) => {
            const on = ids.includes(s.id);
            return (
              <li key={s.id} className="flex items-center gap-2 py-1.5">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => setIds((p) => (on ? p.filter((x) => x !== s.id) : [...p, s.id]))}
                  aria-label={s.store_name ?? s.id}
                />
                <span className="min-w-0 flex-1 truncate text-[13px] text-sam-fg">
                  {s.store_name}
                  <span className="ml-1 text-[12px] text-sam-muted">{label(s)}</span>
                  {!isVisibleStore(s) ? <span className="ml-1 text-[12px] text-sam-danger">{translateBy(ko ? "ko" : "en", "admin_stores_hidden_2")}</span> : null}
                </span>
                <span className="max-w-[45%] truncate text-[12px] text-sam-muted">{(menuNamesByStore.get(s.id) ?? []).join(" · ")}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function StorePicker({
  ko,
  stores,
  exclude,
  onPick,
}: {
  ko: boolean;
  stores: DeliveryMenuAdminStore[];
  exclude: Set<string>;
  onPick: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const list = q.trim()
    ? stores.filter((s) => !exclude.has(s.id) && (s.store_name ?? "").toLowerCase().includes(q.trim().toLowerCase())).slice(0, 20)
    : [];
  return (
    <div className="space-y-1">
      <input className={`${INPUT} max-w-xs`} value={q} placeholder={translateBy(ko ? "ko" : "en", "admin_stores_find_store_by_name")} onChange={(e) => setQ(e.target.value)} />
      {list.map((s) => (
        <AdminListItemButton key={s.id} onClick={() => onPick(s.id)}>
          <span className="text-[13px] text-sam-fg">{s.store_name}</span>
        </AdminListItemButton>
      ))}
    </div>
  );
}

function ShortcutsEditor({
  ko,
  busy,
  rootName,
  initial,
  stores,
  onSave,
}: {
  ko: boolean;
  busy: boolean;
  rootName: string;
  initial: { store_id: string; caption: string | null }[];
  stores: DeliveryMenuAdminStore[];
  onSave: (list: { store_id: string; caption: string | null }[]) => void;
}) {
  const [list, setList] = useState(initial);
  const byId = new Map(stores.map((s) => [s.id, s]));
  return (
    <div className={`${CARD} space-y-2`} data-admin-delivery-menu-editor="shortcuts">
      <p className="text-[12px] font-semibold text-sam-primary">{translateBy(ko ? "ko" : "en", "admin_stores_delivery_menu_selected_shortcuts", { name: rootName })}</p>
      <ul className="divide-y divide-sam-border">
        {list.map((row, i) => (
          <li key={row.store_id} className="flex flex-wrap items-center gap-2 py-1.5">
            <span className="min-w-[140px] flex-1 truncate text-[13px] text-sam-fg">{byId.get(row.store_id)?.store_name ?? row.store_id}</span>
            <input
              className={`${INPUT} max-w-[140px]`}
              value={row.caption ?? ""}
              maxLength={16}
              placeholder={translateBy(ko ? "ko" : "en", "admin_stores_caption")}
              onChange={(e) => setList((p) => p.map((x, j) => (j === i ? { ...x, caption: e.target.value || null } : x)))}
            />
            <AdminActionButton size="sm" variant="quiet" disabled={i === 0} onClick={() => setList((p) => moveInList(p.map((x) => ({ ...x, id: x.store_id })), row.store_id, -1) ?? p)}>
              ↑
            </AdminActionButton>
            <AdminActionButton size="sm" variant="quiet" disabled={i === list.length - 1} onClick={() => setList((p) => moveInList(p.map((x) => ({ ...x, id: x.store_id })), row.store_id, 1) ?? p)}>
              ↓
            </AdminActionButton>
            <AdminActionButton size="sm" variant="ghost" onClick={() => setList((p) => p.filter((x) => x.store_id !== row.store_id))}>
              {adminCta("delete", ko)}
            </AdminActionButton>
          </li>
        ))}
      </ul>
      <StorePicker ko={ko} stores={stores} exclude={new Set(list.map((x) => x.store_id))} onPick={(id) => setList((p) => [...p, { store_id: id, caption: null }])} />
      <p className={HINT}>{translateBy(ko ? "ko" : "en", "admin_stores_logo_is_automatic_empty_hides_row")}</p>
      <AdminActionButton variant="primary" disabled={busy} onClick={() => onSave(list.map(({ store_id, caption }) => ({ store_id, caption })))}>
        {adminCta("save", ko)}
      </AdminActionButton>
    </div>
  );
}

function DefaultsEditor({
  ko,
  busy,
  categories,
  topics,
  defaults,
  menus,
  onSave,
}: {
  ko: boolean;
  busy: boolean;
  categories: { id: string; name: string }[];
  topics: { id: string; name: string; store_category_id: string }[];
  defaults: { category_id: string; topic_id: string | null; menu_id: string }[];
  menus: DeliveryMenuAdminRow[];
  onSave: (list: { category_id: string; topic_id: string | null; menu_id: string }[]) => void;
}) {
  const key = (c: string, t: string | null) => `${c}:${t ?? ""}`;
  const [map, setMap] = useState<Record<string, string>>(() =>
    Object.fromEntries(defaults.map((d) => [key(d.category_id, d.topic_id), d.menu_id]))
  );
  const options = menus.filter((m) => m.parent_id != null && !m.link_target);
  const rows = categories.flatMap((c) => [
    { category_id: c.id, topic_id: null as string | null, label: `${c.name} (${translateBy(ko ? "ko" : "en", "admin_stores_all_2")})` },
    ...topics.filter((t) => t.store_category_id === c.id).map((t) => ({ category_id: c.id, topic_id: t.id as string | null, label: `${c.name} · ${t.name}` })),
  ]);
  return (
    <div className={`${CARD} space-y-2`} data-admin-delivery-menu-editor="defaults">
      <p className="text-[16px] font-semibold text-sam-fg">{translateBy(ko ? "ko" : "en", "admin_stores_category_default_menus")}</p>
      <p className={HINT}>
        {translateBy(ko ? "ko" : "en", "admin_stores_pre_selected_on_approval_and_used")}
      </p>
      <ul className="divide-y divide-sam-border">
        {rows.map((r) => (
          <li key={key(r.category_id, r.topic_id)} className="flex items-center gap-2 py-1.5">
            <span className="min-w-0 flex-1 truncate text-[13px] text-sam-fg">{r.label}</span>
            <select
              className={`${INPUT} max-w-[200px]`}
              value={map[key(r.category_id, r.topic_id)] ?? ""}
              onChange={(e) => setMap((p) => ({ ...p, [key(r.category_id, r.topic_id)]: e.target.value }))}
            >
              <option value="">{translateBy(ko ? "ko" : "en", "admin_stores_none")}</option>
              {options.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name_ko}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
      <AdminActionButton
        variant="primary"
        disabled={busy}
        onClick={() =>
          onSave(
            rows
              .map((r) => ({ category_id: r.category_id, topic_id: r.topic_id, menu_id: map[key(r.category_id, r.topic_id)] ?? "" }))
              .filter((d) => d.menu_id)
          )
        }
      >
        {adminCta("save", ko)}
      </AdminActionButton>
    </div>
  );
}

function UnassignedEditor({
  ko,
  busy,
  stores,
  menus,
  onAssign,
}: {
  ko: boolean;
  busy: boolean;
  stores: DeliveryMenuAdminStore[];
  menus: DeliveryMenuAdminRow[];
  onAssign: (menuId: string, storeId: string) => void;
}) {
  const [choice, setChoice] = useState<Record<string, string>>({});
  const options = menus.filter((m) => m.parent_id != null && !m.link_target);
  return (
    <div className={`${CARD} space-y-2`} data-admin-delivery-menu-editor="unassigned">
      <p className="text-[16px] font-semibold text-sam-fg">{translateBy(ko ? "ko" : "en", "admin_stores_visible_stores_without_menu_2")}</p>
      <ul className="divide-y divide-sam-border">
        {stores.map((s) => (
          <li key={s.id} className="flex items-center gap-2 py-1.5">
            <span className="min-w-0 flex-1 truncate text-[13px] text-sam-fg">{s.store_name}</span>
            <select className={`${INPUT} max-w-[180px]`} value={choice[s.id] ?? ""} onChange={(e) => setChoice((p) => ({ ...p, [s.id]: e.target.value }))}>
              <option value="">{translateBy(ko ? "ko" : "en", "admin_stores_choose_menu")}</option>
              {options.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name_ko}
                </option>
              ))}
            </select>
            <AdminActionButton size="sm" variant="primary" disabled={busy || !choice[s.id]} onClick={() => onAssign(choice[s.id]!, s.id)}>
              {adminCta("save", ko)}
            </AdminActionButton>
          </li>
        ))}
      </ul>
    </div>
  );
}
