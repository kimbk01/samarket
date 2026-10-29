"use client";

/**
 * WP2 「메뉴 구성」 — 고객 배달 화면 메뉴(업종과 분리) 편집.
 * - 1단 메뉴 = 1차 업종 1개의 페이지, 2단 메뉴 = 그 페이지의 탭 (연결 2차 업종 ∪ 개별 추가 − 개별 제외).
 * - 메뉴만 바꾼다 — 매장·업종·수수료는 그대로. 메뉴 테이블 미적용이면 편집 불가(고객 화면은 업종 그대로).
 * 계산 규칙: `delivery-menus-admin-model.ts` · API: `delivery-menus-admin-api.ts`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton, AdminActionLabel } from "@/components/admin/ui/AdminActionButton";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { dibayAlert } from "@/components/ui/dibay-overlay";
import { clearStoresTaxonomyClientCache } from "@/lib/stores/store-delivery-api-client";
import { isDeliveryMenuSlug, type DeliveryMenuAdminRow } from "@/lib/stores/delivery-menus/delivery-menu-types";
import {
  computeDeliveryMenuCoverage,
  deliveryMenuErrorText,
  isChildMenuShownAsTab,
  isCustomerVisibleStore,
  isMenuLiveNow,
  isoToLocalInput,
  localInputToIso,
  moveSiblingOrder,
  storesForChildMenu,
  type DeliveryMenuAdminStore,
} from "./delivery-menus-admin-model";
import {
  createDeliveryMenu,
  deleteDeliveryMenu,
  deleteDeliveryMenuIcon,
  fetchDeliveryMenusAdmin,
  reorderDeliveryMenus,
  updateDeliveryMenu,
  uploadDeliveryMenuIcon,
  type DeliveryMenusAdminPayload,
} from "./delivery-menus-admin-api";

type MenuDraft = {
  /** 선택 메뉴 id + 불러온 회차 — 다르면 서버 값으로 새로 시작 */
  key: string;
  name_ko: string;
  name_en: string;
  is_active: boolean;
  start: string;
  end: string;
  show_on_home: boolean;
  home_sort_order: number;
  topic_ids: string[];
  include_store_ids: string[];
  exclude_store_ids: string[];
};

function draftFromMenu(m: DeliveryMenuAdminRow, key: string): MenuDraft {
  return {
    key,
    name_ko: m.name_ko,
    name_en: m.name_en ?? "",
    is_active: m.is_active,
    start: isoToLocalInput(m.start_at),
    end: isoToLocalInput(m.end_at),
    show_on_home: m.show_on_home,
    home_sort_order: m.home_sort_order,
    topic_ids: [...m.topic_ids],
    include_store_ids: [...m.include_store_ids],
    exclude_store_ids: [...m.exclude_store_ids],
  };
}

function bySortThenName(a: DeliveryMenuAdminRow, b: DeliveryMenuAdminRow): number {
  return a.sort_order - b.sort_order || a.name_ko.localeCompare(b.name_ko);
}

function storeLabel(s: DeliveryMenuAdminStore, ko: boolean): string {
  return s.store_name?.trim() || (ko ? "(이름 없음)" : "(no name)");
}

const INPUT = "w-full rounded-ui-rect border border-sam-border bg-white px-2 py-1.5 text-[13px] text-sam-fg disabled:bg-sam-surface-muted";
const BADGE = "rounded-ui-rect border px-1.5 py-0.5 text-[12px] font-semibold";

