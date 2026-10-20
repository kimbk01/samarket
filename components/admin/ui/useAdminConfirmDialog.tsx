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

/** `window.prompt` 대체 — 한 줄 입력을 받는다. 취소·빈 입력은 null. */
export type AdminPromptRequest = Omit<AdminConfirmRequest, "confirmMatchText" | "confirmMatchLabel"> & {
  inputLabel: string;
  inputPlaceholder?: string;
};

type OpenRequest = AdminConfirmRequest & { inputLabel?: string; inputPlaceholder?: string };

export function useAdminConfirmDialog(): {
  confirm: (req: AdminConfirmRequest) => Promise<boolean>;
  prompt: (req: AdminPromptRequest) => Promise<string | null>;
  dialog: ReactNode;
} {
  const [request, setRequest] = useState<OpenRequest | null>(null);
  const resolverRef = useRef<((ok: boolean, text: string) => void) | null>(null);

  const settle = useCallback((ok: boolean, text = "") => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setRequest(null);
    resolve?.(ok, text);
  }, []);

  const open = useCallback((req: OpenRequest, resolve: (ok: boolean, text: string) => void) => {
    // 이전 요청이 열려 있으면 취소로 끝낸다 (중복 확인 방지).
    resolverRef.current?.(false, "");
    resolverRef.current = resolve;
    setRequest(req);
  }, []);

  const confirm = useCallback(
    (req: AdminConfirmRequest) => new Promise<boolean>((resolve) => open(req, (ok) => resolve(ok))),
    [open]
  );

  const prompt = useCallback(
    (req: AdminPromptRequest) =>
      new Promise<string | null>((resolve) =>
        open(req, (ok, text) => {
          const value = text.trim();
          resolve(ok && value ? value : null);
        })
      ),
    [open]
  );

  useEffect(
    () => () => {
      resolverRef.current?.(false, "");
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
      reasonRequired={request?.inputLabel != null}
      reasonLabel={request?.inputLabel}
      reasonPlaceholder={request?.inputPlaceholder}
      onCancel={() => settle(false)}
      onConfirm={(text) => settle(true, text)}
    />
  );

  return { confirm, prompt, dialog };
}
