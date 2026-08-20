"use client";

/**
 * `/admin/menus/trade` — legacy-style drill:
 * 주제 리스트 → 주제 상세(카테고리 + 등록 옵션) → 카테고리 상세
 * SSOT KEEP: categories / field_composition / CUT A ROOT options.
 */
import { dibayConfirm } from "@/components/ui/dibay-overlay";
import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useCategoryAdmin } from "@/components/admin/categories/useCategoryAdmin";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CategoryIcon } from "@/components/home/CategoryIcon";
import { CategoryFieldCompositionEditor } from "@/components/admin/categories/CategoryFieldCompositionEditor";
import { TradeMenuWritePreviewSheet } from "@/components/admin/menus/TradeMenuWritePreviewSheet";
import { updateCategory } from "@/lib/categories/updateCategory";
import { updateCategoryAdmin } from "@/lib/categories/admin/updateCategory";
import { createCategory } from "@/lib/categories/admin/createCategory";
import { swapCategorySortOrders } from "@/lib/categories/swapCategorySortOrder";
import { checkSlugAvailable } from "@/lib/categories/admin/checkSlugAvailable";
import { allocateUniqueCategorySlug } from "@/lib/categories/slugify-category-name";
import { notifyMainBottomNavConfigChanged } from "@/lib/app/fetch-main-bottom-nav-deduped";
import { TRADE_SUBTYPE_OPTIONS, TRADE_SUBTYPE_PRESET_VALUES } from "@/lib/types/category";
import type { CategoryWithSettings } from "@/lib/categories/types";
import type { TradeFieldCompositionPayload } from "@/lib/trade/category-form";
import {
  ConsoleButton,
  SectionHeader,
} from "@/components/admin/trade-console/trade-console-ui";
import { Sam } from "@/lib/ui/sam-component-classes";

type View =
  | { kind: "list" }
  | { kind: "root"; id: string }
  | { kind: "root-create" }
  | { kind: "child"; rootId: string; childId: string }
  | { kind: "child-create"; rootId: string }
  | { kind: "options"; rootId: string };

async function requestPruneOrphanMarketBottomNav(): Promise<void> {
  try {
    await fetch("/api/admin/main-bottom-nav/prune-orphan-market", {
      method: "POST",
      cache: "no-store",
    });
  } catch {
    /* ignore */
  }
}

