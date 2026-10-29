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
  DELIVERY_MENU_LINK_TARGET_LABEL_KO,
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
  const { language } = useI18n();
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
          {ko ? "메뉴 표가 아직 운영 DB에 적용되지 않았습니다. 고객 화면은 업종 화면 그대로입니다." : "Menu tables are not applied yet."}
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
        <p className="text-[16px] font-semibold text-sam-fg">{ko ? "메뉴 관리" : "Delivery menus"}</p>
        <p className={HINT}>
          {ko
            ? "고객 배달 화면의 상단 탭·아이콘·매장을 배민과 같은 구조로 구성합니다. 왼쪽 미리보기를 누르면 오른쪽에서 바로 수정·삭제, 파란 점선 「+」로 추가합니다. 저장하면 고객 앱에 바로 반영됩니다. 업종·수수료는 바뀌지 않습니다."
            : "Build the customer delivery top tabs, icons and stores. Tap the preview to edit; dashed + adds."}
        </p>
        <div className={`${ROW} pt-1`}>
          <AdminChipButton selected={screen.kind === "home"} onClick={() => setScreen({ kind: "home", rootId: screen.rootId })}>
            {ko ? "배달 홈" : "Delivery home"}
          </AdminChipButton>
          {roots.map((r) => (
            <AdminChipButton
              key={r.id}
              selected={screen.kind === "page" && screen.rootId === r.id}
              onClick={() => setScreen({ kind: "page", rootId: r.id, menuId: null })}
            >
              {ko ? `${r.name_ko} 페이지` : `${r.name_ko} page`}
            </AdminChipButton>
          ))}
          <AdminChipButton selected={pick?.kind === "defaults"} onClick={() => setPick({ kind: "defaults" })}>
            {ko ? "업종 기본 메뉴" : "Category defaults"}
          </AdminChipButton>
        </div>
      </div>

      {unassigned.length > 0 ?
        <div className="rounded-ui-rect border border-sam-danger bg-sam-danger-soft p-3" role="alert">
          <div className={ROW}>
            <p className="text-[14px] font-semibold text-sam-danger">
              {ko ? `메뉴에 없는 노출 매장 ${unassigned.length}곳` : `${unassigned.length} visible stores without a menu`}
            </p>
            <AdminActionButton size="sm" variant="secondary" onClick={() => setPick({ kind: "unassigned" })}>
              {ko ? "메뉴 지정" : "Assign menus"}
            </AdminActionButton>
          </div>
          <p className={HINT}>
            {ko
              ? "고객 화면에는 업종 기본 메뉴에 임시로 보입니다. 관리자가 메뉴를 지정해 주세요."
              : "Customers see them in the category default menu until assigned."}
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
                {ko ? "왼쪽 미리보기에서 고칠 곳을 누르세요." : "Tap something in the preview to edit it."}
              </p>
            </div>
          : null}
          {pick?.kind === "add-root" ?
            <AddMenuEditor ko={ko} busy={busy} title={ko ? "상단 탭 추가" : "Add top tab"} onCreate={(nameKo, nameEn) =>
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
              title={ko ? `메뉴 추가 — ${menus.find((m) => m.id === pick.rootId)?.name_ko ?? ""}` : "Add menu"}
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
                  title: ko ? `「${pickedMenu.name_ko}」 상단 탭을 삭제할까요?` : `Delete top tab "${pickedMenu.name_ko}"?`,
                  description: ko
                    ? `안의 메뉴 ${childrenOf(pickedMenu.id).length}개도 함께 삭제됩니다.${moveTo ? " 매장과 업종 기본 메뉴는 고른 메뉴로 옮깁니다." : ""}`
                    : "Its menus are deleted too.",
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
                  title: ko ? `「${pickedMenu.name_ko}」 메뉴를 삭제할까요?` : `Delete menu "${pickedMenu.name_ko}"?`,
                  description: ko
                    ? "매장 지정만 지워지고 매장·업종·수수료는 그대로입니다. 다른 메뉴에 없는 매장은 「옮길 메뉴」로 옮깁니다."
                    : "Only the menu assignment is removed.",
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
              rootName={menus.find((m) => m.id === pick.rootId)?.name_ko ?? ""}
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
        <span className={LABEL}>{ko ? "이름" : "Name"}</span>
        <input className={`${INPUT} max-w-xs`} value={nameKo} maxLength={60} onChange={(e) => setNameKo(e.target.value)} />
      </div>
      <div className={ROW}>
        <span className={LABEL}>{ko ? "영문 이름" : "English name"}</span>
        <input className={`${INPUT} max-w-xs`} value={nameEn} maxLength={60} onChange={(e) => setNameEn(e.target.value)} />
      </div>
      <p className={HINT}>{ko ? "추가하면 맨 뒤에 생깁니다. 매장 0곳인 메뉴는 고객 화면에서 자동으로 숨깁니다." : "Added at the end."}</p>
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
      <option value="">{ko ? "옮기지 않음 (다른 메뉴에 있는 매장만 있을 때)" : "Do not move"}</option>
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
      <p className="text-[12px] font-semibold text-sam-primary">{ko ? "선택: 상단 탭" : "Selected: top tab"}</p>
      <p className="text-[16px] font-semibold text-sam-fg">{root.name_ko}</p>
      <div className={ROW}>
        <span className={LABEL}>{ko ? "이름" : "Name"}</span>
        <input className={`${INPUT} max-w-[200px]`} value={nameKo} maxLength={60} onChange={(e) => setNameKo(e.target.value)} />
        <input className={`${INPUT} max-w-[200px]`} value={nameEn} maxLength={60} placeholder={ko ? "영문" : "English"} onChange={(e) => setNameEn(e.target.value)} />
        <AdminActionButton size="sm" variant="primary" disabled={busy || !nameKo.trim()} onClick={() => onSave({ name_ko: nameKo, name_en: nameEn || null })}>
          {adminCta("save", ko)}
        </AdminActionButton>
      </div>
      <div className={ROW}>
        <span className={LABEL}>{ko ? "순서" : "Order"}</span>
        <AdminActionButton size="sm" disabled={busy || idx <= 0} onClick={() => onMove(-1)}>
          {ko ? "◀ 왼쪽" : "◀ Left"}
        </AdminActionButton>
        <AdminActionButton size="sm" disabled={busy || idx >= roots.length - 1} onClick={() => onMove(1)}>
          {ko ? "오른쪽 ▶" : "Right ▶"}
        </AdminActionButton>
        <span className={HINT}>{ko ? `${idx + 1}번째` : `#${idx + 1}`}</span>
      </div>
      <div className={ROW}>
        <span className={LABEL}>{ko ? "보이기" : "Visible"}</span>
        <AdminSwitch checked={root.is_active} disabled={busy} onChange={(v) => onSave({ is_active: v })} label={ko ? "보이기" : "Visible"} />
        <span className={HINT}>{ko ? "끄면 탭 숨김, 안의 메뉴·매장 지정은 남음" : "Hidden keeps menus"}</span>
      </div>
      <div className={ROW}>
        <span className={LABEL}>{ko ? "픽업 전용" : "Pickup only"}</span>
        <AdminSwitch checked={root.pickup_only} disabled={busy} onChange={(v) => onSave({ pickup_only: v })} label={ko ? "픽업 전용" : "Pickup only"} />
        <span className={HINT}>{ko ? "켜면 「픽업 가능」 매장만 보이고 배달방식 칩 숨김" : "Only pickup stores"}</span>
      </div>
      <div className={ROW}>
        <span className={LABEL}>{ko ? "탭 배지" : "Tab badge"}</span>
        <input className={`${INPUT} max-w-[160px]`} value={badge} maxLength={16} placeholder={ko ? "예: 할인 (비우면 없음)" : "e.g. Deal"} onChange={(e) => setBadge(e.target.value)} />
        <AdminActionButton size="sm" disabled={busy} onClick={() => onSave({ badge_text: badge || null })}>
          {adminCta("save", ko)}
        </AdminActionButton>
      </div>
      <div className={ROW}>
        <span className={LABEL}>{ko ? "대표 카드" : "Feature card"}</span>
        <AdminActionButton size="sm" disabled={busy} onClick={onFeature}>
          {ko ? "대표 카드 수정" : "Edit feature card"}
        </AdminActionButton>
      </div>
      <div className={`${ROW} border-t border-sam-border pt-2`}>
        <span className={LABEL}>{ko ? "삭제" : "Delete"}</span>
        <MoveSelect ko={ko} value={moveTo} onChange={setMoveTo} options={moveOptions} />
        <AdminActionButton size="sm" variant="danger" disabled={busy} onClick={() => onDelete(moveTo || null)}>
          {ko ? "탭 삭제" : "Delete tab"}
        </AdminActionButton>
      </div>
      <p className={HINT}>
        {ko
          ? "안의 메뉴에만 있는 노출 매장이 있으면 「옮길 메뉴」를 골라야 삭제됩니다 (매장은 메뉴 1개 이상 필수)."
          : "Choose a menu to move stores that are only in this tab."}
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
      <p className="text-[12px] font-semibold text-sam-primary">{ko ? `선택: 대표 카드 — ${root.name_ko}` : "Selected: feature card"}</p>
      <div className={ROW}>
        <span className={LABEL}>{ko ? "보이기" : "Visible"}</span>
        <AdminSwitch checked={root.show_feature} disabled={busy} onChange={(v) => onSave({ show_feature: v })} label={ko ? "대표 카드" : "Feature card"} />
        <span className={HINT}>{ko ? "끄면 아이콘이 왼쪽부터 채움 (음식배달 탭처럼)" : "Off = icons only"}</span>
      </div>
      <div className={ROW}>
        <span className={LABEL}>{ko ? "글씨" : "Text"}</span>
        <input className={`${INPUT} max-w-sm`} value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className={ROW}>
        <span className={LABEL}>{ko ? "강조색" : "Accent"}</span>
        <input type="color" className="h-8 w-12 rounded-ui-rect border border-sam-border" value={bg} onChange={(e) => setBg(e.target.value)} />
        <input className={`${INPUT} max-w-[110px]`} value={bg} maxLength={7} onChange={(e) => setBg(e.target.value)} />
      </div>
      <div className={ROW}>
        <span className={LABEL}>{ko ? "누르면" : "On tap"}</span>
        <select className={`${INPUT} max-w-xs`} value={link} onChange={(e) => setLink(e.target.value)}>
          <option value="">{ko ? "이 탭의 메뉴 페이지" : "This tab's menu page"}</option>
          {DELIVERY_MENU_LINK_TARGETS.map((t) => (
            <option key={t} value={t}>
              {DELIVERY_MENU_LINK_TARGET_LABEL_KO[t]}
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
        <span className={LABEL}>{ko ? "배경 그림" : "Background"}</span>
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
            {ko ? "그림 삭제" : "Delete image"}
          </AdminActionButton>
        : <span className={HINT}>{ko ? "없음 — 기본 그림(녹색 바탕 일러스트) 표시. 올리면 카드 배경 사진으로 사용" : "None — built-in art"}</span>}
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
      <p className="text-[12px] font-semibold text-sam-primary">{ko ? "선택: 메뉴 (아이콘·페이지 탭)" : "Selected: menu"}</p>
      <p className="text-[16px] font-semibold text-sam-fg">
        {menu.name_ko} <span className={HINT}>— {roots.find((r) => r.id === menu.parent_id)?.name_ko ?? ""}</span>
      </p>
      <div className={ROW}>
        <span className={LABEL}>{ko ? "이름" : "Name"}</span>
        <input className={`${INPUT} max-w-[200px]`} value={nameKo} maxLength={60} onChange={(e) => setNameKo(e.target.value)} />
        <input className={`${INPUT} max-w-[200px]`} value={nameEn} maxLength={60} placeholder={ko ? "영문" : "English"} onChange={(e) => setNameEn(e.target.value)} />
        <AdminActionButton size="sm" variant="primary" disabled={busy || !nameKo.trim()} onClick={() => onSave({ name_ko: nameKo, name_en: nameEn || null })}>
          {adminCta("save", ko)}
        </AdminActionButton>
      </div>
      <div className={ROW}>
        <span className={LABEL}>{ko ? "그림" : "Icon"}</span>
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
            {ko ? "그림 삭제" : "Delete icon"}
          </AdminActionButton>
        : <span className={HINT}>{ko ? "없음 — 기본 그림(녹색 바탕) 표시. 올리면 올린 그림 우선, 아무 그림이나 가능" : "None — built-in icon"}</span>}
      </div>
      <div className={ROW}>
        <span className={LABEL}>{ko ? "누르면" : "On tap"}</span>
        <select className={`${INPUT} max-w-xs`} value={menu.link_target ?? ""} disabled={busy} onChange={(e) => onSave({ link_target: e.target.value || null })}>
          <option value="">{ko ? "매장 목록 (메뉴 페이지)" : "Store list (menu page)"}</option>
          {DELIVERY_MENU_LINK_TARGETS.map((t) => (
            <option key={t} value={t}>
              {ko ? `화면 연결: ${DELIVERY_MENU_LINK_TARGET_LABEL_KO[t]}` : t}
            </option>
          ))}
        </select>
      </div>
      <div className={ROW}>
        <span className={LABEL}>{ko ? "홈 아이콘에 표시" : "Show on home"}</span>
        <AdminSwitch checked={menu.show_on_home} disabled={busy} onChange={(v) => onSave({ show_on_home: v })} label={ko ? "홈 아이콘" : "Home icon"} />
        <span className={LABEL}>{ko ? "페이지 탭에 표시" : "Show as page tab"}</span>
        <AdminSwitch checked={menu.show_in_page_tab} disabled={busy} onChange={(v) => onSave({ show_in_page_tab: v })} label={ko ? "페이지 탭" : "Page tab"} />
      </div>
      <div className={ROW}>
        <span className={LABEL}>{ko ? "홈 아이콘 순서" : "Home order"}</span>
        <AdminActionButton size="sm" disabled={busy || homeIdx <= 0} onClick={() => reorder("home_order", homeList, -1)}>
          ◀
        </AdminActionButton>
        <AdminActionButton size="sm" disabled={busy || homeIdx >= homeList.length - 1} onClick={() => reorder("home_order", homeList, 1)}>
          ▶
        </AdminActionButton>
        <span className={HINT}>{ko ? `${homeIdx + 1}번째` : `#${homeIdx + 1}`}</span>
      </div>
      <div className={ROW}>
        <span className={LABEL}>{ko ? "페이지 탭 순서" : "Page tab order"}</span>
        <AdminActionButton size="sm" disabled={busy || pageIdx <= 0} onClick={() => reorder("order", pageList, -1)}>
          ◀
        </AdminActionButton>
        <AdminActionButton size="sm" disabled={busy || pageIdx >= pageList.length - 1} onClick={() => reorder("order", pageList, 1)}>
          ▶
        </AdminActionButton>
        <span className={HINT}>{ko ? `${pageIdx + 1}번째 · 배민처럼 홈 순서와 따로` : `#${pageIdx + 1}`}</span>
      </div>
      <div className={ROW}>
        <span className={LABEL}>{ko ? "보이기" : "Visible"}</span>
        <AdminSwitch checked={menu.is_active} disabled={busy} onChange={(v) => onSave({ is_active: v })} label={ko ? "보이기" : "Visible"} />
      </div>
      <div className={ROW}>
        <span className={LABEL}>{ko ? "상단 탭 이동" : "Move to tab"}</span>
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
          <span className={LABEL}>{ko ? "매장" : "Stores"}</span>
          <span className="text-[14px] font-semibold text-sam-fg">{ko ? `${storeCount}곳` : storeCount}</span>
          <AdminActionButton size="sm" variant="primary" disabled={busy} onClick={onStores}>
            {ko ? "매장 지정" : "Assign stores"}
          </AdminActionButton>
        </div>
      : null}
      <div className={`${ROW} border-t border-sam-border pt-2`}>
        <span className={LABEL}>{ko ? "삭제" : "Delete"}</span>
        <MoveSelect ko={ko} value={moveTo} onChange={setMoveTo} options={moveOptions} />
        <AdminActionButton size="sm" variant="danger" disabled={busy} onClick={() => onDelete(moveTo || null)}>
          {ko ? "메뉴 삭제" : "Delete menu"}
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
        <p className="text-[12px] font-semibold text-sam-primary">{ko ? "이 메뉴에 들어간 매장 (앱 목록)" : "Stores in this menu"}</p>
        <p className="text-[16px] font-semibold text-sam-fg">
          {menu.name_ko} — {ko ? `${ids.length}곳` : ids.length}
        </p>
        <ul className="divide-y divide-sam-border">
          {ids.map((id, i) => {
            const s = byId.get(id);
            return (
              <li key={id} className="flex items-center gap-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-[13px] text-sam-fg">
                  {s?.store_name ?? id}
                  <span className="ml-1 text-[12px] text-sam-muted">{s ? label(s) : ""}</span>
                  {s && !isVisibleStore(s) ? <span className="ml-1 text-[12px] text-sam-danger">{ko ? "숨김 매장" : "hidden"}</span> : null}
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
                  {ko ? "빼기" : "Remove"}
                </AdminActionButton>
              </li>
            );
          })}
        </ul>
        <p className={HINT}>
          {ko
            ? "순서 = 「기본순」일 때 앱 순서. 빼도 매장·업종·수수료는 그대로. 다른 메뉴에 없는 노출 매장은 뺄 수 없습니다."
            : "Order = default sort order."}
        </p>
        <AdminActionButton variant="primary" disabled={busy || !dirty} onClick={() => onSave(ids)}>
          {adminCta("save", ko)}
        </AdminActionButton>
      </div>
      <div className={`${CARD} space-y-2`}>
        <p className="text-[12px] font-semibold text-sam-primary">{ko ? "매장 추가 — 모든 매장에서 찾기" : "Add stores"}</p>
        <div className={ROW}>
          <input className={`${INPUT} max-w-[180px]`} value={q} placeholder={ko ? "매장 이름" : "Store name"} onChange={(e) => setQ(e.target.value)} />
          <select className={`${INPUT} max-w-[140px]`} value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">{ko ? "업종: 전체" : "All categories"}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select className={`${INPUT} max-w-[120px]`} value={state} onChange={(e) => setState(e.target.value as "all" | "visible" | "hidden")}>
            <option value="all">{ko ? "상태: 전체" : "All"}</option>
            <option value="visible">{ko ? "노출 매장" : "Visible"}</option>
            <option value="hidden">{ko ? "숨김 매장" : "Hidden"}</option>
          </select>
        </div>
        <p className={HINT}>{ko ? "업종은 찾기용 필터일 뿐 — 마트·공구 매장도 음식배달 메뉴에 넣을 수 있음. 한 매장을 여러 메뉴에 넣을 수 있음." : "Category is only a search filter."}</p>
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
                  {!isVisibleStore(s) ? <span className="ml-1 text-[12px] text-sam-danger">{ko ? "숨김 매장" : "hidden"}</span> : null}
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
      <input className={`${INPUT} max-w-xs`} value={q} placeholder={ko ? "매장 이름으로 찾기" : "Find store by name"} onChange={(e) => setQ(e.target.value)} />
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
      <p className="text-[12px] font-semibold text-sam-primary">{ko ? `선택: 매장 바로가기 줄 — ${rootName}` : "Selected: store shortcuts"}</p>
      <ul className="divide-y divide-sam-border">
        {list.map((row, i) => (
          <li key={row.store_id} className="flex flex-wrap items-center gap-2 py-1.5">
            <span className="min-w-[140px] flex-1 truncate text-[13px] text-sam-fg">{byId.get(row.store_id)?.store_name ?? row.store_id}</span>
            <input
              className={`${INPUT} max-w-[140px]`}
              value={row.caption ?? ""}
              maxLength={16}
              placeholder={ko ? "아래 글씨 (선택)" : "Caption"}
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
      <p className={HINT}>{ko ? "그림은 매장 로고 자동 · 비우면 줄 숨김 · 누르면 그 매장 화면" : "Logo is automatic. Empty hides the row."}</p>
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
    { category_id: c.id, topic_id: null as string | null, label: `${c.name} (${ko ? "1차 전체" : "all"})` },
    ...topics.filter((t) => t.store_category_id === c.id).map((t) => ({ category_id: c.id, topic_id: t.id as string | null, label: `${c.name} · ${t.name}` })),
  ]);
  return (
    <div className={`${CARD} space-y-2`} data-admin-delivery-menu-editor="defaults">
      <p className="text-[16px] font-semibold text-sam-fg">{ko ? "업종 기본 메뉴" : "Category default menus"}</p>
      <p className={HINT}>
        {ko
          ? "새 매장을 승인하면 이 메뉴가 미리 선택되고, 메뉴 없이 노출된 매장은 이 메뉴에 자동으로 들어갑니다 (2차가 1차보다 우선). 업종·수수료는 그대로."
          : "Pre-selected on approval and used as the safety fallback."}
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
              <option value="">{ko ? "지정 안 함" : "None"}</option>
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
      <p className="text-[16px] font-semibold text-sam-fg">{ko ? "메뉴에 없는 노출 매장" : "Visible stores without a menu"}</p>
      <ul className="divide-y divide-sam-border">
        {stores.map((s) => (
          <li key={s.id} className="flex items-center gap-2 py-1.5">
            <span className="min-w-0 flex-1 truncate text-[13px] text-sam-fg">{s.store_name}</span>
            <select className={`${INPUT} max-w-[180px]`} value={choice[s.id] ?? ""} onChange={(e) => setChoice((p) => ({ ...p, [s.id]: e.target.value }))}>
              <option value="">{ko ? "메뉴 고르기" : "Choose menu"}</option>
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
