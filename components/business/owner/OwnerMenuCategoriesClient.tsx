"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";

type Section = {
  id: string;
  name: string;
  sort_order: number;
  description: string | null;
  is_hidden: boolean;
};

type EditorTab = "basic" | "language";

/** 메인 하단 탭 + 그 위 고정 취소/확인 띠까지 본문이 가리지 않도록 */
const MENU_CATEGORY_EDIT_SCROLL_BOTTOM_CLASS =
  "pb-[calc(8.75rem+env(safe-area-inset-bottom,0px))]";

export function OwnerMenuCategoriesClient({ storeId }: { storeId: string }) {
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

  const base = `/api/me/stores/${encodeURIComponent(storeId)}/menu-sections`;
  const productsHubHref = `/my/business/products?storeId=${encodeURIComponent(storeId)}`;
  const ordersHref = buildStoreOrdersHref({ storeId });
  const inquiriesHref = `/my/business/inquiries?storeId=${encodeURIComponent(storeId)}`;

  const load = useCallback(async () => {
    setLoading(true);
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
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  const openNew = () => {
    setEditingId("new");
    setEditorTab("basic");
    setName("");
    setDescription("");
    setSortOrder(String(sections.length));
    setIsHidden(false);
    setScreen("edit");
    setError(null);
  };

  const openEdit = (s: Section) => {
    setEditingId(s.id);
    setEditorTab("basic");
    setName(s.name);
    setDescription(s.description ?? "");
    setSortOrder(String(s.sort_order));
    setIsHidden(s.is_hidden);
    setScreen("edit");
    setError(null);
  };

  const backToList = () => {
    setScreen("list");
    setEditingId(null);
    void load();
  };

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
      backToList();
    } catch {
      setError("network_error");
    } finally {
      setSaving(false);
    }
  };

  const deleteSection = async (s: Section) => {
    if (!window.confirm(`「${s.name}」 카테고리를 삭제할까요? 속한 메뉴는 「기타」로 분류됩니다.`)) {
      return;
    }
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
      await load();
    } catch {
      setError("network_error");
    }
  };

  const tabBtn = (t: EditorTab, label: string) => (
    <button
      key={t}
      type="button"
      onClick={() => setEditorTab(t)}
      className={`min-w-0 flex-1 border-b-2 py-3 text-[14px] font-medium transition ${
        editorTab === t
          ? "border-signature text-signature"
          : "border-transparent text-gray-500"
      }`}
    >
      {label}
    </button>
  );

  if (screen === "edit") {
    return (
      <div
        className={`flex min-h-screen flex-col bg-gray-50 ${MENU_CATEGORY_EDIT_SCROLL_BOTTOM_CLASS}`}
      >
        <nav className="sticky top-0 z-10 flex border-b border-gray-200 bg-white px-2">
          {tabBtn("basic", "기본정보")}
          {tabBtn("language", "언어")}
        </nav>

        <div className="flex-1 px-4 py-4">
          {error ? <p className="mb-3 text-[13px] text-red-600">{error}</p> : null}

          {editorTab === "basic" ? (
            <div className="space-y-4 rounded-ui-rect border border-gray-200 bg-white p-4 shadow-sm">
              <div>
                <label className="mb-1 block text-[13px] font-medium text-gray-800">이름</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="카테고리 이름"
                  className="w-full rounded-ui-rect border border-gray-200 bg-white px-3 py-2.5 text-[15px] text-gray-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-[13px] font-medium text-gray-800">설명</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="고객에게 보일 수 있는 짧은 설명 (선택)"
                  rows={3}
                  className="w-full rounded-ui-rect border border-gray-200 bg-white px-3 py-2.5 text-[15px] text-gray-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-[13px] font-medium text-gray-800">정렬순서</label>
                <p className="mb-1 text-[12px] text-gray-500">숫자가 작을수록 메뉴 탭에서 앞에 옵니다.</p>
                <input
                  inputMode="numeric"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  className="w-full max-w-[140px] rounded-ui-rect border border-gray-200 bg-white px-3 py-2.5 text-[15px] text-gray-900"
                />
              </div>
              <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                <span className="text-[14px] text-gray-800">숨김여부</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isHidden}
                  onClick={() => setIsHidden((v) => !v)}
                  className={`relative h-8 w-14 rounded-full transition ${
                    isHidden ? "bg-gray-400" : "bg-emerald-500"
                  }`}
                >
                  <span
                    className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition ${
                      isHidden ? "left-1" : "left-7"
                    }`}
                  />
                </button>
              </div>
              <p className="text-[12px] leading-relaxed text-gray-500">
                숨김을 켜면 고객 매장 페이지에서 이 카테고리 탭과 속한 메뉴가 보이지 않습니다. 오너 화면에서는
                계속 관리할 수 있습니다.
              </p>
            </div>
          ) : (
            <div className="rounded-ui-rect border border-dashed border-gray-200 bg-white p-6 text-center">
              <p className="text-[14px] text-gray-600">
                다국어 카테고리 이름·설명은 추후 지원 예정입니다.
              </p>
            </div>
          )}
        </div>

        <div
          className={`fixed left-0 right-0 z-30 border-t border-gray-200 bg-white p-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] ${BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS}`}
        >
          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => backToList()}
              className="min-h-[48px] flex-1 rounded-ui-rect border border-gray-300 bg-white py-3 text-[16px] font-semibold text-gray-800 disabled:opacity-45"
            >
              취소
            </button>
            <button
              type="button"
              disabled={saving || editorTab !== "basic"}
              onClick={() => void saveEditor()}
              className="min-h-[48px] flex-1 rounded-ui-rect bg-signature py-3 text-[16px] font-semibold text-white disabled:opacity-45"
            >
              {saving ? "처리 중…" : "확인"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-full overflow-x-hidden bg-gray-50 pb-8">
      <div className="flex flex-wrap gap-2 border-b border-gray-100 bg-white px-3 py-2">
        <Link
          href={productsHubHref}
          className="rounded-full border border-gray-200 bg-[#F9FAFB] px-3 py-1.5 text-[12px] font-semibold text-gray-900"
        >
          상품 등록
        </Link>
        <Link href={ordersHref} className="rounded-full border border-gray-200 bg-[#F9FAFB] px-3 py-1.5 text-[12px] font-semibold text-gray-900">
          주문 관리
        </Link>
        <Link href={inquiriesHref} className="rounded-full border border-gray-200 bg-[#F9FAFB] px-3 py-1.5 text-[12px] font-semibold text-gray-900">
          문의
        </Link>
      </div>
      <div className="space-y-3 px-3 py-2">
        <div className="flex min-w-0 items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => openNew()}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-ig-border bg-white text-signature shadow-sm"
            aria-label="카테고리 추가"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <Link
            href={productsHubHref}
            className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-ui-rect border border-signature/40 bg-white px-3 py-2 text-[13px] font-semibold leading-tight text-signature shadow-sm transition hover:bg-signature/5 active:bg-signature/10"
          >
            상품 목록으로
          </Link>
        </div>
        <p className="text-[13px] leading-relaxed text-gray-600">
          카테고리를 만든 뒤 상품 등록 화면에서 탭으로 나누어 등록하세요.
        </p>

        {error ? <p className="text-[13px] text-red-600">{error}</p> : null}

        {loading ? (
          <p className="text-[14px] text-gray-500">불러오는 중…</p>
        ) : sections.length === 0 ? (
          <div className="rounded-ui-rect border border-dashed border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
            등록된 카테고리가 없습니다.
            <button
              type="button"
              onClick={() => openNew()}
              className="mt-2 block w-full font-medium text-signature underline"
            >
              카테고리 추가
            </button>
          </div>
        ) : (
          <ul className="space-y-2">
            {sections.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-2 rounded-ui-rect border border-gray-200 bg-white p-3 shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => openEdit(s)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-[15px] font-semibold text-gray-900">{s.name}</p>
                  <p className="text-[12px] text-gray-500">
                    정렬 {s.sort_order}
                    {s.is_hidden ? (
                      <span className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-gray-700">숨김</span>
                    ) : null}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => void deleteSection(s)}
                  className="shrink-0 rounded-ui-rect border border-red-100 bg-red-50 px-2 py-1.5 text-[12px] font-medium text-red-700"
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
