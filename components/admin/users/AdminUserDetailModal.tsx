"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminMemberDetail, type AdminUserDetailPayload } from "./AdminTestUserDetail";
import type { MessageKey } from "@/lib/i18n/messages";

type DetailLoadState =
  | { kind: "loading" }
  | { kind: "user"; user: AdminUserDetailPayload }
  | { kind: "error"; messageKey: MessageKey };

interface AdminUserDetailModalProps {
  userId: string;
  onClose: () => void;
  onUpdated?: () => void;
  onSendMessage?: (userId: string) => void;
}

function detailErrorKeyForStatus(status: number): MessageKey {
  if (status === 401) return "admin_users_error_login_required";
  if (status === 403) return "admin_users_error_admin_only";
  if (status === 404) return "admin_users_detail_not_found";
  if (status >= 500) return "admin_users_error_fetch_failed";
  return "admin_users_error_fetch_failed";
}

export function AdminUserDetailModal({ userId, onClose, onUpdated, onSendMessage }: AdminUserDetailModalProps) {
  const { t } = useI18n();
  const [state, setState] = useState<DetailLoadState>({ kind: "loading" });
  const mountedRef = useRef(false);

  const loadDetail = useCallback(async (id: string, signal?: AbortSignal) => {
    if (mountedRef.current) {
      setState({ kind: "loading" });
    }
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(id)}`, {
        credentials: "include",
        cache: "no-store",
        signal,
      });
      if (signal?.aborted || !mountedRef.current) return;
      if (res.ok) {
        const data = (await res.json()) as { ok?: boolean; user?: AdminUserDetailPayload };
        if (signal?.aborted || !mountedRef.current) return;
        if (data.ok && data.user) {
          setState({ kind: "user", user: data.user });
          return;
        }
        setState({ kind: "error", messageKey: "admin_users_error_fetch_failed" });
        return;
      }
      if (!mountedRef.current) return;
      setState({ kind: "error", messageKey: detailErrorKeyForStatus(res.status) });
    } catch (err) {
      if (signal?.aborted || !mountedRef.current) return;
      if (err instanceof Error && err.name === "AbortError") return;
      setState({ kind: "error", messageKey: "admin_users_error_network" });
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    void loadDetail(userId, controller.signal);
    return () => {
      mountedRef.current = false;
      controller.abort();
    };
  }, [loadDetail, userId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  const handleUpdated = useCallback(() => {
    onUpdated?.();
    void loadDetail(userId);
  }, [loadDetail, onUpdated, userId]);

  const handleDeleted = useCallback(() => {
    onUpdated?.();
    onClose();
  }, [onClose, onUpdated]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-3 sm:p-6"
      onClick={handleBackdrop}
      role="presentation"
    >
      <div
        className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-[#e4e7ec] bg-[#f4f6f9] shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-user-detail-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#e4e7ec] bg-white px-4 py-3 sm:px-5">
          <h2 id="admin-user-detail-modal-title" className="text-lg font-bold text-[#101828]">
            {t("admin_users_detail_title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#d0d5dd] bg-white text-[#667085] transition hover:bg-[#f9fafb]"
            aria-label={t("common_close")}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {state.kind === "loading" ? (
            <div className="py-16 text-center text-sm font-medium text-[#667085]">
              {t("admin_users_detail_loading")}
            </div>
          ) : state.kind === "error" ? (
            <div className="py-16 text-center text-sm font-medium text-[#667085]">{t(state.messageKey)}</div>
          ) : (
            <AdminMemberDetail
              user={state.user}
              presentation="modal"
              onUpdated={handleUpdated}
              onSendMessage={onSendMessage}
              onDeleted={handleDeleted}
            />
          )}
        </div>
      </div>
    </div>
  );
}