export function DeliveryScreensMenusTab() {
  const { language } = useI18n();
  const ko = language === "ko";

  const [data, setData] = useState<DeliveryMenusAdminPayload | null>(null);
  const [loadError, setLoadError] = useState<{ code: string; status?: number } | null>(null);
  const [loadSeq, setLoadSeq] = useState(0);
  const [nowMs, setNowMs] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MenuDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [addRoot, setAddRoot] = useState<{ categoryId: string; slug: string; name: string } | null>(null);
  const [addChild, setAddChild] = useState<{ parentId: string; slug: string; name: string } | null>(null);

  const reload = useCallback(async () => {
    const r = await fetchDeliveryMenusAdmin();
    if (!r.ok) {
      setLoadError({ code: r.code, status: r.status });
      return;
    }
    setLoadError(null);
    setNowMs(Date.now());
    setData(r.value);
    setLoadSeq((n) => n + 1);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const menus = useMemo(() => data?.menus ?? [], [data]);
  const editable = data != null && data.menus != null;
  const categories = useMemo(() => data?.categories ?? [], [data]);
  const topics = useMemo(() => data?.topics ?? [], [data]);
  const stores = useMemo(() => data?.stores ?? [], [data]);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const roots = useMemo(() => menus.filter((m) => m.parent_id == null).sort(bySortThenName), [menus]);
  const childrenOf = useCallback(
    (rootId: string) => menus.filter((m) => m.parent_id === rootId).sort(bySortThenName),
    [menus]
  );
  const selected = useMemo(() => menus.find((m) => m.id === selectedId) ?? null, [menus, selectedId]);
  const selectedRoot = useMemo(() => {
    if (!selected) return null;
    return selected.parent_id ? (menus.find((m) => m.id === selected.parent_id) ?? null) : selected;
  }, [menus, selected]);
  const primaryId = selectedRoot?.primary_category_id ?? null;

  const draftKey = selected ? `${selected.id}:${loadSeq}` : "";
  const currentDraft = selected ? (draft && draft.key === draftKey ? draft : draftFromMenu(selected, draftKey)) : null;
  const patchDraft = (p: Partial<MenuDraft>) => {
    if (!currentDraft) return;
    setDraft({ ...currentDraft, ...p });
  };

  const visibleStores = useMemo(() => stores.filter(isCustomerVisibleStore), [stores]);
  const primaryStoresAll = useMemo(
    () => (primaryId ? stores.filter((s) => s.store_category_id === primaryId) : []),
    [stores, primaryId]
  );
  const primaryStoresVisible = useMemo(
    () => primaryStoresAll.filter(isCustomerVisibleStore),
    [primaryStoresAll]
  );

  /** 선택 2단 — 편집 중 값 기준 매장 */
  const childStores = useMemo(() => {
    if (!selected?.parent_id || !currentDraft) return [];
    return storesForChildMenu(currentDraft, primaryId, primaryStoresVisible);
  }, [selected, currentDraft, primaryId, primaryStoresVisible]);

  const coverage = useMemo(
    () => (data?.menus ? computeDeliveryMenuCoverage(data.menus, categories, stores, nowMs) : null),
    [data, categories, stores, nowMs]
  );

  const failAlert = useCallback(
    async (code: string) => {
      await dibayAlert({ title: deliveryMenuErrorText(code, ko) });
    },
    [ko]
  );

  const afterMutation = useCallback(async () => {
    clearStoresTaxonomyClientCache();
    await reload();
  }, [reload]);

  const move = async (siblings: DeliveryMenuAdminRow[], id: string, delta: -1 | 1) => {
    const order = moveSiblingOrder(
      siblings.map((s) => s.id),
      id,
      delta
    );
    if (!order) return;
    setBusy(true);
    try {
      const r = await reorderDeliveryMenus(order);
      if (!r.ok) await failAlert(r.code);
      await afterMutation();
    } finally {
      setBusy(false);
    }
  };

  const categoriesWithoutRoot = useMemo(() => {
    const used = new Set(roots.map((r) => r.primary_category_id).filter(Boolean));
    return categories.filter((c) => !used.has(c.id));
  }, [categories, roots]);

  const submitAddRoot = async () => {
    if (!addRoot) return;
    const slug = addRoot.slug.trim().toLowerCase();
    const name = addRoot.name.trim();
    if (!addRoot.categoryId || !name || !isDeliveryMenuSlug(slug)) {
      await failAlert(!name ? "name_required" : "bad_request");
      return;
    }
    setBusy(true);
    try {
      const sort = roots.reduce((m, r) => Math.max(m, r.sort_order), -10) + 10;
      const r = await createDeliveryMenu({ primary_category_id: addRoot.categoryId, slug, name_ko: name, sort_order: sort });
      if (!r.ok) {
        await failAlert(r.code);
        return;
      }
      setAddRoot(null);
      if (r.value) setSelectedId(r.value);
      await afterMutation();
    } finally {
      setBusy(false);
    }
  };

  const submitAddChild = async () => {
    if (!addChild) return;
    const slug = addChild.slug.trim().toLowerCase();
    const name = addChild.name.trim();
    if (!name || !isDeliveryMenuSlug(slug)) {
      await failAlert(!name ? "name_required" : "bad_request");
      return;
    }
    setBusy(true);
    try {
      const sort = childrenOf(addChild.parentId).reduce((m, r) => Math.max(m, r.sort_order), -10) + 10;
      const r = await createDeliveryMenu({ parent_id: addChild.parentId, slug, name_ko: name, sort_order: sort });
      if (!r.ok) {
        await failAlert(r.code);
        return;
      }
      setAddChild(null);
      if (r.value) setSelectedId(r.value);
      await afterMutation();
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!selected || !currentDraft) return;
    if (!currentDraft.name_ko.trim()) {
      await failAlert("name_required");
      return;
    }
    const isChild = selected.parent_id != null;
    if (isChild && currentDraft.include_store_ids.some((x) => currentDraft.exclude_store_ids.includes(x))) {
      await failAlert("include_exclude_overlap");
      return;
    }
    const patch: Record<string, unknown> = {
      name_ko: currentDraft.name_ko.trim(),
      name_en: currentDraft.name_en.trim() || null,
      is_active: currentDraft.is_active,
      start_at: localInputToIso(currentDraft.start),
      end_at: localInputToIso(currentDraft.end),
    };
    if (!isChild) {
      patch.show_on_home = currentDraft.show_on_home;
      patch.home_sort_order = Math.floor(Number(currentDraft.home_sort_order)) || 0;
    }
    setBusy(true);
    try {
      const r = await updateDeliveryMenu({
        id: selected.id,
        patch,
        ...(isChild
          ? {
              topic_ids: currentDraft.topic_ids,
              include_store_ids: currentDraft.include_store_ids,
              exclude_store_ids: currentDraft.exclude_store_ids,
            }
          : {}),
      });
      if (!r.ok) {
        await failAlert(r.code);
        return;
      }
      await afterMutation();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!selected) return;
    const isChild = selected.parent_id != null;
    const n = isChild
      ? storesForChildMenu(selected, primaryId, primaryStoresVisible).length
      : primaryStoresVisible.length;
    const childCount = isChild ? 0 : childrenOf(selected.id).length;
    const description = ko
      ? `메뉴만 삭제됩니다. 매장·업종·수수료는 그대로입니다. 이 메뉴에 보이던 매장 ${n}곳${
          isChild ? "" : `\n하위 2단 메뉴 ${childCount}개도 함께 삭제됩니다.`
        }`
      : `Only the menu is deleted. Stores, categories and commissions stay. Stores shown in this menu: ${n}${
          isChild ? "" : `\nIts ${childCount} sub-menu(s) are deleted too.`
        }`;
    const c = await confirmAdminAction({
      level: adminActionLevel("disable"),
      ko,
      title: ko ? `「${selected.name_ko}」 메뉴를 삭제할까요?` : `Delete menu "${selected.name_ko}"?`,
      description,
      confirmLabel: ko ? "삭제" : "Delete",
      destructive: true,
    });
    if (!c.ok) return;
    setBusy(true);
    try {
      const r = await deleteDeliveryMenu(selected.id);
      if (!r.ok) {
        await failAlert(r.code);
        return;
      }
      setSelectedId(isChild ? selected.parent_id : null);
      await afterMutation();
    } finally {
      setBusy(false);
    }
  };

  const uploadIcon = async (file: File) => {
    if (!selected) return;
    setBusy(true);
    try {
      const r = await uploadDeliveryMenuIcon(selected.id, file);
      if (!r.ok) {
        await failAlert(r.code);
        return;
      }
      await afterMutation();
    } finally {
      setBusy(false);
    }
  };

  const removeIcon = async () => {
    if (!selected) return;
    const c = await confirmAdminAction({
      level: adminActionLevel("disable"),
      ko,
      title: ko ? "아이콘을 삭제할까요?" : "Delete the icon?",
      description: ko ? "고객 화면은 이름 첫 글자 타일로 표시됩니다." : "Customers will see a first-letter tile instead.",
      confirmLabel: ko ? "삭제" : "Delete",
      destructive: true,
    });
    if (!c.ok) return;
    setBusy(true);
    try {
      const r = await deleteDeliveryMenuIcon(selected.id);
      if (!r.ok) {
        await failAlert(r.code);
        return;
      }
      await afterMutation();
    } finally {
      setBusy(false);
    }
  };

  /** 미리보기 — 선택 1단 페이지 · 탭 = 「전체」 + 고객에게 보이는 2단 */
  const preview = useMemo(() => {
    if (!selectedRoot) return null;
    const children = menus
      .filter((m) => m.parent_id === selectedRoot.id)
      .sort(bySortThenName)
      .map((m) =>
        selected && m.id === selected.id && currentDraft
          ? {
              ...m,
              name_ko: currentDraft.name_ko,
              is_active: currentDraft.is_active,
              start_at: localInputToIso(currentDraft.start),
              end_at: localInputToIso(currentDraft.end),
              topic_ids: currentDraft.topic_ids,
              include_store_ids: currentDraft.include_store_ids,
              exclude_store_ids: currentDraft.exclude_store_ids,
            }
          : m
      )
      .filter((m) => isChildMenuShownAsTab(m, nowMs));
    const activeChild = selected?.parent_id ? (children.find((c) => c.id === selected.id) ?? null) : null;
    const tabStores = activeChild
      ? storesForChildMenu(activeChild, selectedRoot.primary_category_id, primaryStoresVisible)
      : primaryStoresVisible;
    const rootName = selected && selected.id === selectedRoot.id && currentDraft ? currentDraft.name_ko : selectedRoot.name_ko;
    return { rootName, children, activeChildId: activeChild?.id ?? null, tabStores };
  }, [selectedRoot, menus, selected, currentDraft, nowMs, primaryStoresVisible]);

  if (!data) {
    return loadError ? (
      <AdminErrorState ko={ko} code={loadError.code} httpStatus={loadError.status} onRetry={() => void reload()} />
    ) : (
      <AdminLoadingState ko={ko} />
    );
  }

  return (
    <section className="rounded-ui-rect border border-sam-border bg-white" data-delivery-screens-section="menus">
      <div className="border-b border-sam-border px-4 py-3">
        <h2 className="text-[16px] font-bold text-sam-fg">{ko ? "메뉴 구성" : "Menus"}</h2>
        <p className="mt-0.5 text-[12px] text-sam-muted">
          {ko
            ? "고객 배달 화면의 메뉴입니다. 1단 = 1차 업종 페이지, 2단 = 그 페이지의 탭. 메뉴만 바뀌고 매장·업종·수수료는 그대로입니다."
            : "Customer delivery menus. Level 1 = a category page, level 2 = tabs on it. Stores, categories and commissions are unchanged."}
        </p>
      </div>

      {!editable ? (
        <p className="m-4 rounded-ui-rect border border-sam-warning bg-sam-surface-muted px-3 py-2 text-[13px] text-sam-fg" role="status">
          {ko
            ? "메뉴 테이블이 아직 적용되지 않았습니다. 고객 화면은 업종 그대로 보입니다."
            : "The menu tables are not applied yet. Customers see the category taxonomy as is."}
        </p>
      ) : null}

      {coverage && (coverage.uncovered.length > 0 || coverage.allTabOnly.length > 0) ? (
        <div className="m-4 space-y-1 rounded-ui-rect border border-sam-warning bg-sam-surface-muted px-3 py-2 text-[13px]" data-delivery-menus-coverage="1">
          {coverage.uncovered.length > 0 ? (
            <details>
              <summary className="cursor-pointer font-semibold text-sam-fg">
                {ko
                  ? `고객 메뉴에 안 보이는 매장 ${coverage.uncovered.length}곳`
                  : `Stores missing from customer menus: ${coverage.uncovered.length}`}
              </summary>
              <ul className="mt-1 max-h-48 overflow-y-auto pl-3 text-[12px] text-sam-muted">
                {coverage.uncovered.map((s) => (
                  <li key={s.id}>
                    {storeLabel(s, ko)}
                    {" · "}
                    {s.store_category_id
                      ? (categoryById.get(s.store_category_id)?.name ?? s.store_category_id)
                      : ko
                        ? "1차 업종 없음"
                        : "No category"}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {coverage.allTabOnly.length > 0 ? (
            <details>
              <summary className="cursor-pointer font-semibold text-sam-fg">
                {ko
                  ? `2단 탭에는 없고 「전체」에서만 보이는 매장 ${coverage.allTabOnly.length}곳`
                  : `Stores only in the "All" tab: ${coverage.allTabOnly.length}`}
              </summary>
              <ul className="mt-1 max-h-48 overflow-y-auto pl-3 text-[12px] text-sam-muted">
                {coverage.allTabOnly.map((s) => (
                  <li key={s.id}>
                    {storeLabel(s, ko)}
                    {" · "}
                    {s.store_category_id ? (categoryById.get(s.store_category_id)?.name ?? "") : ""}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 p-4 xl:grid-cols-[minmax(240px,1fr)_minmax(320px,1.4fr)_auto]">
        {/* 왼쪽: 메뉴 트리 */}
        <div className="min-w-0 space-y-2" data-delivery-menus-tree="1">
          <div className="flex items-center justify-between">
            <h3 className="text-[14px] font-bold text-sam-fg">{ko ? "메뉴" : "Menus"}</h3>
            <AdminActionButton
              size="sm"
              variant="secondary"
              disabled={!editable || busy || categoriesWithoutRoot.length === 0}
              onClick={() => {
                const c = categoriesWithoutRoot[0];
                if (c) setAddRoot({ categoryId: c.id, slug: c.slug, name: c.name });
              }}
            >
              {ko ? "+ 1단 추가" : "+ Level 1"}
            </AdminActionButton>
          </div>

          {addRoot ? (
            <div className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface-muted p-2">
              <label className="block text-[12px] text-sam-muted">
                {ko ? "1차 업종" : "Category"}
                <select
                  className={INPUT}
                  value={addRoot.categoryId}
                  onChange={(e) => {
                    const c = categoryById.get(e.target.value);
                    setAddRoot({ categoryId: e.target.value, slug: c?.slug ?? "", name: c?.name ?? "" });
                  }}
                >
                  {categoriesWithoutRoot.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.is_active === false ? (ko ? " (숨김)" : " (hidden)") : ""}
                    </option>
                  ))}
                </select>
              </label>
              <input
                className={INPUT}
                value={addRoot.name}
                placeholder={ko ? "메뉴 이름" : "Menu name"}
                onChange={(e) => setAddRoot({ ...addRoot, name: e.target.value })}
              />
              <input
                className={INPUT}
                value={addRoot.slug}
                placeholder="slug"
                onChange={(e) => setAddRoot({ ...addRoot, slug: e.target.value })}
              />
              {addRoot.slug && !isDeliveryMenuSlug(addRoot.slug.trim().toLowerCase()) ? (
                <p className="text-[12px] text-sam-danger">
                  {ko ? "영문 소문자·숫자·- 만 (첫 글자는 영문·숫자)" : "Lowercase letters, digits and - only"}
                </p>
              ) : null}
              <div className="flex gap-2">
                <AdminActionButton size="sm" variant="primary" disabled={busy} onClick={() => void submitAddRoot()}>
                  {ko ? "추가" : "Add"}
                </AdminActionButton>
                <AdminActionButton size="sm" variant="secondary" disabled={busy} onClick={() => setAddRoot(null)}>
                  {ko ? "취소" : "Cancel"}
                </AdminActionButton>
              </div>
            </div>
          ) : null}

          {roots.length === 0 ? (
            <p className="text-[12px] text-sam-muted">
              {ko ? "1단 메뉴가 없습니다. 고객 화면은 업종 그대로 보입니다." : "No menus yet. Customers see categories as is."}
            </p>
          ) : (
            <ul className="divide-y divide-sam-border rounded-ui-rect border border-sam-border">
              {roots.map((root, ri) => {
                const kids = childrenOf(root.id);
                const cat = root.primary_category_id ? categoryById.get(root.primary_category_id) : undefined;
                return (
                  <li key={root.id}>
                    <MenuTreeRow
                      ko={ko}
                      menu={root}
                      sub={cat?.name ?? (ko ? "1차 업종 없음" : "No category")}
                      live={isMenuLiveNow(root, nowMs) && cat?.is_active !== false}
                      selected={selectedId === root.id}
                      onSelect={() => setSelectedId(root.id)}
                      canUp={ri > 0}
                      canDown={ri < roots.length - 1}
                      disabled={!editable || busy}
                      onMove={(d) => void move(roots, root.id, d)}
                    />
                    {kids.length > 0 ? (
                      <ul className="border-t border-sam-border bg-sam-surface-muted">
                        {kids.map((kid, ki) => (
                          <li key={kid.id} className="pl-5">
                            <MenuTreeRow
                              ko={ko}
                              menu={kid}
                              sub={kid.slug}
                              live={isChildMenuShownAsTab(kid, nowMs)}
                              selected={selectedId === kid.id}
                              onSelect={() => setSelectedId(kid.id)}
                              canUp={ki > 0}
                              canDown={ki < kids.length - 1}
                              disabled={!editable || busy}
                              onMove={(d) => void move(kids, kid.id, d)}
                            />
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="border-t border-sam-border px-3 py-1.5 pl-5">
                      {addChild?.parentId === root.id ? (
                        <div className="space-y-1.5">
                          <input
                            className={INPUT}
                            value={addChild.name}
                            placeholder={ko ? "2단 이름" : "Tab name"}
                            onChange={(e) => setAddChild({ ...addChild, name: e.target.value })}
                          />
                          <input
                            className={INPUT}
                            value={addChild.slug}
                            placeholder="slug"
                            onChange={(e) => setAddChild({ ...addChild, slug: e.target.value })}
                          />
                          {addChild.slug && !isDeliveryMenuSlug(addChild.slug.trim().toLowerCase()) ? (
                            <p className="text-[12px] text-sam-danger">
                              {ko ? "영문 소문자·숫자·- 만 (첫 글자는 영문·숫자)" : "Lowercase letters, digits and - only"}
                            </p>
                          ) : null}
                          <div className="flex gap-2">
                            <AdminActionButton
                              size="sm"
                              variant="primary"
                              disabled={busy || !isDeliveryMenuSlug(addChild.slug.trim().toLowerCase()) || !addChild.name.trim()}
                              onClick={() => void submitAddChild()}
                            >
                              {ko ? "추가" : "Add"}
                            </AdminActionButton>
                            <AdminActionButton size="sm" variant="secondary" disabled={busy} onClick={() => setAddChild(null)}>
                              {ko ? "취소" : "Cancel"}
                            </AdminActionButton>
                          </div>
                        </div>
                      ) : (
                        <AdminActionButton
                          size="sm"
                          variant="ghost"
                          className="!h-auto !px-0"
                          disabled={!editable || busy}
                          onClick={() => setAddChild({ parentId: root.id, slug: "", name: "" })}
                        >
                          {ko ? "+ 2단 추가" : "+ Level 2"}
                        </AdminActionButton>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* 가운데: 편집 */}
        <div className="min-w-0" data-delivery-menus-editor="1">
          {!selected || !currentDraft ? (
            <p className="rounded-ui-rect border border-dashed border-sam-border px-3 py-6 text-center text-[13px] text-sam-muted">
              {ko ? "왼쪽에서 메뉴를 선택하세요." : "Select a menu on the left."}
            </p>
          ) : (
            <div className="space-y-3 rounded-ui-rect border border-sam-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`${BADGE} border-sam-border text-sam-muted`}>
                  {selected.parent_id ? (ko ? "2단 (탭)" : "Level 2 (tab)") : ko ? "1단 (페이지)" : "Level 1 (page)"}
                </span>
                <span className="text-[12px] text-sam-muted">slug: {selected.slug}</span>
                {primaryId ? (
                  <span className="text-[12px] text-sam-muted">
                    {ko ? "1차 업종" : "Category"}: {categoryById.get(primaryId)?.name ?? primaryId}
                  </span>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="text-[12px] text-sam-muted">
                  {ko ? "이름 (한국어)" : "Name (Korean)"}
                  <input
                    className={INPUT}
                    disabled={!editable}
                    value={currentDraft.name_ko}
                    onChange={(e) => patchDraft({ name_ko: e.target.value })}
                  />
                </label>
                <label className="text-[12px] text-sam-muted">
                  {ko ? "이름 (영어)" : "Name (English)"}
                  <input
                    className={INPUT}
                    disabled={!editable}
                    value={currentDraft.name_en}
                    onChange={(e) => patchDraft({ name_en: e.target.value })}
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] text-sam-muted">{ko ? "아이콘" : "Icon"}</span>
                {selected.icon_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selected.icon_url}
                    alt=""
                    aria-hidden
                    className="h-10 w-10 rounded-ui-rect border border-sam-border object-cover"
                  />
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center rounded-ui-rect border border-dashed border-sam-border text-[12px] text-sam-muted">
                    {ko ? "없음" : "None"}
                  </span>
                )}
                <AdminActionLabel size="sm" variant="secondary" className={!editable || busy ? "pointer-events-none opacity-50" : ""}>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    disabled={!editable || busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void uploadIcon(f);
                    }}
                  />
                  {selected.icon_url ? (ko ? "변경" : "Change") : ko ? "추가" : "Add"}
                </AdminActionLabel>
                {selected.icon_url ? (
                  <AdminActionButton size="sm" variant="danger" disabled={!editable || busy} onClick={() => void removeIcon()}>
                    {ko ? "삭제" : "Delete"}
                  </AdminActionButton>
                ) : null}
              </div>

              <label className="flex items-center gap-2 text-[13px] text-sam-fg">
                <input
                  type="checkbox"
                  disabled={!editable}
                  checked={currentDraft.is_active}
                  onChange={(e) => patchDraft({ is_active: e.target.checked })}
                />
                {ko ? "노출" : "Visible"}
              </label>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="text-[12px] text-sam-muted">
                  {ko ? "시작 (비우면 상시)" : "Start (empty = always)"}
                  <input
                    type="datetime-local"
                    className={INPUT}
                    disabled={!editable}
                    value={currentDraft.start}
                    onChange={(e) => patchDraft({ start: e.target.value })}
                  />
                </label>
                <label className="text-[12px] text-sam-muted">
                  {ko ? "종료 (비우면 상시)" : "End (empty = always)"}
                  <input
                    type="datetime-local"
                    className={INPUT}
                    disabled={!editable}
                    value={currentDraft.end}
                    onChange={(e) => patchDraft({ end: e.target.value })}
                  />
                </label>
              </div>

              {!selected.parent_id ? (
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-[13px] text-sam-fg">
                    <input
                      type="checkbox"
                      disabled={!editable}
                      checked={currentDraft.show_on_home}
                      onChange={(e) => patchDraft({ show_on_home: e.target.checked })}
                    />
                    {ko ? "홈 아이콘에 표시" : "Show as home icon"}
                  </label>
                  <label className="flex items-center gap-2 text-[12px] text-sam-muted">
                    {ko ? "홈 순서" : "Home order"}
                    <input
                      type="number"
                      className={`${INPUT} !w-20`}
                      disabled={!editable || !currentDraft.show_on_home}
                      value={String(currentDraft.home_sort_order)}
                      onChange={(e) => patchDraft({ home_sort_order: Number(e.target.value) || 0 })}
                    />
                  </label>
                </div>
              ) : (
                <>
                  <fieldset className="space-y-1">
                    <legend className="text-[12px] font-semibold text-sam-fg">{ko ? "연결 2차 업종" : "Linked topics"}</legend>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {topics
                        .filter((tp) => tp.store_category_id === primaryId)
                        .map((tp) => {
                          const hidden = tp.is_active === false;
                          return (
                            <label key={tp.id} className={`flex items-center gap-1 text-[13px] ${hidden ? "text-sam-muted" : "text-sam-fg"}`}>
                              <input
                                type="checkbox"
                                disabled={!editable}
                                checked={currentDraft.topic_ids.includes(tp.id)}
                                onChange={(e) =>
                                  patchDraft({
                                    topic_ids: e.target.checked
                                      ? [...currentDraft.topic_ids, tp.id]
                                      : currentDraft.topic_ids.filter((x) => x !== tp.id),
                                  })
                                }
                              />
                              {tp.name}
                              {hidden ? (ko ? " (숨김)" : " (hidden)") : ""}
                            </label>
                          );
                        })}
                    </div>
                  </fieldset>
                  <StorePicker
                    ko={ko}
                    title={ko ? "개별 추가" : "Include stores"}
                    ids={currentDraft.include_store_ids}
                    candidates={primaryStoresAll}
                    blockedIds={currentDraft.exclude_store_ids}
                    disabled={!editable}
                    onChange={(ids) => patchDraft({ include_store_ids: ids })}
                  />
                  <StorePicker
                    ko={ko}
                    title={ko ? "개별 제외" : "Exclude stores"}
                    ids={currentDraft.exclude_store_ids}
                    candidates={primaryStoresAll}
                    blockedIds={currentDraft.include_store_ids}
                    disabled={!editable}
                    onChange={(ids) => patchDraft({ exclude_store_ids: ids })}
                  />
                  <details className="rounded-ui-rect border border-sam-border px-2 py-1.5" data-delivery-menus-store-count="1">
                    <summary className="cursor-pointer text-[13px] font-semibold text-sam-fg">
                      {ko ? `이 메뉴에 보일 매장 ${childStores.length}곳` : `Stores in this menu: ${childStores.length}`}
                    </summary>
                    <ul className="mt-1 max-h-48 overflow-y-auto text-[12px] text-sam-muted">
                      {childStores.map((s) => (
                        <li key={s.id}>{storeLabel(s, ko)}</li>
                      ))}
                    </ul>
                  </details>
                </>
              )}

              <div className="flex flex-wrap gap-2 border-t border-sam-border pt-3">
                <AdminActionButton variant="primary" disabled={!editable || busy} onClick={() => void save()}>
                  {busy ? (ko ? "저장 중…" : "Saving…") : ko ? "저장" : "Save"}
                </AdminActionButton>
                <AdminActionButton variant="secondary" disabled={busy} onClick={() => setDraft(null)}>
                  {ko ? "취소" : "Cancel"}
                </AdminActionButton>
                <AdminActionButton variant="danger" className="ml-auto" disabled={!editable || busy} onClick={() => void remove()}>
                  {ko ? "삭제" : "Delete"}
                </AdminActionButton>
              </div>
            </div>
          )}
        </div>

        {/* 오른쪽: 미리보기 */}
        <div className="min-w-0" data-delivery-menus-preview="1">
          <p className="mb-1 text-[12px] font-semibold text-sam-muted">{ko ? "고객 화면 미리보기" : "Customer preview"}</p>
          <div className="w-full max-w-[360px] overflow-hidden rounded-ui-rect border border-sam-border bg-sam-app">
            {preview ? (
              <>
                <div className="border-b border-sam-border bg-white px-3 py-2 text-[16px] font-bold text-sam-fg">← {preview.rootName}</div>
                <div className="flex gap-4 overflow-x-auto border-b border-sam-border bg-white px-3 text-[13px]">
                  {[{ id: null as string | null, name: ko ? "전체" : "All" }, ...preview.children.map((c) => ({ id: c.id, name: c.name_ko }))].map(
                    (tab) => {
                      const active = tab.id === preview.activeChildId;
                      return (
                        <span
                          key={tab.id ?? "all"}
                          className={`shrink-0 py-2 ${active ? "border-b-2 border-sam-fg font-semibold text-sam-fg" : "text-sam-muted"}`}
                        >
                          {tab.name}
                        </span>
                      );
                    }
                  )}
                </div>
                <ul className="divide-y divide-sam-border bg-white">
                  {preview.tabStores.slice(0, 5).map((s) => (
                    <li key={s.id} className="px-3 py-2.5 text-[13px] text-sam-fg">
                      {storeLabel(s, ko)}
                    </li>
                  ))}
                  {preview.tabStores.length === 0 ? (
                    <li className="px-3 py-4 text-center text-[12px] text-sam-muted">{ko ? "보일 매장이 없습니다." : "No stores."}</li>
                  ) : null}
                </ul>
              </>
            ) : (
              <p className="px-3 py-6 text-center text-[12px] text-sam-muted">{ko ? "메뉴를 선택하면 미리 봅니다." : "Select a menu to preview."}</p>
            )}
          </div>
          <p className="mt-1 text-[12px] text-sam-muted">
            {ko ? `노출·승인 매장 ${visibleStores.length}곳 기준` : `Based on ${visibleStores.length} visible stores`}
          </p>
        </div>
      </div>
    </section>
  );
}

function MenuTreeRow({
  ko,
  menu,
  sub,
  live,
  selected,
  onSelect,
  canUp,
  canDown,
  disabled,
  onMove,
}: {
  ko: boolean;
  menu: DeliveryMenuAdminRow;
  sub: string;
  live: boolean;
  selected: boolean;
  onSelect: () => void;
  canUp: boolean;
  canDown: boolean;
  disabled: boolean;
  onMove: (delta: -1 | 1) => void;
}) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 ${selected ? "bg-sam-primary-soft/60" : "hover:bg-sam-app"}`}>
      <AdminActionButton
        variant="quiet"
        size="sm"
        className="!h-auto min-w-0 flex-1 !flex-col !items-start !justify-start !whitespace-normal !px-0 !py-0 text-left !font-normal"
        onClick={onSelect}
      >
        <span className="block truncate text-[13px] font-semibold text-sam-fg">{menu.name_ko}</span>
        <span className="flex flex-wrap items-center gap-1 text-[12px] text-sam-muted">
          <span className="truncate">{sub}</span>
          <span className={`${BADGE} ${live ? "border-sam-primary text-sam-primary" : "border-sam-border text-sam-muted"}`}>
            {live ? (ko ? "노출" : "On") : ko ? "미노출" : "Off"}
          </span>
          {menu.parent_id == null && menu.show_on_home ? (
            <span className={`${BADGE} border-sam-border text-sam-fg`}>{ko ? "홈 아이콘" : "Home icon"}</span>
          ) : null}
        </span>
      </AdminActionButton>
      <div className="flex shrink-0 gap-1">
        <AdminActionButton size="sm" variant="neutral" className="!px-2" disabled={disabled || !canUp} onClick={() => onMove(-1)} aria-label={ko ? "위로" : "Up"}>
          ↑
        </AdminActionButton>
        <AdminActionButton size="sm" variant="neutral" className="!px-2" disabled={disabled || !canDown} onClick={() => onMove(1)} aria-label={ko ? "아래로" : "Down"}>
          ↓
        </AdminActionButton>
      </div>
    </div>
  );
}

function StorePicker({
  ko,
  title,
  ids,
  candidates,
  blockedIds,
  disabled,
  onChange,
}: {
  ko: boolean;
  title: string;
  ids: string[];
  candidates: DeliveryMenuAdminStore[];
  blockedIds: string[];
  disabled: boolean;
  onChange: (ids: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const byId = useMemo(() => new Map(candidates.map((s) => [s.id, s])), [candidates]);
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return candidates
      .filter((s) => !ids.includes(s.id) && !blockedIds.includes(s.id))
      .filter((s) => (s.store_name ?? "").toLowerCase().includes(needle))
      .slice(0, 20);
  }, [q, candidates, ids, blockedIds]);

  return (
    <div className="space-y-1">
      <p className="text-[12px] font-semibold text-sam-fg">{title}</p>
      <div className="flex flex-wrap gap-1">
        {ids.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 rounded-ui-rect border border-sam-border bg-sam-surface-muted px-1.5 py-0.5 text-[12px] text-sam-fg">
            {byId.get(id) ? storeLabel(byId.get(id)!, ko) : id}
            <AdminActionButton
              variant="quiet"
              size="sm"
              disabled={disabled}
              className="!h-auto !px-1 !py-0 text-sam-muted hover:text-sam-danger"
              aria-label={ko ? "빼기" : "Remove"}
              onClick={() => onChange(ids.filter((x) => x !== id))}
            >
              ×
            </AdminActionButton>
          </span>
        ))}
        {ids.length === 0 ? <span className="text-[12px] text-sam-muted">{ko ? "없음" : "None"}</span> : null}
      </div>
      <input
        className={INPUT}
        disabled={disabled}
        value={q}
        placeholder={ko ? "매장 이름 검색 (이 1차 업종 매장만)" : "Search stores in this category"}
        onChange={(e) => setQ(e.target.value)}
      />
      {matches.length > 0 ? (
        <ul className="max-h-40 overflow-y-auto rounded-ui-rect border border-sam-border bg-white">
          {matches.map((s) => (
            <li key={s.id}>
              <AdminActionButton
                variant="quiet"
                size="sm"
                className="!h-auto w-full !justify-start !rounded-none !px-2 !py-1 text-left !text-[12px] !font-normal text-sam-fg hover:bg-sam-app"
                onClick={() => {
                  onChange([...ids, s.id]);
                  setQ("");
                }}
              >
                {storeLabel(s, ko)}
                {isCustomerVisibleStore(s) ? "" : ko ? " (미노출)" : " (hidden)"}
              </AdminActionButton>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
