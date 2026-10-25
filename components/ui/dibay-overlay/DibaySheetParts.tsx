"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";

/**
 * 시트 공용 부품 — 메신저 UI 통일 설계(1단계 문서 §13-2 · 2026-10-25 Owner 승인).
 * S1 머리: 제목 왼쪽 + 오른쪽 X 아이콘(글자 「닫기」 금지).
 * S3 행동 메뉴: 아이콘 + 글자 행, 묶음 사이 간격 띠, 위험 행동은 마지막 묶음·빨간색.
 * S4 빠른 행동: 가로 아이콘 버튼(아이콘 위 · 글자 아래).
 */

export function DibaySheetHeader({
  title,
  onClose,
  closeLabel,
  trailing,
  titleId,
}: {
  title: ReactNode;
  onClose: () => void;
  closeLabel: string;
  /** X 왼쪽 보조 아이콘 버튼(예: 알림 설정) */
  trailing?: ReactNode;
  titleId?: string;
}) {
  return (
    <div className="dibay-overlay-sheet-header" data-dibay-sheet-header="">
      <h2 id={titleId} className="dibay-overlay-sheet-header__title">
        {title}
      </h2>
      <div className="dibay-overlay-sheet-header__actions">
        {trailing}
        <button type="button" className="dibay-overlay-icon-btn" aria-label={closeLabel} onClick={onClose}>
          <X className="h-5 w-5" strokeWidth={2} aria-hidden />
        </button>
      </div>
    </div>
  );
}

export type DibayMenuItem = {
  key: string;
  icon: ReactNode;
  label: ReactNode;
  /** 글자 아래 보조 설명(예: 「대화 시작 후 설정 가능」) */
  hint?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
};

/** 묶음 배열 — 빈 묶음은 그리지 않는다. 위험 행동은 호출부가 마지막 묶음에 둔다. */
export function DibayMenuList({ groups }: { groups: DibayMenuItem[][] }) {
  const visible = groups.filter((g) => g.length > 0);
  if (visible.length === 0) return null;
  return (
    <div className="dibay-overlay-menu" role="menu" data-dibay-menu="">
      {visible.map((group, gi) => (
        <div key={gi} className="dibay-overlay-menu__group">
          {group.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              disabled={item.disabled || !item.onClick}
              onClick={item.onClick}
              className={`dibay-overlay-menu__item${item.danger ? " dibay-overlay-menu__item--danger" : ""}`}
            >
              <span className="dibay-overlay-menu__icon" aria-hidden>
                {item.icon}
              </span>
              <span className="dibay-overlay-menu__text">
                <span className="dibay-overlay-menu__label">{item.label}</span>
                {item.hint ? <span className="dibay-overlay-menu__hint">{item.hint}</span> : null}
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

export type DibayQuickAction = {
  key: string;
  icon: ReactNode;
  label: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** 주 행동 1개만 — 채운 원 */
  primary?: boolean;
};

export function DibayQuickActions({ items }: { items: DibayQuickAction[] }) {
  if (items.length === 0) return null;
  return (
    <div className="dibay-overlay-quick-actions" data-dibay-quick-actions="">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          disabled={item.disabled || item.loading || !item.onClick}
          onClick={item.onClick}
          aria-busy={item.loading || undefined}
          className={`dibay-overlay-quick-action${item.primary ? " dibay-overlay-quick-action--primary" : ""}`}
        >
          <span className="dibay-overlay-quick-action__circle" aria-hidden>
            {item.loading ? <span className="dibay-overlay-quick-action__spinner" /> : item.icon}
          </span>
          <span className="dibay-overlay-quick-action__label">{item.label}</span>
        </button>
      ))}
    </div>
  );
}
