"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BodyPortal } from "@/components/layout/BodyPortal";
import { OwnerStoreAdminConfirmModal } from "@/components/business/owner/OwnerStoreAdminConfirmModal";
import { resolveConditionalAppShellFlags } from "@/lib/layout/conditional-app-shell-flags";
import { BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import { Sam } from "@/lib/ui/sam-component-classes";
import { samTier1HeaderIconMicro } from "@/lib/ui/tier1-header-icon";
import { StoreMenuCategorySortableList } from "@/components/business/owner/StoreMenuCategorySortableList";
import { useBusinessAdminStore } from "@/components/business/admin/business-admin-store-context";

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

export function OwnerMenuCategoriesClient({ storeId }: { storeId: string }) {
  const pathname = usePathname() ?? "";
  /** `ConditionalAppShell` 과 동일한 하단 탭 노출 여부 — 고정 액션 바 오프셋에만 사용 */
  const { showBottomNav } = useMemo(
    () => resolveConditionalAppShellFlags(pathname || null, false),
    [pathname]
  );
  /** 본문이 `fixed` 액션 바·(선택) 메인 하단 탭에 가리지 않도록 */
  const editScrollBottomPaddingClass = showBottomNav
    ? "pb-[calc(8.75rem+env(safe-area-inset-bottom,0px))]"
    : "pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]";
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [screen, setScreen] = useState<"list" | "edit">("list");
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
  const ordersHref = buildStoreOrdersHref({ storeId });
  const inquiriesHref = `/stores/owner/inquiries?storeId=${encodeURIComponent(storeId)}`;

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) setLoading(true);
    setError(null);
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
        setError("DB 마이그레이션(store_menu_sections)을 적용해 주세요.");
      }
    } catch {
      setError("network_error");
      setSections([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

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
      setError("카테고리 이름을 입력해 주세요.");
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
              ? "같은 이름의 카테고리가 이미 있습니다."
              : typeof j?.error === "string"
                ? j.error
                : "저장 실패"
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
              ? "같은 이름의 카테고리가 이미 있습니다."
              : typeof j?.error === "string"
                ? j.error
                : "저장 실패"
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
      const res = await fetch(`/api/me/stores/${encodeURIComponent(storeId)}/products`, {
        credentials: "include",
        cache: "no-store",
      });
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
      setError(`이 카테고리에 메뉴가 ${n}개 있습니다. 상품 관리에서 다른 카테고리로 옮긴 뒤 삭제해 주세요.`);
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
          typeof bad.j?.error === "string" ? bad.j.error : "순서 저장에 실패했습니다.";
        setError(msg);
        window.alert(msg);
        return;
      }
    } catch {
      setSections(previous);
      setError("network_error");
      window.alert("네트워크 오류로 순서를 저장하지 못했습니다.");
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
        setError(typeof j?.error === "string" ? j.error : "삭제 실패");
        return;
      }
      await load({ silent: true });
    } catch {
      setError("network_error");
    }
  };

  if (screen === "edit") {
    const bottomActionBarPositionClass = showBottomNav
      ? BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS
      : "bottom-0";

    return (
      <>
        <div className={`min-h-[100dvh] bg-sam-app ${editScrollBottomPaddingClass}`}>
          <nav className="sam-tabs" aria-label="카테고리 편집 탭">
            <button
              type="button"
              role="tab"
              aria-selected={editorTab === "basic"}
              onClick={() => setEditorTab("basic")}
              className={`sam-tab flex-1 ${editorTab === "basic" ? "sam-tab--active" : ""}`}
            >
              기본정보
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={editorTab === "language"}
              onClick={() => setEditorTab("language")}
              className={`sam-tab flex-1 ${editorTab === "language" ? "sam-tab--active" : ""}`}
            >
              언어
            </button>
          </nav>

          <div className="px-4 py-4">
            {error ? <p className="mb-3 sam-text-body-secondary text-red-600">{error}</p> : null}

            {editorTab === "basic" ? (
              <div className="space-y-4 rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
                <div>
                  <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">이름</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="카테고리 이름"
                    className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5 sam-text-body text-sam-fg"
                  />
                </div>
                <div>
                  <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">설명</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="고객에게 보일 수 있는 짧은 설명 (선택)"
                    rows={3}
                    className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5 sam-text-body text-sam-fg"
                  />
                </div>
                <div>
                  <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">정렬순서</label>
                  <p className="mb-1 sam-text-helper text-sam-muted">숫자가 작을수록 메뉴 탭에서 앞에 옵니다.</p>
                  <input
                    inputMode="numeric"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value)}
                    className="w-full max-w-[140px] rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5 sam-text-body text-sam-fg"
                  />
                </div>
                <div className="flex items-center justify-between border-t border-sam-border-soft pt-3">
                  <span className="sam-text-body text-sam-fg">숨김여부</span>
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
                  숨김을 켜면 고객 매장 페이지에서 이 카테고리 탭과 속한 메뉴가 보이지 않습니다. 오너 화면에서는
                  계속 관리할 수 있습니다.
                </p>
              </div>
            ) : (
              <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface p-6 text-center">
                <p className="sam-text-body text-sam-muted">
                  다국어 카테고리 이름·설명은 추후 지원 예정입니다.
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
            aria-label="카테고리 편집 저장"
            className={`pointer-events-auto fixed inset-x-0 z-[120] border-t border-sam-border bg-sam-surface shadow-[0_-4px_12px_rgba(0,0,0,0.08)] ${bottomActionBarPositionClass} lg:left-[260px]`}
          >
            <div className="mx-auto flex w-full max-w-6xl gap-2 px-2 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:px-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => closeEditToListOnly()}
                className="min-h-12 flex-1 touch-manipulation select-none rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 sam-text-body-lg font-semibold text-sam-muted shadow-sm transition-[transform,opacity,background-color] duration-150 hover:bg-sam-surface-muted hover:text-sam-fg active:scale-[0.99] active:bg-sam-border-soft active:opacity-90 disabled:opacity-45"
              >
                취소
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
      <div className="flex flex-wrap gap-2 border-b border-sam-border-soft bg-sam-surface px-0 py-2">
        <Link
          href={productsHubHref}
          className={`${Sam.btn.outlineCombo} ${Sam.btn.pill} ${Sam.btn.sm} no-underline font-semibold text-sam-fg`}
        >
          상품 등록
        </Link>
        <Link
          href={ordersHref}
          className={`${Sam.btn.outlineCombo} ${Sam.btn.pill} ${Sam.btn.sm} no-underline font-semibold text-sam-fg`}
        >
          주문 관리
        </Link>
        <Link
          href={inquiriesHref}
          className={`${Sam.btn.outlineCombo} ${Sam.btn.pill} ${Sam.btn.sm} no-underline font-semibold text-sam-fg`}
        >
          문의
        </Link>
      </div>
      <div className="space-y-3 px-0 py-2">
        <div className="flex min-w-0 items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => openNew()}
            className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-sam-border bg-sam-surface text-signature shadow-sm ${samTier1HeaderIconMicro}`}
            aria-label="카테고리 추가"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <Link
            href={productsHubHref}
            className={`${Sam.btn.outlinePrimaryCombo} no-underline`}
          >
            상품 목록으로
          </Link>
        </div>
        <p className="sam-text-body-secondary leading-relaxed text-sam-muted">
          카테고리를 만든 뒤 상품 등록 화면에서 탭으로 나누어 등록하세요. 왼쪽 줄 세 개 아이콘을 잡고 위·아래로
          드래그하면 순서를 바꿀 수 있습니다.
        </p>

        {error ? <p className="sam-text-body-secondary text-red-600">{error}</p> : null}

        {loading ? (
          <p className="sam-text-body text-sam-muted">불러오는 중…</p>
        ) : sections.length === 0 ? (
          <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
            등록된 카테고리가 없습니다.
            <button
              type="button"
              onClick={() => openNew()}
              className={`${Sam.btn.ghostCombo} ${Sam.btn.block} mt-2 font-medium text-signature underline`}
            >
              카테고리 추가
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
        title="카테고리 삭제"
        description={deleteTarget ? `「${deleteTarget.name}」 카테고리를 삭제할까요?` : undefined}
        cancelLabel="취소"
        confirmLabel="삭제"
        confirmBusyLabel="삭제 중…"
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