function childrenOf(all: CategoryWithSettings[], parentId: string): CategoryWithSettings[] {
  return all
    .filter((c) => c.parent_id === parentId)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

function settingsFrom(cat: CategoryWithSettings) {
  const s = cat.settings;
  return {
    can_write: s?.can_write ?? true,
    has_price: s?.has_price ?? true,
    has_chat: s?.has_chat ?? true,
    has_location: s?.has_location ?? true,
    has_direct_deal: s?.has_direct_deal ?? true,
    has_free_share: s?.has_free_share ?? true,
    post_type: s?.post_type ?? "normal",
  };
}

export function AdminMenusPage() {
  const { t, safeT } = useI18n();
  const {
    list,
    loading,
    message,
    supabaseAvailable,
    load,
    handleDelete,
    showSuccess,
  } = useCategoryAdmin();

  const roots = useMemo(
    () => list.filter((c) => c.type === "trade" && c.parent_id == null),
    [list]
  );

  const [view, setView] = useState<View>({ kind: "list" });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [draftComposition, setDraftComposition] = useState<unknown | null>(null);
  const [optionsDirty, setOptionsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const syncBottomNav = useCallback(async () => {
    await requestPruneOrphanMarketBottomNav();
    notifyMainBottomNavConfigChanged();
  }, []);

  const refresh = useCallback(async () => {
    await load();
    void syncBottomNav();
  }, [load, syncBottomNav]);

  const rootById = useCallback(
    (id: string) => roots.find((r) => r.id === id) ?? list.find((c) => c.id === id) ?? null,
    [roots, list]
  );

  const activeRoot =
    view.kind === "root" || view.kind === "options" || view.kind === "child" || view.kind === "child-create"
      ? rootById(view.kind === "root" ? view.id : view.rootId)
      : null;

  const leaveOptionsIfDirty = useCallback(async () => {
    if (!optionsDirty) return true;
    return dibayConfirm({
      title: safeT("admin_menu_trade_unsaved_confirm", {
        fallbackKo: "저장하지 않은 옵션 변경이 있습니다. 나갈까요?",
        fallbackEn: "You have unsaved option changes. Leave?",
      }),
      confirmTone: "destructive",
    });
  }, [optionsDirty, safeT]);

  const goList = useCallback(async () => {
    if (view.kind === "options" && !(await leaveOptionsIfDirty())) return;
    setOptionsDirty(false);
    setView({ kind: "list" });
  }, [view.kind, leaveOptionsIfDirty]);

  const openRoot = useCallback(
    async (id: string) => {
      if (view.kind === "options" && !(await leaveOptionsIfDirty())) return;
      setOptionsDirty(false);
      setView({ kind: "root", id });
    },
    [view.kind, leaveOptionsIfDirty]
  );

  const openOptions = useCallback(
    (root: CategoryWithSettings) => {
      setDraftComposition(root.settings?.field_composition ?? null);
      setOptionsDirty(false);
      setView({ kind: "options", rootId: root.id });
    },
    []
  );

  const previewCategory = useMemo((): CategoryWithSettings | null => {
    if (!activeRoot || view.kind !== "options") return null;
    const baseSettings = activeRoot.settings;
    return {
      ...activeRoot,
      settings: {
        can_write: baseSettings?.can_write ?? true,
        has_price: baseSettings?.has_price ?? true,
        has_chat: baseSettings?.has_chat ?? true,
        has_location: baseSettings?.has_location ?? true,
        has_direct_deal: baseSettings?.has_direct_deal ?? true,
        has_free_share: baseSettings?.has_free_share ?? true,
        post_type: baseSettings?.post_type ?? "normal",
        field_composition: draftComposition,
      },
    };
  }, [activeRoot, draftComposition, view.kind]);

  const saveOptions = useCallback(async () => {
    if (!activeRoot) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await updateCategoryAdmin(
        activeRoot.id,
        {
          name: activeRoot.name,
          name_en: activeRoot.name_en ?? null,
          slug: activeRoot.slug,
          icon_key: activeRoot.icon_key,
          type: activeRoot.type,
          sort_order: activeRoot.sort_order,
          is_active: activeRoot.is_active,
          description: activeRoot.description,
          quick_create_enabled: activeRoot.quick_create_enabled,
          quick_create_group: activeRoot.quick_create_group,
          quick_create_order: activeRoot.quick_create_order,
          show_in_home_chips: activeRoot.show_in_home_chips,
          parent_id: null,
        },
        {
          ...settingsFrom(activeRoot),
          field_composition: draftComposition as TradeFieldCompositionPayload | null,
        }
      );
      if (!res.ok) {
        setFormError(res.error);
        return;
      }
      setOptionsDirty(false);
      showSuccess(t("admin_cat_msg_saved"));
      await refresh();
    } finally {
      setSaving(false);
    }
  }, [activeRoot, draftComposition, refresh, showSuccess, t]);

  /* ── ROOT create / edit local form state ── */
  const [rootName, setRootName] = useState("");
  const [rootActive, setRootActive] = useState(true);
  const [rootChip, setRootChip] = useState(true);
  const [rootLauncher, setRootLauncher] = useState(true);
  const [rootSubtype, setRootSubtype] = useState("general");
  const [rootSort, setRootSort] = useState(0);

  const beginRootCreate = () => {
    setRootName("");
    setRootActive(true);
    setRootChip(true);
    setRootLauncher(true);
    setRootSubtype("general");
    setRootSort(roots.length);
    setFormError(null);
    setView({ kind: "root-create" });
  };

  const beginRootEditBasics = (root: CategoryWithSettings) => {
    setRootName(root.name);
    setRootActive(root.is_active);
    setRootChip(root.show_in_home_chips !== false);
    setRootLauncher(root.quick_create_enabled);
    setRootSubtype(
      TRADE_SUBTYPE_PRESET_VALUES.includes(root.icon_key) ? root.icon_key : "general"
    );
    setRootSort(root.sort_order);
    setFormError(null);
  };

  const saveRootCreate = async () => {
    if (!rootName.trim()) return;
    setSaving(true);
    setFormError(null);
    try {
      const slug = await allocateUniqueCategorySlug(rootName, async (s) => {
        const r = await checkSlugAvailable(s);
        return r.available;
      });
      const res = await createCategory(
        {
          name: rootName.trim(),
          name_en: null,
          slug,
          icon_key: rootSubtype,
          type: "trade",
          sort_order: rootSort,
          is_active: rootActive,
          description: null,
          quick_create_enabled: rootLauncher,
          quick_create_group: null,
          quick_create_order: 0,
          show_in_home_chips: rootChip,
          parent_id: null,
        },
        {
          can_write: true,
          has_price: true,
          has_chat: true,
          has_location: true,
          has_direct_deal: true,
          has_free_share: true,
          post_type: "normal",
        }
      );
      if (!res.ok) {
        setFormError(res.error);
        return;
      }
      showSuccess(t("admin_cat_msg_created"));
      await refresh();
      setView({ kind: "list" });
    } finally {
      setSaving(false);
    }
  };

  const saveRootBasics = async (root: CategoryWithSettings) => {
    if (!rootName.trim()) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await updateCategoryAdmin(
        root.id,
        {
          name: rootName.trim(),
          name_en: root.name_en ?? null,
          slug: root.slug,
          icon_key: rootSubtype,
          type: "trade",
          sort_order: rootSort,
          is_active: rootActive,
          description: root.description,
          quick_create_enabled: rootLauncher,
          quick_create_group: root.quick_create_group,
          quick_create_order: root.quick_create_order,
          show_in_home_chips: rootChip,
          parent_id: null,
        },
        settingsFrom(root)
      );
      if (!res.ok) {
        setFormError(res.error);
        return;
      }
      showSuccess(t("admin_cat_msg_saved"));
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  /* ── CHILD form ── */
  const [childName, setChildName] = useState("");
  const [childActive, setChildActive] = useState(true);
  const [childSort, setChildSort] = useState(0);

  const beginChildCreate = (root: CategoryWithSettings) => {
    const kids = childrenOf(list, root.id);
    setChildName("");
    setChildActive(true);
    setChildSort(kids.length);
    setFormError(null);
    setView({ kind: "child-create", rootId: root.id });
  };

  const beginChildEdit = (rootId: string, child: CategoryWithSettings) => {
    setChildName(child.name);
    setChildActive(child.is_active);
    setChildSort(child.sort_order);
    setFormError(null);
    setView({ kind: "child", rootId, childId: child.id });
  };

  const saveChild = async (root: CategoryWithSettings, child?: CategoryWithSettings) => {
    if (!childName.trim()) return;
    setSaving(true);
    setFormError(null);
    try {
      if (child) {
        const res = await updateCategoryAdmin(
          child.id,
          {
            name: childName.trim(),
            name_en: child.name_en ?? null,
            slug: child.slug,
            icon_key: child.icon_key,
            type: child.type,
            sort_order: childSort,
            is_active: childActive,
            description: child.description,
            quick_create_enabled: false,
            quick_create_group: null,
            quick_create_order: 0,
            show_in_home_chips: false,
            parent_id: root.id,
          },
          settingsFrom(child)
        );
        if (!res.ok) {
          setFormError(res.error);
          return;
        }
      } else {
        const slug = await allocateUniqueCategorySlug(childName, async (s) => {
          const r = await checkSlugAvailable(s);
          return r.available;
        });
        const res = await createCategory(
          {
            name: childName.trim(),
            name_en: null,
            slug,
            icon_key: root.icon_key,
            type: "trade",
            sort_order: childSort,
            is_active: childActive,
            description: null,
            quick_create_enabled: false,
            quick_create_group: null,
            quick_create_order: 0,
            show_in_home_chips: false,
            parent_id: root.id,
          },
          settingsFrom(root)
        );
        if (!res.ok) {
          setFormError(res.error);
          return;
        }
      }
      showSuccess(t("admin_cat_msg_saved"));
      await refresh();
      setView({ kind: "root", id: root.id });
    } finally {
      setSaving(false);
    }
  };

  const moveRoot = async (id: string, dir: -1 | 1) => {
    const idx = roots.findIndex((r) => r.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= roots.length) return;
    const res = await swapCategorySortOrders(roots[idx], roots[j]);
    if (res.ok) {
      showSuccess(t("admin_cat_msg_reordered"));
      await refresh();
    }
  };

  const moveChild = async (rootId: string, id: string, dir: -1 | 1) => {
    const kids = childrenOf(list, rootId);
    const idx = kids.findIndex((c) => c.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= kids.length) return;
    const res = await swapCategorySortOrders(kids[idx], kids[j]);
    if (res.ok) {
      showSuccess(t("admin_cat_msg_reordered"));
      await refresh();
    }
  };

  const toggleActive = async (id: string, current: boolean) => {
    const res = await updateCategory(id, { is_active: !current });
    if (res.ok) {
      showSuccess(!current ? t("admin_cat_msg_activated") : t("admin_cat_msg_deactivated"));
      await refresh();
    }
  };

  const deleteWithConfirm = async (id: string, back: View) => {
    if (
      !(await dibayConfirm({
        title: t("admin_cat_confirm_delete"),
        confirmTone: "destructive",
      }))
    ) {
      return;
    }
    const ok = await handleDelete(id);
    if (ok) {
      void syncBottomNav();
      setView(back);
      await load();
    }
  };

  /* ───────── render ───────── */

  if (loading && list.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-8 text-center sam-text-body text-sam-muted">
        {t("common_loading")}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-admin>
      <SectionHeader
        title={safeT("admin_menu_trade_mgmt_title", {
          fallbackKo: "거래 메뉴 설정",
          fallbackEn: "Trade menu settings",
        })}
        description={safeT("admin_menu_trade_mgmt_subtitle", {
          fallbackKo:
            "주제 → 카테고리 → 등록 옵션 순으로 관리합니다. 옵션은 주제에만 적용됩니다.",
          fallbackEn:
            "Manage subjects → categories → listing options. Options apply on the subject only.",
        })}
        actions={
          view.kind === "list" ? (
            <ConsoleButton variant="primary" onClick={beginRootCreate}>
              {safeT("admin_menu_trade_add_root", {
                fallbackKo: "+ 주제 추가",
                fallbackEn: "+ Add subject",
              })}
            </ConsoleButton>
          ) : (
            <ConsoleButton
              variant="secondary"
              onClick={() => {
                void goList();
              }}
            >
              {safeT("admin_menu_trade_back_list", {
                fallbackKo: "← 주제 목록",
                fallbackEn: "← Subjects",
              })}
            </ConsoleButton>
          )
        }
      />

      <p className="sam-text-body-secondary text-sam-muted">
        {t("admin_menu_trade_sync_p1")}{" "}
        <span className="font-mono sam-text-helper text-sam-fg">/market/…</span>
        {t("admin_menu_trade_sync_p2")}
        <span className="font-mono sam-text-helper"> /philife</span>
        {t("admin_menu_trade_sync_p3")}{" "}
        <Link href="/admin/menus/main-bottom-nav" className="font-medium text-signature hover:underline">
          {t("admin_menu_main_bottom_nav")}
        </Link>
        {t("admin_menu_trade_sync_p4")}
      </p>

      {supabaseAvailable === false && (
        <div className="rounded-ui-rect border border-amber-200 bg-amber-50 px-4 py-3 sam-text-body-secondary text-amber-800">
          <p className="font-medium">{t("admin_cat_supabase_title")}</p>
          <p className="mt-1 text-amber-700">{t("admin_cat_supabase_body")}</p>
        </div>
      )}

      {message && (
        <div
          className={`rounded-ui-rect px-4 py-2 sam-text-body ${
            message.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}
      {formError ? <p className="sam-text-body text-red-700">{formError}</p> : null}

      {/* LIST */}
      {view.kind === "list" ? (
        <section className="rounded-ui-rect border border-sam-border bg-sam-surface">
          <div className="border-b border-sam-border px-3 py-2">
            <h2 className="sam-text-body font-semibold text-sam-fg">{t("admin_menu_trade_items_heading")}</h2>
          </div>
          {roots.length === 0 ? (
            <p className="px-3 py-8 text-center sam-text-body text-sam-muted">{t("admin_menu_table_empty")}</p>
          ) : (
            <ul className="divide-y divide-sam-border-soft">
              {roots.map((r, i) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-sam-surface-muted/80"
                    onClick={() => {
                      beginRootEditBasics(r);
                      void openRoot(r.id);
                    }}
                  >
                    <CategoryIcon iconKey={r.icon_key} className="h-8 w-8 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="sam-text-body font-medium text-sam-fg">{r.name}</p>
                      <p className="sam-text-xxs text-sam-muted">
                        {r.is_active ? t("admin_menu_status_active") : t("admin_menu_status_inactive")}
                        {" · "}
                        {safeT("admin_menu_trade_option_order", {
                          fallbackKo: "순서 {n}",
                          fallbackEn: "Order {n}",
                          vars: { n: i + 1 },
                        })}
                        {" · "}
                        {safeT("admin_menu_trade_child_count", {
                          fallbackKo: "카테고리 {n}",
                          fallbackEn: "Categories {n}",
                          vars: { n: childrenOf(list, r.id).length },
                        })}
                      </p>
                    </div>
                    <span className="text-signature">›</span>
                  </button>
                  <div className="flex gap-1 px-3 pb-2">
                    <button type="button" className={`${Sam.btn.ghost} ${Sam.btn.sm}`} onClick={() => void moveRoot(r.id, -1)}>
                      ↑
                    </button>
                    <button type="button" className={`${Sam.btn.ghost} ${Sam.btn.sm}`} onClick={() => void moveRoot(r.id, 1)}>
                      ↓
                    </button>
                    <button
                      type="button"
                      className={`${Sam.btn.ghost} ${Sam.btn.sm}`}
                      onClick={() => void toggleActive(r.id, r.is_active)}
                    >
                      {r.is_active ? t("admin_menu_status_inactive") : t("admin_menu_status_active")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {/* ROOT CREATE */}
      {view.kind === "root-create" ? (
        <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h2 className="sam-text-body font-semibold text-sam-fg">
            {safeT("admin_menu_trade_add_root", {
              fallbackKo: "주제 추가",
              fallbackEn: "Add subject",
            })}
          </h2>
          <RootBasicsFields
            name={rootName}
            setName={setRootName}
            active={rootActive}
            setActive={setRootActive}
            chip={rootChip}
            setChip={setRootChip}
            launcher={rootLauncher}
            setLauncher={setRootLauncher}
            subtype={rootSubtype}
            setSubtype={setRootSubtype}
            sort={rootSort}
            setSort={setRootSort}
          />
          <div className="flex flex-wrap gap-2">
            <ConsoleButton variant="primary" disabled={saving} onClick={() => void saveRootCreate()}>
              {t("common_save")}
            </ConsoleButton>
            <ConsoleButton variant="secondary" onClick={() => setView({ kind: "list" })}>
              {t("common_cancel")}
            </ConsoleButton>
          </div>
        </section>
      ) : null}

      {/* ROOT DETAIL */}
      {view.kind === "root" && activeRoot ? (
        <RootDetail
          root={activeRoot}
          childRows={childrenOf(list, activeRoot.id)}
          rootName={rootName}
          setRootName={setRootName}
          rootActive={rootActive}
          setRootActive={setRootActive}
          rootChip={rootChip}
          setRootChip={setRootChip}
          rootLauncher={rootLauncher}
          setRootLauncher={setRootLauncher}
          rootSubtype={rootSubtype}
          setRootSubtype={setRootSubtype}
          rootSort={rootSort}
          setRootSort={setRootSort}
          saving={saving}
          onSaveBasics={() => void saveRootBasics(activeRoot)}
          onOpenOptions={() => openOptions(activeRoot)}
          onAddChild={() => beginChildCreate(activeRoot)}
          onOpenChild={(c) => beginChildEdit(activeRoot.id, c)}
          onMoveChild={(id, dir) => void moveChild(activeRoot.id, id, dir)}
          onToggleChild={(id, cur) => void toggleActive(id, cur)}
          onDeleteRoot={() => void deleteWithConfirm(activeRoot.id, { kind: "list" })}
        />
      ) : null}

      {/* OPTIONS */}
      {view.kind === "options" && activeRoot ? (
        <section className="space-y-4 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              className="sam-text-body-secondary text-signature hover:underline"
              onClick={() => {
                void (async () => {
                  if (!(await leaveOptionsIfDirty())) return;
                  setOptionsDirty(false);
                  setView({ kind: "root", id: activeRoot.id });
                  beginRootEditBasics(activeRoot);
                })();
              }}
            >
              ← {activeRoot.name}
            </button>
          </div>
          <CategoryFieldCompositionEditor
            iconKey={activeRoot.icon_key}
            slug={activeRoot.slug}
            value={draftComposition}
            onChange={(next) => {
              setDraftComposition(next);
              setOptionsDirty(true);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <ConsoleButton
              variant="secondary"
              onClick={() => setPreviewOpen(true)}
              disabled={!previewCategory}
            >
              {safeT("admin_menu_trade_preview_cta", {
                fallbackKo: "미리보기",
                fallbackEn: "Preview",
              })}
            </ConsoleButton>
            <ConsoleButton variant="primary" disabled={saving || !optionsDirty} onClick={() => void saveOptions()}>
              {t("common_save")}
            </ConsoleButton>
          </div>
          {previewCategory ? (
            <TradeMenuWritePreviewSheet
              open={previewOpen}
              category={previewCategory}
              onClose={() => setPreviewOpen(false)}
            />
          ) : null}
        </section>
      ) : null}

      {/* CHILD create/edit */}
      {(view.kind === "child-create" || view.kind === "child") && activeRoot ? (
        <ChildEditor
          root={activeRoot}
          child={
            view.kind === "child" ? list.find((c) => c.id === view.childId) ?? null : null
          }
          name={childName}
          setName={setChildName}
          active={childActive}
          setActive={setChildActive}
          sort={childSort}
          setSort={setChildSort}
          saving={saving}
          onSave={() =>
            void saveChild(
              activeRoot,
              view.kind === "child" ? list.find((c) => c.id === view.childId) : undefined
            )
          }
          onCancel={() => {
            beginRootEditBasics(activeRoot);
            setView({ kind: "root", id: activeRoot.id });
          }}
          onDelete={
            view.kind === "child"
              ? () =>
                  void deleteWithConfirm(view.childId, {
                    kind: "root",
                    id: activeRoot.id,
                  })
              : undefined
          }
        />
      ) : null}
    </div>
  );
}

function RootBasicsFields({
  name,
  setName,
  active,
  setActive,
  chip,
  setChip,
  launcher,
  setLauncher,
  subtype,
  setSubtype,
  sort,
  setSort,
}: {
  name: string;
  setName: (v: string) => void;
  active: boolean;
  setActive: (v: boolean) => void;
  chip: boolean;
  setChip: (v: boolean) => void;
  launcher: boolean;
  setLauncher: (v: boolean) => void;
  subtype: string;
  setSubtype: (v: string) => void;
  sort: number;
  setSort: (v: number) => void;
}) {
  const { t, safeT } = useI18n();
  return (
    <div className="space-y-3">
      <div>
        <label className="block sam-text-body-secondary font-medium text-sam-fg">
          {safeT("admin_menu_trade_label_name", { fallbackKo: "이름", fallbackEn: "Name" })}
        </label>
        <input
          className={`mt-1 w-full ${Sam.input.base}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="block sam-text-body-secondary font-medium text-sam-fg">
          {safeT("admin_menu_trade_label_type", {
            fallbackKo: "유형",
            fallbackEn: "Type",
          })}
        </label>
        <select
          className={`mt-1 w-full ${Sam.input.select}`}
          value={subtype}
          onChange={(e) => setSubtype(e.target.value)}
        >
          {TRADE_SUBTYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.labelKey)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 sam-text-body">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          {t("admin_menu_status_active")}
        </label>
        <label className="flex items-center gap-2 sam-text-body">
          <input type="checkbox" checked={chip} onChange={(e) => setChip(e.target.checked)} />
          {safeT("admin_menu_trade_label_chip", {
            fallbackKo: "홈 칩 노출",
            fallbackEn: "Home chip",
          })}
        </label>
        <label className="flex items-center gap-2 sam-text-body">
          <input type="checkbox" checked={launcher} onChange={(e) => setLauncher(e.target.checked)} />
          {safeT("admin_menu_trade_label_launcher", {
            fallbackKo: "글쓰기 런처",
            fallbackEn: "Write launcher",
          })}
        </label>
        <label className="flex items-center gap-2 sam-text-body">
          {safeT("admin_menu_trade_label_sort", { fallbackKo: "순서", fallbackEn: "Order" })}
          <input
            type="number"
            className="w-20 rounded border border-sam-border px-2 py-1"
            value={sort}
            onChange={(e) => setSort(Number(e.target.value) || 0)}
          />
        </label>
      </div>
    </div>
  );
}

function RootDetail({
  root,
  childRows,
  rootName,
  setRootName,
  rootActive,
  setRootActive,
  rootChip,
  setRootChip,
  rootLauncher,
  setRootLauncher,
  rootSubtype,
  setRootSubtype,
  rootSort,
  setRootSort,
  saving,
  onSaveBasics,
  onOpenOptions,
  onAddChild,
  onOpenChild,
  onMoveChild,
  onToggleChild,
  onDeleteRoot,
}: {
  root: CategoryWithSettings;
  childRows: CategoryWithSettings[];
  rootName: string;
  setRootName: (v: string) => void;
  rootActive: boolean;
  setRootActive: (v: boolean) => void;
  rootChip: boolean;
  setRootChip: (v: boolean) => void;
  rootLauncher: boolean;
  setRootLauncher: (v: boolean) => void;
  rootSubtype: string;
  setRootSubtype: (v: string) => void;
  rootSort: number;
  setRootSort: (v: number) => void;
  saving: boolean;
  onSaveBasics: () => void;
  onOpenOptions: () => void;
  onAddChild: () => void;
  onOpenChild: (c: CategoryWithSettings) => void;
  onMoveChild: (id: string, dir: -1 | 1) => void;
  onToggleChild: (id: string, current: boolean) => void;
  onDeleteRoot: () => void;
}) {
  const { t, safeT } = useI18n();
  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="sam-text-section-title font-semibold text-sam-fg">{root.name}</h2>
        <p className="sam-text-body-secondary text-sam-muted">
          {safeT("admin_menu_trade_basics", { fallbackKo: "기본 정보", fallbackEn: "Basics" })}
        </p>
        <RootBasicsFields
          name={rootName || root.name}
          setName={setRootName}
          active={rootActive}
          setActive={setRootActive}
          chip={rootChip}
          setChip={setRootChip}
          launcher={rootLauncher}
          setLauncher={setRootLauncher}
          subtype={rootSubtype}
          setSubtype={setRootSubtype}
          sort={rootSort}
          setSort={setRootSort}
        />
        <div className="flex flex-wrap gap-2">
          <ConsoleButton variant="primary" disabled={saving} onClick={onSaveBasics}>
            {t("common_save")}
          </ConsoleButton>
          <ConsoleButton variant="danger" onClick={onDeleteRoot}>
            {safeT("admin_menu_trade_delete_root", {
              fallbackKo: "삭제",
              fallbackEn: "Delete",
            })}
          </ConsoleButton>
        </div>
      </section>

      <section className="rounded-ui-rect border border-sam-border bg-sam-surface">
        <div className="flex items-center justify-between border-b border-sam-border px-3 py-2">
          <h3 className="sam-text-body font-semibold text-sam-fg">
            {safeT("admin_menu_th_subtopic_list", {
              fallbackKo: "카테고리",
              fallbackEn: "Categories",
            })}
          </h3>
          <ConsoleButton variant="secondary" size="sm" onClick={onAddChild}>
            {t("admin_menu_subtopic_add")}
          </ConsoleButton>
        </div>
        {childRows.length === 0 ? (
          <p className="px-3 py-6 text-center sam-text-body text-sam-muted">
            {safeT("admin_menu_trade_child_empty", {
              fallbackKo: "등록된 카테고리가 없습니다.",
              fallbackEn: "No categories yet.",
            })}
          </p>
        ) : (
          <ul className="divide-y divide-sam-border-soft">
            {childRows.map((c) => (
              <li key={c.id} className="flex items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => onOpenChild(c)}
                >
                  <span className="sam-text-body font-medium text-sam-fg">{c.name}</span>
                  <span className="ml-2 sam-text-xxs text-sam-muted">
                    {c.is_active ? t("admin_menu_status_active") : t("admin_menu_status_inactive")}
                  </span>
                </button>
                <button type="button" className={`${Sam.btn.ghost} ${Sam.btn.sm}`} onClick={() => onMoveChild(c.id, -1)}>
                  ↑
                </button>
                <button type="button" className={`${Sam.btn.ghost} ${Sam.btn.sm}`} onClick={() => onMoveChild(c.id, 1)}>
                  ↓
                </button>
                <button
                  type="button"
                  className={`${Sam.btn.ghost} ${Sam.btn.sm}`}
                  onClick={() => onToggleChild(c.id, c.is_active)}
                >
                  {c.is_active ? "OFF" : "ON"}
                </button>
                <span className="text-signature">›</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button
        type="button"
        className="flex w-full items-center justify-between rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 hover:bg-sam-surface-muted/80"
        onClick={onOpenOptions}
      >
        <span className="sam-text-body font-semibold text-sam-fg">
          {safeT("admin_menu_trade_options_heading", {
            fallbackKo: "등록 옵션",
            fallbackEn: "Listing options",
          })}
        </span>
        <span className="text-signature">›</span>
      </button>
    </div>
  );
}

function ChildEditor({
  root,
  child,
  name,
  setName,
  active,
  setActive,
  sort,
  setSort,
  saving,
  onSave,
  onCancel,
  onDelete,
}: {
  root: CategoryWithSettings;
  child: CategoryWithSettings | null;
  name: string;
  setName: (v: string) => void;
  active: boolean;
  setActive: (v: boolean) => void;
  sort: number;
  setSort: (v: number) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const { t, safeT } = useI18n();
  return (
    <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <button type="button" className="sam-text-body-secondary text-signature hover:underline" onClick={onCancel}>
        ← {root.name}
      </button>
      <h2 className="sam-text-body font-semibold text-sam-fg">
        {child ? t("admin_menu_subtopic_form_edit") : t("admin_menu_subtopic_form_add")}
      </h2>
      <div>
        <label className="block sam-text-body-secondary font-medium">{t("admin_menu_subtopic_label_name")}</label>
        <input
          className={`mt-1 w-full ${Sam.input.base}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          {t("admin_menu_status_active")}
        </label>
        <label className="flex items-center gap-2">
          {t("admin_menu_subtopic_label_sort")}
          <input
            type="number"
            className="w-20 rounded border border-sam-border px-2 py-1"
            value={sort}
            onChange={(e) => setSort(Number(e.target.value) || 0)}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <ConsoleButton variant="primary" disabled={saving} onClick={onSave}>
          {t("common_save")}
        </ConsoleButton>
        <ConsoleButton variant="secondary" onClick={onCancel}>
          {t("common_cancel")}
        </ConsoleButton>
        {onDelete ? (
          <ConsoleButton variant="danger" onClick={onDelete}>
            {safeT("admin_menu_trade_delete_child", {
              fallbackKo: "삭제",
              fallbackEn: "Delete",
            })}
          </ConsoleButton>
        ) : null}
      </div>
    </section>
  );
}
