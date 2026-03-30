"use client";

import type { CategoryWithSettings } from "@/lib/categories/types";
import { CategoryTypeBadge } from "@/components/admin/categories/CategoryTypeBadge";
import { CategoryIcon } from "@/components/home/CategoryIcon";

function subtopicsForParent(all: CategoryWithSettings[] | undefined, parentId: string): CategoryWithSettings[] {
  if (!all?.length) return [];
  return all
    .filter((x) => x.parent_id === parentId)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

interface MenuManagementTableProps {
  items: CategoryWithSettings[];
  /** 거래 메뉴 주제 미리보기용 전체 카테고리( parent_id 포함 ) */
  allCategories?: CategoryWithSettings[];
  /** 거래/커뮤니티 구분 열 (선택) */
  showTypeColumn?: boolean;
  /** 중고 메뉴에서만 주제(2행 칩) 관리 버튼 표시 */
  tradeSubtopicsEnabled?: boolean;
  onToggleShowOnMenu: (id: string, current: boolean) => void | Promise<void>;
  /** 홈 FAB 글쓰기 런처(quick_create_enabled) */
  onToggleQuickLauncher?: (id: string, current: boolean) => void | Promise<void>;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onMoveUp: (id: string) => void | Promise<void>;
  onMoveDown: (id: string) => void | Promise<void>;
  onManageSubtopics?: (category: CategoryWithSettings) => void;
}

export function MenuManagementTable({
  items,
  allCategories,
  showTypeColumn = false,
  tradeSubtopicsEnabled = false,
  onToggleShowOnMenu,
  onToggleQuickLauncher,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  onManageSubtopics,
}: MenuManagementTableProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
        등록된 항목이 없습니다. 항목 추가로 메뉴·카테고리를 등록해 주세요.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full min-w-[720px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2 text-left font-medium text-gray-700">순서</th>
            {showTypeColumn ? (
              <th className="px-3 py-2 text-left font-medium text-gray-700">메인 글 유형</th>
            ) : null}
            <th className="px-3 py-2 text-left font-medium text-gray-700">이름</th>
            <th className="px-3 py-2 text-left font-medium text-gray-700">slug</th>
            <th className="px-3 py-2 text-left font-medium text-gray-700">기능 선택</th>
            <th className="px-3 py-2 text-left font-medium text-gray-700">메뉴·칩 노출</th>
            <th className="whitespace-nowrap px-3 py-2 text-center font-medium text-gray-700">글쓰기 런처</th>
            <th className="px-3 py-2 text-center font-medium text-gray-700">아이콘</th>
            {tradeSubtopicsEnabled ? (
              <th className="min-w-[160px] max-w-[240px] px-3 py-2 text-left font-medium text-gray-700">주제 목록</th>
            ) : null}
            {tradeSubtopicsEnabled ? (
              <th className="whitespace-nowrap px-3 py-2 text-center font-medium text-gray-700">2행 주제</th>
            ) : null}
            <th className="px-3 py-2 text-right font-medium text-gray-700">관리</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c, index) => (
            <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50/50">
              <td className="px-3 py-2 text-gray-600">{c.sort_order + 1}</td>
              {showTypeColumn ? (
                <td className="px-3 py-2">
                  <CategoryTypeBadge type={c.type} />
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    {c.type === "trade" ? "홈 상단 칩(중고)" : "게시판형 글"}
                  </p>
                </td>
              ) : null}
              <td className="px-3 py-2 font-medium text-gray-900">{c.name}</td>
              <td className="px-3 py-2 text-[12px] text-gray-600">{c.slug}</td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1 text-[11px]">
                  {c.settings?.can_write !== false && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">글쓰기</span>}
                  {c.settings?.has_price && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">가격</span>}
                  {c.settings?.has_chat && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">채팅</span>}
                  {c.settings?.has_location !== false && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">위치</span>}
                  {c.settings?.has_direct_deal !== false && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">직거래</span>}
                  {c.settings?.has_free_share !== false && <span className="rounded bg-green-50 px-1.5 py-0.5 text-green-700">나눔</span>}
                </div>
              </td>
              <td className="px-3 py-2">
                <label
                  className="inline-flex cursor-pointer items-center gap-2"
                  title={
                    c.type === "trade"
                      ? "켜면 홈 상단 칩에 표시됩니다."
                      : "거래(중고)는 홈 칩, 커뮤니티는 글쓰기 런처 등에 반영됩니다."
                  }
                >
                  <input
                    type="checkbox"
                    checked={c.show_in_home_chips !== false}
                    onChange={() => onToggleShowOnMenu(c.id, c.show_in_home_chips !== false)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-[13px] text-gray-700">
                    {c.show_in_home_chips !== false ? "적용" : "미적용"}
                  </span>
                </label>
              </td>
              <td className="px-3 py-2 text-center">
                {onToggleQuickLauncher ? (
                  <label
                    className="inline-flex cursor-pointer flex-col items-center gap-0.5"
                    title="홈·거래 화면 + 메뉴의 글쓰기 주제 목록에 넣습니다."
                  >
                    <input
                      type="checkbox"
                      checked={c.quick_create_enabled === true}
                      onChange={() => onToggleQuickLauncher(c.id, c.quick_create_enabled === true)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-[10px] text-gray-500">{c.quick_create_enabled ? "ON" : "OFF"}</span>
                  </label>
                ) : (
                  <span className="text-[12px] text-gray-400">—</span>
                )}
              </td>
              <td className="px-3 py-2">
                <div className="flex justify-center" title={`icon_key: ${c.icon_key}`}>
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-200 text-neutral-700">
                    <CategoryIcon iconKey={c.icon_key} className="size-[18px] text-current" />
                  </span>
                </div>
              </td>
              {tradeSubtopicsEnabled ? (
                <td className="max-w-[240px] align-top px-3 py-2 text-[12px] text-gray-700">
                  {(() => {
                    const subs = subtopicsForParent(allCategories, c.id);
                    if (subs.length === 0) {
                      return <span className="text-gray-400">등록된 주제 없음</span>;
                    }
                    return (
                      <ul className="space-y-0.5">
                        {subs.map((s) => (
                          <li key={s.id} className="truncate" title={`${s.name} (${s.slug})`}>
                            {!s.is_active ? <span className="text-gray-400">(비활성) </span> : null}
                            {s.name}
                            <span className="ml-1 text-[11px] text-gray-400">{s.slug}</span>
                          </li>
                        ))}
                      </ul>
                    );
                  })()}
                </td>
              ) : null}
              {tradeSubtopicsEnabled ? (
                <td className="px-3 py-2 text-center">
                  {onManageSubtopics ? (
                    <button
                      type="button"
                      onClick={() => onManageSubtopics(c)}
                      className="rounded-lg border border-signature/40 bg-signature/5 px-3 py-1.5 text-[12px] font-semibold text-signature hover:bg-signature/15"
                      title="현대·기아 등 2행 칩·글쓰기 주제"
                    >
                      주제 관리
                    </button>
                  ) : (
                    <span className="text-[12px] text-gray-400">—</span>
                  )}
                </td>
              ) : null}
              <td className="px-3 py-2 text-right">
                <div className="flex flex-wrap items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => onMoveUp(c.id)}
                    disabled={index === 0}
                    className="rounded p-1 text-gray-500 hover:bg-gray-200 disabled:opacity-40"
                    title="위로"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => onMoveDown(c.id)}
                    disabled={index === items.length - 1}
                    className="rounded p-1 text-gray-500 hover:bg-gray-200 disabled:opacity-40"
                    title="아래로"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit(c.id)}
                    className="rounded px-1.5 py-0.5 text-[12px] text-signature hover:bg-signature/10"
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(c.id)}
                    className="rounded px-1.5 py-0.5 text-[12px] text-red-600 hover:bg-red-50"
                  >
                    삭제
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
