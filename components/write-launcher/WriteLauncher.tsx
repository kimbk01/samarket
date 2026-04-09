"use client";

import { useWriteCategory } from "@/contexts/WriteCategoryContext";
import type { CategoryType } from "@/lib/categories/types";
import { CATEGORY_TYPE_LABELS } from "@/lib/types/category";
import {
  BOTTOM_NAV_FAB_LAYOUT,
  HOME_TRADE_HUB_SUB_FAB_BUTTON_CLASS,
} from "@/lib/main-menu/bottom-nav-config";
import { WriteLauncherOverlay } from "./WriteLauncherOverlay";
import { WriteLauncherGroup } from "./WriteLauncherGroup";

interface WriteLauncherProps {
  onClose: () => void;
  /** 기본: 좌측 + FAB 근처. `right`는 화면 우측 여백 기준 */
  anchor?: "left" | "right";
}

/** 카테고리 퀵메뉴 본문 — 좌측 플로팅 +버튼용 고정 위치, 우측 레일 옆 인라인 등에서 공통 사용 */
export function WriteLauncherPanel({
  onClose,
  /** true면 하단 흰 X 숨김 — 레일의 글쓰기 + 자리와 겹쳐 닫기 */
  hideFabClose = false,
  /** 홈 거래 다이얼 보조 버튼과 동일한 파란 원형 닫기 */
  subFabClose = false,
}: {
  onClose: () => void;
  hideFabClose?: boolean;
  subFabClose?: boolean;
}) {
  const writeCtx = useWriteCategory();
  const categories = writeCtx?.launcherRootCategories ?? [];
  const loading = writeCtx?.launcherCategoriesLoading ?? true;

  const typeOrder: CategoryType[] = ["trade", "service", "community", "feature"];
  const sections = typeOrder
    .map((type) => ({
      type,
      title: CATEGORY_TYPE_LABELS[type],
      list: categories.filter((c) => c.type === type),
    }))
    .filter((s) => s.list.length > 0);

  return (
    <div
      className={`flex w-[280px] max-w-[calc(100vw-2rem)] flex-col items-end ${hideFabClose ? "" : subFabClose ? "gap-3" : "gap-2"}`}
    >
      <div className="w-full rounded-ui-rect bg-white py-2 shadow-xl">
        {loading ? (
          <p className="py-8 text-center text-[14px] text-gray-500">불러오는 중…</p>
        ) : categories.length === 0 ? (
          <div className="px-4 py-8 text-center text-[14px] text-gray-500">
            <p>노출할 주제가 없습니다.</p>
            <p className="mt-2 text-[12px] leading-relaxed text-gray-400">
              관리자 → 메뉴 관리에서 항목의 「런처 노출」을 켜 주세요.
            </p>
          </div>
        ) : (
          <>
            {sections.map((s, i) => (
              <div key={s.type}>
                {i > 0 ? <div className="my-2 border-t border-gray-100" /> : null}
                <WriteLauncherGroup
                  groupKey={s.type}
                  title={s.title}
                  categories={s.list}
                  onItemClick={onClose}
                />
              </div>
            ))}
          </>
        )}
      </div>
      {!hideFabClose ? (
        <button
          type="button"
          onClick={onClose}
          className={
            subFabClose
              ? HOME_TRADE_HUB_SUB_FAB_BUTTON_CLASS
              : "flex h-12 w-12 items-center justify-center rounded-full bg-white text-gray-600 shadow-lg hover:bg-gray-50"
          }
          aria-label="닫기"
        >
          <CloseIcon className={subFabClose ? "text-white" : undefined} />
        </button>
      ) : null}
    </div>
  );
}

export function WriteLauncher({ onClose, anchor = "left" }: WriteLauncherProps) {
  const positionClass =
    anchor === "left"
      ? `${BOTTOM_NAV_FAB_LAYOUT.leftOffsetClass} items-start`
      : `${BOTTOM_NAV_FAB_LAYOUT.rightOffsetClass} items-end`;

  return (
    <WriteLauncherOverlay onClose={onClose}>
      <div
        className={`fixed z-40 flex flex-col ${BOTTOM_NAV_FAB_LAYOUT.bottomOffsetClass} ${positionClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        <WriteLauncherPanel onClose={onClose} />
      </div>
    </WriteLauncherOverlay>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
