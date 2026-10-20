"use client";

/**
 * 설계 v4 §7 — `window.confirm` 대체. 기존 `if (!window.confirm(msg)) return;` 흐름을 그대로 유지하도록
 * `await confirm({...})` 가 true/false 로 끝나는 Promise 를 돌려주고, 화면에는 AdminActionConfirmDialog 를 띄운다.
 * 동작·조건은 호출부가 그대로 가진다 — 이 훅은 확인 UI 만 바꾼다.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AdminActionConfirmDialog } from "@/components/admin/ui/AdminActionConfirmDialog";
import type { AdminMutationConfirmTone } from "@/lib/admin/ads-exposure/admin-mutation-confirm-copy";

export type AdminConfirmRequest = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  tone?: AdminMutationConfirmTone;
  /** 지정 시 이 문구를 그대로 다시 입력해야 확인된다 (L3). */
  confirmMatchText?: string;
  confirmMatchLabel?: string;
};

export function useAdminConfirmDialog(): {
  confirm: (req: AdminConfirmRequest) => Promise<boolean>;
  dialog: ReactNode;
} {
  const [request, setRequest] = useState<AdminConfirmRequest | null>(null);
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);

  const settle = useCallback((ok: boolean) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setRequest(null);
    resolve?.(ok);
  }, []);

  const confirm = useCallback((req: AdminConfirmRequest) => {
    // 이전 요청이 열려 있으면 취소로 끝낸다 (중복 확인 방지).
    resolverRef.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setRequest(req);
    });
  }, []);

  useEffect(
    () => () => {
      resolverRef.current?.(false);
      resolverRef.current = null;
    },
    []
  );

  const dialog = (
    <AdminActionConfirmDialog
      open={request != null}
      title={request?.title ?? ""}
      description={request?.description ?? ""}
      confirmLabel={request?.confirmLabel ?? ""}
      cancelLabel={request?.cancelLabel ?? ""}
      tone={request?.tone ?? "primary"}
      confirmMatchText={request?.confirmMatchText}
      confirmMatchLabel={request?.confirmMatchLabel}
      onCancel={() => settle(false)}
      onConfirm={() => settle(true)}
    />
  );

  return { confirm, dialog };
}
