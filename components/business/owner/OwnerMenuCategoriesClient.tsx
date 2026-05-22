"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BodyPortal } from "@/components/layout/BodyPortal";
import { OwnerStoreAdminConfirmModal } from "@/components/business/owner/OwnerStoreAdminConfirmModal";
import { pushStoreOwnerMainBottomNavSuppressed } from "@/lib/business/store-owner-main-bottom-nav-suppress";
import { Sam } from "@/lib/ui/sam-component-classes";
import { StoreMenuCategorySortableList } from "@/components/business/owner/StoreMenuCategorySortableList";
import { useBusinessAdminStore } from "@/components/business/admin/business-admin-store-context";
import type { OwnerRscMenuSection } from "@/lib/stores/owner/load-owner-store-read-bootstrap";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";
import { OWNER_MOBILE_ADMIN_CONTENT_GUTTER_X_CLASS } from "@/lib/stores/owner-mobile-ui-tokens";

type Section = {
  id: string;
  name: string;
  sort_order: number;
  description: string | null;
  is_hidden: boolean;
};

type EditorTab = "basic" | "language";

const SWITCH_PRESS =
  "touch-manipulation select-none transition-[transform,opacity] duration-150 active:scale-[0.98] active:opacity-90";

export function OwnerMenuCategoriesClient({
  storeId,
  initialSections,
  rscBootstrapError,
}: {
  storeId: string;
  initialSections?: OwnerRscMenuSection[];
  rscBootstrapError?: string;
}) {
  const { t } = useI18n();
  /** 본문이 고정 저장·취소 바에 가리지 않도록 */
  const editScrollBottomPaddingClass = "pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]";
  const [sections, setSections] = useState<Section[]>(() =>
    (initialSections ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      sort_order: s.sort_order,
      description: s.description,
      is_hidden: s.is_hidden,
    }))
  );
  const [loading, setLoading] = useState(() => initialSections === undefined);
  const [error, setError] = useState<string | null>(() => {
    if (!rscBootstrapError) return null;
    if (rscBootstrapError === "session_invalid") {
      return t("business_phase7_422");
    }
    if (rscBootstrapError === "supabase_unconfigured") {
      return t("business_phase7_423");
    }
    return rscBootstrapError;
  });
  const [screen, setScreen] = useState<"list" | "edit">("list");

  /** 카테고리 추가·편집 — `BusinessAdminShell` 오너 하단 탭 숨김(저장·취소 바만) */
  useEffect(() => {
    if (screen !== "edit") return;
    return pushStoreOwnerMainBottomNavSuppressed();
  }, [screen]);

  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [editorTab, setEditorTab] = useState<EditorTab>("basic");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [isHidden, setIsHidden] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Section | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [reorderBusy, setReorderBusy] = useState(false);

  const base = `/api/me/stores/${encodeURIComponent(storeId)}/menu-sections`;
  const productsHubHref = `/stores/owner/products?storeId=${encodeURIComponent(storeId)}`;

  const load = useCallback(async (opts?: { silent?: boolean; preserveExistingError?: boolean }) => {
    const silent = opts?.silent === true;
    const preserveExistingError = opts?.preserveExistingError === true;
    if (!preserveExistingError) {
      setError(null);
    }
    if (!silent) setLoading(true);
    try {
      const res = await fetch(base, { credentials: "include", cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!j?.ok) {
        setError(typeof j?.error === "string" ? j.error : "load_failed");
        setSections([]);
        return;
      }
      const list = Array.isArray(j.sections)
        ? j.sections.map((s: Record<string, unknown>) => ({
            id: String(s.id),
            name: String(s.name ?? ""),
            sort_order: Number(s.sort_order) || 0,
            description: s.description != null ? String(s.description) : null,
            is_hidden: s.is_hidden === true,
          }))
        : [];
      setSections(list);
      if (j.meta?.hint === "store_menu_sections") {
        setError(t("business_phase7_363"));
      } else {
        setError(null);
      }
    } catch {
      setError("network_error");
      setSections([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    if (initialSections !== undefined) {
      return;
    }
    if (rscBootstrapError) {
      void load({ silent: true, preserveExistingError: true }).finally(() => {
        setLoading(false);
      });
      return;
    }
    void load({});
  }, [initialSections, load, rscBootstrapError]);

  const openNew = useCallback(() => {
    setEditingId("new");
    setEditorTab("basic");
    setName("");
    setDescription("");
    setSortOrder(String(sections.length));
    setIsHidden(false);
    setScreen("edit");
    setError(null);
  }, [sections.length]);

  const openEdit = useCallback((s: Section) => {
    setEditingId(s.id);
    setEditorTab("basic");
    setName(s.name);
    setDescription(s.description ?? "");
    setSortOrder(String(s.sort_order));
    setIsHidden(s.is_hidden);
    setScreen("edit");
    setError(null);
  }, []);

  const closeEditToListOnly = useCallback(() => {
    setScreen("list");
    setEditingId(null);
    setError(null);
  }, []);

  const backToListAfterSave = useCallback(async () => {
    closeEditToListOnly();
    await load({ silent: true });
  }, [closeEditToListOnly, load]);

  const registerOwnerAdminHeaderBackIntercept =
    useBusinessAdminStore()?.registerOwnerAdminHeaderBackIntercept;

  useEffect(() => {
    if (!registerOwnerAdminHeaderBackIntercept) return;
    if (screen !== "edit") {
      registerOwnerAdminHeaderBackIntercept(null);
      return;
    }
    registerOwnerAdminHeaderBackIntercept(() => {
      closeEditToListOnly();
      return true;
    });
    return () => registerOwnerAdminHeaderBackIntercept(null);
  }, [screen, registerOwnerAdminHeaderBackIntercept, closeEditToListOnly]);

  const saveEditor = async () => {
    const n = name.trim();
    if (n.length < 1) {
      setError(t("business_phase7_473"));
      return;
    }
    const so = parseInt(sortOrder, 10);
    const sort_order = Number.isFinite(so) ? Math.max(0, Math.min(9999, so)) : 0;
    setSaving(true);
    setError(null);
    try {
      if (editingId === "new") {
        const res = await fetch(base, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: n,
            sort_order,
            description: description.trim() || null,
            is_hidden: isHidden,
          }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j?.ok) {
          setError(
            j?.error === "duplicate_section_name"
              ? t("business_phase7_474")
              : typeof j?.error === "string"
                ? j.error
                : t("business_phase7_368")
          );
          return;
        }
      } else if (editingId) {
        const res = await fetch(`${base}/${encodeURIComponent(editingId)}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: n,
            sort_order,
            description: description.trim() || null,
            is_hidden: isHidden,
          }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j?.ok) {
          setError(
            j?.error === "duplicate_section_name"
              ? t("business_phase7_474")
              : typeof j?.error === "string"
                ? j.error
                : t("business_phase7_368")
          );
          return;
        }
      }
      await backToListAfterSave();
    } catch {
      setError("network_error");
    } finally {
      setSaving(false);
    }
  };

  const countProductsInSection = useCallback(async (sectionId: string): Promise<number> => {
    try {
      const res = await fetch(
        `/api/me/stores/${encodeURIComponent(storeId)}/products?menu_section_id=${encodeURIComponent(sectionId)}`,
        { credentials: "include", cache: "no-store" }
      );
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        products?: Array<{ menu_section_id?: string | null; store_menu_sections?: unknown }>;
      };
      if (!j?.ok || !Array.isArray(j.products)) return 0;
      return j.products.filter((p) => {
        if (p.menu_section_id && String(p.menu_section_id) === sectionId) return true;
        const emb = p.store_menu_sections;
        if (!emb) return false;
        const one = Array.isArray(emb) ? emb[0] : emb;
        const id = one && typeof one === "object" && "id" in one ? String((one as { id?: string }).id ?? "") : "";
        return id === sectionId;
      }).length;
    } catch {
      return 0;
    }
  }, [storeId]);

  const askDeleteSection = useCallback(async (s: Section) => {
    const n = await countProductsInSection(s.id);
    if (n > 0) {
      setError(t("business_phase7_475", { v1: String(n) }));
      return;
    }
    setDeleteTarget(s);
  }, [countProductsInSection]);

  const requestDeleteCategory = useCallback(
    (s: Section) => {
      void askDeleteSection(s);
    },
    [askDeleteSection]
  );

  const commitSectionOrder = useCallback(async (ordered: Section[]) => {
    let previous: Section[] = [];
    setSections((prev) => {
      previous = prev;
      return ordered;
    });
    setReorderBusy(true);
    setError(null);
    try {
      const results = await Promise.all(
        ordered.map((sec, idx) =>
          fetch(`${base}/${encodeURIComponent(sec.id)}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sort_order: idx }),
          }).then(async (res) => ({ res, j: (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string } }))
        )
      );
      const bad = results.find((r) => !r.res.ok || !r.j?.ok);
      if (bad) {
        setSections(previous);
        const msg =
          typeof bad.j?.error === "string" ? bad.j.error : t("business_phase7_476");
        setError(msg);
        window.alert(msg);
        return;
      }
    } catch {
      setSections(previous);
      setError("network_error");
      window.alert(t("business_phase7_046"));
    } finally {
      setReorderBusy(false);
    }
  }, [base]);

  const performDeleteSection = async (s: Section) => {
    setError(null);
    try {
      const res = await fetch(`${base}/${encodeURIComponent(s.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        setError(typeof j?.error === "string" ? j.error : t("business_phase7_352"));
        return;
      }
      await load({ silent: true });
    } catch {
      setError("network_error");
    }
  };

  if (screen === "edit") {
    return (
      <>
        <div
          className={`flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain bg-sam-app ${editScrollBottomPaddingClass}`}
        >
          <nav className="sam-tabs" aria-label={t("business_phase7_304")}>
            <button
              type="button"
              role="tab"
              aria-selected={editorTab === "basic"}
              onClick={() => setEditorTab("basic")}
              className={`sam-tab flex-1 ${editorTab === "basic" ? "sam-tab--active" : ""}`}
            >
              {t("business_phase7_371")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={editorTab === "language"}
              onClick={() => setEditorTab("language")}
              className={`sam-tab flex-1 ${editorTab === "language" ? "sam-tab--active" : ""}`}
            >
              {t("business_phase7_187")}
            </button>
          </nav>

          <div className="py-4">
            {error ? (
              <p className="mb-3 sam-text-body-secondary text-red-600">{resolveOwnerApiErrorMessage(error, t)}</p>
            ) : null}

            {editorTab === "basic" ? (
              <div className="space-y-4 rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
                <div>
                  <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">{t("business_phase7_235")}</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("business_phase7_302")}
                    className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5 sam-text-body text-sam-fg"
                  />
                </div>
                <div>
                  <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">{t("business_phase7_165")}</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t("business_phase7_023")}
                    rows={3}
                    className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5 sam-text-body text-sam-fg"
                  />
                </div>
                <div>
                  <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">{t("business_phase7_248")}</label>
                  <p className="mb-1 sam-text-helper text-sam-muted">{t("business_phase7_171")}</p>
                  <input
                    inputMode="numeric"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value)}
                    className="w-full max-w-[140px] rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5 sam-text-body text-sam-fg"
                  />
                </div>
                <div className="flex items-center justify-between border-t border-sam-border-soft pt-3">
                  <span className="sam-text-body text-sam-fg">{t("business_phase7_170")}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isHidden}
                    onClick={() => setIsHidden((v) => !v)}
                    className={`relative h-8 w-14 rounded-full transition ${SWITCH_PRESS} ${
                      isHidden ? "bg-sam-primary-soft" : "bg-emerald-500"
                    }`}
                  >
                    <span
                      className={`absolute top-1 h-6 w-6 rounded-full bg-sam-surface shadow transition ${
                        isHidden ? "left-1" : "left-7"
                      }`}
                    />
                  </button>
                </div>
                <p className="sam-text-helper leading-relaxed text-sam-muted">
                  {t("business_phase7_478")}
                </p>
              </div>
            ) : (
              <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface p-6 text-center">
                <p className="sam-text-body text-sam-muted">
                  {t("business_phase7_479")}
                </p>
              </div>
            )}
          </div>
        </div>

        {/**
         * `MainShellTabContentTransition` / `AppRouteTransition` 조상에 transform 이 걸리면
         * 내부 `position:fixed` 가 뷰포트 기준이 아니게 된다(`BodyPortal` 주석 참고).
         * 하단 액션 바는 `document.body` 로 올려 항상 뷰포트 하단에 고정한다.
         */}
        <BodyPortal>
          <div
            role="toolbar"
            aria-label={t("business_phase7_303")}
            className="pointer-events-auto fixed inset-x-0 bottom-0 z-[120] border-t border-sam-border bg-sam-surface shadow-[0_-4px_12px_rgba(0,0,0,0.08)] lg:left-[260px]"
          >
            <div
              className={`mx-auto flex w-full max-w-lg min-w-0 gap-2 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] ${OWNER_MOBILE_ADMIN_CONTENT_GUTTER_X_CLASS}`}
            >
              <button
                type="button"
                disabled={saving}
                onClick={() => closeEditToListOnly()}
                className="min-h-12 flex-1 touch-manipulation select-none rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 sam-text-body-lg font-semibold text-sam-muted shadow-sm transition-[transform,opacity,background-color] duration-150 hover:bg-sam-surface-muted hover:text-sam-fg active:scale-[0.99] active:bg-sam-border-soft active:opacity-90 disabled:opacity-45"
              >
                {t("common_cancel")}
              </button>
              <button
                type="button"
                disabled={saving || editorTab !== "basic"}
                onClick={() => void saveEditor()}
                className="min-h-12 flex-1 touch-manipulation select-none rounded-ui-rect border border-transparent bg-signature px-4 py-3 sam-text-body-lg font-semibold !text-white shadow-sm transition-[transform,opacity,background-color] duration-150 hover:bg-signature/90 active:scale-[0.99] active:bg-signature/95 disabled:opacity-45"
              >
                {saving ? "처리 중…" : "확인"}
              </button>
            </div>
          </div>
        </BodyPortal>
      </>
    );
  }

  return (
    <div className="max-w-full overflow-x-hidden bg-sam-app pb-8">
      <div className="space-y-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => openNew()}
            className={`${Sam.btn.primaryCombo} ${Sam.btn.sm} shrink-0 touch-manipulation select-none font-semibold active:scale-[0.99] active:opacity-90`}
          >
            {t("business_phase7_396")}
          </button>
          <Link
            href={productsHubHref}
            className={`${Sam.btn.secondaryCombo} ${Sam.btn.sm} no-underline font-semibold active:scale-[0.99] active:opacity-90`}
          >
            {t("business_phase7_480")}
          </Link>
        </div>

        {error ? <p className="sam-text-body-secondary text-red-600">{resolveOwnerApiErrorMessage(error, t)}</p> : null}

        {loading ? (
          <p className="sam-text-body text-sam-muted">{t("common_loading")}</p>
        ) : sections.length === 0 ? (
          <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
            {t("business_phase7_481")}
            <button
              type="button"
              onClick={() => openNew()}
              className={`${Sam.btn.ghostCombo} ${Sam.btn.block} mt-2 font-medium text-signature underline`}
            >
              {t("business_phase7_396")}
            </button>
          </div>
        ) : (
          <StoreMenuCategorySortableList
            items={sections}
            disabled={reorderBusy || loading}
            onCommitOrder={commitSectionOrder}
            onEdit={openEdit}
            onDelete={requestDeleteCategory}
          />
        )}
      </div>

      <OwnerStoreAdminConfirmModal
        open={deleteTarget != null}
        titleId="owner-menu-categories-delete-title"
        title={t("business_phase7_301")}
        description={deleteTarget ? t("business_phase7_477", { v1: deleteTarget.name }) : undefined}
        confirmBusyLabel={t("business_phase7_442")}
        busy={deleteBusy}
        disableActions={deleteBusy}
        confirmTone="danger"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          const s = deleteTarget;
          setDeleteTarget(null);
          setDeleteBusy(true);
          try {
            await performDeleteSection(s);
          } finally {
            setDeleteBusy(false);
          }
        }}
      />
    </div>
  );
}
