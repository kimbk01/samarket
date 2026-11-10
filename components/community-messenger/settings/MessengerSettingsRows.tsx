"use client";

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

/**
 * 메신저 설정 줄 SSOT — 채팅 설정(채팅 시안 4판 「7. 채팅 설정」)과 연락처 동기화 설정이 같은 줄을 쓴다.
 * 묶음 이름(12.5) · 켬/끔 줄(56) · 상세로 가는 줄(54, ›).
 */

/** 묶음 이름 — 12.5 회색 · 굵지 않게 · 여백 14 16 6 */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="px-4 pb-1.5 pt-3.5 text-[12.5px] font-normal leading-[1.3]" style={{ color: "var(--cm-chat-sub)" }}>
      {children}
    </h2>
  );
}

/** 켬/끔 줄 — 높이 56 · 좌우 16 · 글자 16 · 오른쪽 스위치 44×26 (켜짐 초록) */
export function SwitchRow({
  title,
  description,
  checked,
  disabled = false,
  onChange,
}: {
  title: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 px-4 ${description ? "min-h-14 py-2" : "h-14"}`}>
      <span className="min-w-0">
        <span className="block text-[16px] leading-[1.35]" style={{ color: "var(--cm-chat-fg)" }}>
          {title}
        </span>
        {description ? (
          <span className="mt-px block text-[12.5px] leading-snug" style={{ color: "var(--cm-chat-sub)" }}>
            {description}
          </span>
        ) : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        data-cm-settings-switch={checked ? "on" : "off"}
        className={`relative h-[26px] w-11 shrink-0 rounded-full transition-colors duration-150 disabled:opacity-50 ${
          checked ? "bg-sam-primary" : "bg-sam-border"
        }`}
      >
        <span
          aria-hidden
          className={`absolute top-[3px] h-5 w-5 rounded-full bg-white shadow-sm transition-[left] duration-150 ${
            checked ? "left-[21px]" : "left-[3px]"
          }`}
        />
      </button>
    </div>
  );
}

/** 상세로 가는 줄 — 높이 54 · 글자 16 · 오른쪽 › 회색 */
export function NavRow({
  title,
  description,
  value,
  danger = false,
  onClick,
  dataPage,
}: {
  title: string;
  description?: string;
  /** 오른쪽 회색 현재 값 (예: 「모두」) — › 앞 */
  value?: string;
  /** 삭제 등 위험 동작 줄 — 글자 빨강 */
  danger?: boolean;
  onClick: () => void;
  dataPage: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-cm-settings-nav={dataPage}
      className={`flex w-full items-center gap-3 px-4 text-left transition-colors active:bg-[color:var(--cm-chat-band)] ${
        description ? "min-h-[54px] py-2" : "h-[54px]"
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] leading-[1.35]" style={{ color: danger ? "var(--sam-danger)" : "var(--cm-chat-fg)" }}>
          {title}
        </span>
        {description ? (
          <span className="mt-px block truncate text-[12.5px] leading-snug" style={{ color: "var(--cm-chat-sub)" }}>
            {description}
          </span>
        ) : null}
      </span>
      {value ? (
        <span className="shrink-0 text-[14px]" style={{ color: "var(--cm-chat-sub)" }}>
          {value}
        </span>
      ) : null}
      <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "var(--cm-chat-sub)" }} strokeWidth={1.7} aria-hidden />
    </button>
  );
}
