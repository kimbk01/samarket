"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { useCategoryAdmin } from "@/components/admin/categories/useCategoryAdmin";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { TradeSubtopicsPanel } from "@/components/admin/menus/TradeSubtopicsPanel";

/**
 * 커뮤니티 「피드 주제」와 대응 — 거래 메뉴별 홈·마켓 2행 주제 일괄 관리
 */
export function AdminTradeFeedTopicsPage() {
  const { list, loading, supabaseAvailable, load, handleDelete } = useCategoryAdmin();

  const parents = useMemo(
    () =>
      list
        .filter((c) => c.type === "trade" && c.parent_id == null)
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [list]
  );

  const [selectedId, setSelectedId] = useState<string>("");

  useEffect(() => {
    if (parents.length === 0) {
      setSelectedId("");
      return;
    }
    setSelectedId((prev) => (prev && parents.some((p) => p.id === prev) ? prev : parents[0]!.id));
  }, [parents]);

  const selected = selectedId ? parents.find((p) => p.id === selectedId) ?? null : null;

  return (
    <div className="space-y-4">
      <AdminPageHeader title="거래 피드 주제" backHref="/admin/menus/trade" />
      <p className="text-[14px] text-gray-600">
        커뮤니티의{" "}
        <Link href="/admin/philife/topics" className="font-medium text-signature hover:underline">
          피드 주제
        </Link>
        와 같이, <strong className="font-medium text-gray-800">홈·마켓 2행 칩·글쓰기 주제</strong>를 메뉴별로
        관리합니다. 상위 메뉴(거래·중고차 등)는{" "}
        <Link href="/admin/menus/trade" className="font-medium text-signature hover:underline">
          메뉴 (거래)
        </Link>
        에서 다룹니다.
      </p>

      {supabaseAvailable === false && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          Supabase가 연결되지 않았습니다. <code className="text-[12px]">categories.parent_id</code> 마이그레이션 적용
          후 주제를 저장할 수 있습니다.
        </div>
      )}

      {loading ? (
        <div className="rounded-lg border border-gray-200 bg-white py-10 text-center text-[14px] text-gray-500">
          불러오는 중…
        </div>
      ) : parents.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-10 text-center text-[14px] text-gray-500">
          거래 메뉴가 없습니다.{" "}
          <Link href="/admin/menus/trade" className="text-signature hover:underline">
            메뉴 (거래)
          </Link>
          에서 항목을 추가하세요.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium text-gray-700">상위 메뉴 (1행 칩)</span>
              <select
                className="min-w-[240px] rounded-lg border border-gray-200 px-3 py-2 text-[14px]"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {parents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.slug})
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selected ? (
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <TradeSubtopicsPanel
                parent={selected}
                allCategories={list}
                onRefresh={load}
                onDelete={handleDelete}
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
