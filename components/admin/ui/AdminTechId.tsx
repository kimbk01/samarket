"use client";

/**
 * 설계 v4 §7 「기술 정보」 — UUID·원시 ID 는 운영자 본문에 그대로 노출하지 않는다.
 *
 * - `AdminTechId`: 흐린 고정폭 짧은 ID + 복사 버튼. 전체 ID 는 title·aria 에만.
 * - `AdminTechInfo`: 상세 화면용 접이식 「기술 정보」 블록 (ID·원시 값 모음).
 * - `formatAdminShortId`: 문자열 문맥(이름 대체 표시·결과 문구)용 짧은 ID.
 *
 * 관리자 UI 의 ID 축약(`.slice(0, 8)`)은 **이 파일만** 한다 — ratchet:
 * `components/admin/ui/__tests__/admin-tech-id-ratchet.test.ts`.
 */

import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

const SHORT_ID_LENGTH = 8;

/** 짧은 ID (앞 8자). 8자 이하면 그대로. 빈 값은 빈 문자열. */
export function formatAdminShortId(id: string | number | null | undefined): string {
  const s = id == null ? "" : String(id);
  return s.length > SHORT_ID_LENGTH ? s.slice(0, 8) : s;
}

/** 짧은 ID + 말줄임표(잘린 경우에만). */
export function formatAdminShortIdEllipsis(id: string | number | null | undefined): string {
  const s = id == null ? "" : String(id);
  return s.length > SHORT_ID_LENGTH ? `${s.slice(0, 8)}…` : s;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy path */
  }
  try {
    if (typeof document === "undefined") return false;
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function AdminTechId({
  id,
  prefix,
  copyable = true,
  className = "",
}: {
  id: string | number | null | undefined;
  /** 짧은 ID 앞에 붙는 고정 접두(예: "#"). */
  prefix?: string;
  copyable?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const full = id == null ? "" : String(id);
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const onCopy = useCallback(
    async (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const ok = await copyText(full);
      setState(ok ? "copied" : "failed");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setState("idle"), 1500);
    },
    [full]
  );

  if (!full) return <span className={`text-sam-muted ${className}`}>—</span>;

  const short = formatAdminShortIdEllipsis(full);
  return (
    <span
      data-admin-tech-id=""
      className={`inline-flex max-w-full items-center gap-1 align-baseline font-mono text-[12px] leading-4 text-sam-muted ${className}`}
    >
      <span title={full} aria-label={full} className="truncate">
        {prefix ?? ""}
        {short}
      </span>
      {copyable ? (
        <button
          type="button"
          onClick={onCopy}
          title={full}
          aria-label={t("admin_tech_id_copy_aria", { id: full })}
          className="shrink-0 rounded-ui-rect border border-sam-border px-1 font-sans text-[12px] leading-4 text-sam-muted hover:bg-sam-surface-muted hover:text-sam-fg"
        >
          {state === "copied"
            ? t("admin_tech_id_copied")
            : state === "failed"
              ? t("admin_tech_id_copy_failed")
              : t("admin_tech_id_copy")}
        </button>
      ) : null}
    </span>
  );
}

export type AdminTechInfoRow = {
  label: ReactNode;
  /** ID·UUID 는 `id` 로 (복사 버튼), 그 외 원시 값은 `value`. */
  id?: string | number | null;
  value?: ReactNode;
};

/** 상세 화면용 접이식 「기술 정보」 블록. 기본 접힘. */
export function AdminTechInfo({
  rows,
  children,
  defaultOpen = false,
  className = "",
}: {
  rows?: AdminTechInfoRow[];
  children?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const visible = (rows ?? []).filter((r) => (r.id != null && String(r.id) !== "") || r.value != null);
  if (visible.length === 0 && !children) return null;
  return (
    <details
      data-admin-tech-info=""
      open={defaultOpen || undefined}
      className={`rounded-ui-rect border border-sam-border bg-sam-surface-muted/40 px-3 py-2 ${className}`}
    >
      <summary className="cursor-pointer select-none text-[12px] font-semibold text-sam-muted">
        {t("admin_tech_info_title")}
      </summary>
      {visible.length > 0 ? (
        <dl className="mt-2 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1 text-[12px]">
          {visible.map((r, i) => (
            <div key={i} className="contents">
              <dt className="text-sam-muted">{r.label}</dt>
              <dd className="min-w-0">
                {r.id != null && String(r.id) !== "" ? (
                  <AdminTechId id={r.id} />
                ) : (
                  <span className="break-all font-mono text-[12px] text-sam-fg">{r.value}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {children ? <div className="mt-2 text-[12px]">{children}</div> : null}
    </details>
  );
}
