"use client";

/**
 * Admin 상세 드로어 (설계 v4 §7 「상세 드로어」) — 오른쪽, 폭 min(720px, 50vw)(좁은 화면은 전체 폭).
 * 머리글(제목·부제·닫기) → 스크롤 본문 → 하단 고정 작업 바(위험 작업 왼쪽 · 주요 작업 오른쪽).
 * Esc·배경·닫기 버튼 → `onClose`. `dirty` 면 기존 `AdminActionConfirmDialog` 로 먼저 확인한다.
 * 포커스: 열릴 때 패널 안 첫 요소, Tab 순환(가벼운 트랩), 닫히면 열기 전 요소로 복귀.
 * `pending` 이면 닫기를 막는다(처리 중 이탈 방지).
 * body 포털로 그리므로 루트에 `data-admin` 을 붙여 콘솔 토큰을 그대로 쓴다.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AdminActionConfirmDialog } from "@/components/admin/ui/AdminActionConfirmDialog";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableIn(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
}

const noopSubscribe = () => () => {};

export type AdminDetailDrawerCloseConfirmCopy = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
};

export function adminDetailDrawerCloseConfirmCopy(ko: boolean): AdminDetailDrawerCloseConfirmCopy {
  return ko
    ? {
        title: "저장하지 않은 변경 사항이 있습니다",
        description: "닫으면 입력한 내용이 사라집니다. 닫을까요?",
        confirmLabel: "닫기",
        cancelLabel: "계속 편집",
      }
    : {
        title: "You have unsaved changes",
        description: "Closing will discard your changes. Close anyway?",
        confirmLabel: "Discard",
        cancelLabel: "Keep editing",
      };
}

export function AdminDetailDrawer({
  open,
  onClose,
  ko,
  title,
  subtitle,
  children,
  primaryActions,
  dangerActions,
  dirty = false,
  pending = false,
  closeConfirmCopy,
  ariaLabel,
}: {
  open: boolean;
  onClose: () => void;
  ko: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  /** 하단 오른쪽 (승인·저장 등). 주요 버튼은 1개. */
  primaryActions?: ReactNode;
  /** 하단 왼쪽, 일반 버튼과 떨어져 (삭제·정지·반려 등). */
  dangerActions?: ReactNode;
  /** 미저장 변경 — 닫기 전 확인 */
  dirty?: boolean;
  /** 처리 중 — 닫기 막음 */
  pending?: boolean;
  closeConfirmCopy?: AdminDetailDrawerCloseConfirmCopy;
  /** title 이 문자열이 아닐 때 스크린리더 이름 */
  ariaLabel?: string;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // SSR·하이드레이션 첫 렌더는 인라인, 이후 body 포털 (서버 스냅샷 false).
  const canPortal = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const requestClose = useCallback(() => {
    if (pending) return;
    if (dirty) {
      setConfirmOpen(true);
      return;
    }
    onClose();
  }, [dirty, onClose, pending]);

  // 열림: 이전 포커스 기억 → 패널 첫 요소 포커스. 닫힘: 복귀.
  useEffect(() => {
    if (!open) return;
    const doc = panelRef.current?.ownerDocument ?? (typeof document !== "undefined" ? document : null);
    restoreRef.current = (doc?.activeElement as HTMLElement | null) ?? null;
    const first = focusableIn(panelRef.current)[0] ?? panelRef.current;
    first?.focus();
    return () => {
      const el = restoreRef.current;
      restoreRef.current = null;
      if (el && typeof el.focus === "function" && el.isConnected) el.focus();
    };
  }, [open]);

  // Esc — 확인 팝업이 떠 있으면 팝업이 처리한다.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || confirmOpen) return;
      e.preventDefault();
      requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmOpen, open, requestClose]);

  // 본문 스크롤 잠금
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const onPanelKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const items = focusableIn(panelRef.current);
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = panelRef.current?.ownerDocument.activeElement;
    if (e.shiftKey && (active === first || active === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (!open) return null;

  const copy = closeConfirmCopy ?? adminDetailDrawerCloseConfirmCopy(ko);
  const hasFooter = primaryActions != null || dangerActions != null;

  const drawer = (
    <div className="fixed inset-0 z-[1200]" data-admin="" data-admin-detail-drawer="1" role="presentation">
      <button
        type="button"
        aria-label={ko ? "닫기" : "Close"}
        tabIndex={-1}
        className="absolute inset-0 h-full w-full cursor-default bg-black/30"
        onClick={requestClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabel ? undefined : titleId}
        aria-label={ariaLabel}
        tabIndex={-1}
        onKeyDown={onPanelKeyDown}
        className="absolute inset-y-0 right-0 flex w-full flex-col border-l border-[var(--admin-console-border)] bg-[var(--admin-console-surface)] text-[var(--admin-console-fg)] shadow-xl outline-none md:w-[min(720px,50vw)] md:min-w-[480px]"
        data-admin-detail-drawer-panel="1"
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-[var(--admin-console-border)] px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-[16px] font-semibold leading-6">
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-0.5 text-[13px] text-[var(--admin-console-muted)]">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={pending}
            aria-label={ko ? "닫기" : "Close"}
            data-admin-detail-drawer-close="1"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-ui-rect text-[20px] text-[var(--admin-console-muted)] hover:bg-[var(--admin-console-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--admin-console-accent)] disabled:opacity-40"
          >
            <span aria-hidden>×</span>
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 text-[14px]" data-admin-detail-drawer-body="1">
          {children}
        </div>
        {hasFooter ? (
          <footer
            className="flex shrink-0 items-center gap-2 border-t border-[var(--admin-console-border)] bg-[var(--admin-console-surface)] px-4 py-3"
            data-admin-detail-drawer-footer="1"
          >
            <div className="flex flex-wrap items-center gap-2" data-admin-detail-drawer-danger="1">
              {dangerActions}
            </div>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2" data-admin-detail-drawer-primary="1">
              {primaryActions}
            </div>
          </footer>
        ) : null}
      </div>
      <AdminActionConfirmDialog
        open={confirmOpen}
        title={copy.title}
        description={copy.description}
        confirmLabel={copy.confirmLabel}
        cancelLabel={copy.cancelLabel}
        tone="danger"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          onClose();
        }}
      />
    </div>
  );

  return canPortal && typeof document !== "undefined" ? createPortal(drawer, document.body) : drawer;
}
