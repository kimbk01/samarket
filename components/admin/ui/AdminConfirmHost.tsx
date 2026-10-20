"use client";

/**
 * 관리자 셸 공용 확인창 (수정 계획 2-3) — `confirmAdminAction`(L1·L2·L3)이 여는 단 하나의 확인창.
 * 화면은 `confirmAdminAction` 또는 `useAdminConfirmDialog` 만 쓴다 (같은 AdminActionConfirmDialog).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminActionConfirmDialog } from "@/components/admin/ui/AdminActionConfirmDialog";
import {
  registerAdminConfirmHost,
  type AdminConfirmHostRequest,
  type AdminConfirmHostResult,
} from "@/lib/admin/operator-ux/admin-confirm-host";

export function AdminConfirmHost() {
  const [request, setRequest] = useState<AdminConfirmHostRequest | null>(null);
  const resolverRef = useRef<((r: AdminConfirmHostResult) => void) | null>(null);

  const settle = useCallback((r: AdminConfirmHostResult) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setRequest(null);
    resolve?.(r);
  }, []);

  useEffect(
    () =>
      registerAdminConfirmHost(
        (req) =>
          new Promise<AdminConfirmHostResult>((resolve) => {
            // 열린 확인창이 있으면 취소로 끝낸다 (중복 실행 방지).
            resolverRef.current?.({ ok: false, reason: "" });
            resolverRef.current = resolve;
            setRequest(req);
          })
      ),
    []
  );

  useEffect(
    () => () => {
      resolverRef.current?.({ ok: false, reason: "" });
      resolverRef.current = null;
    },
    []
  );

  return (
    <AdminActionConfirmDialog
      open={request != null}
      title={request?.title ?? ""}
      description={request?.description ?? ""}
      confirmLabel={request?.confirmLabel ?? ""}
      cancelLabel={request?.cancelLabel ?? ""}
      tone={request?.tone ?? "primary"}
      reasonRequired={request?.reasonRequired ?? false}
      reasonMinLength={request?.reasonMinLength}
      reasonLabel={request?.reasonLabel}
      reasonPlaceholder={request?.reasonPlaceholder}
      confirmMatchText={request?.confirmMatchText}
      confirmMatchLabel={request?.confirmMatchLabel}
      onCancel={() => settle({ ok: false, reason: "" })}
      onConfirm={(reason) => settle({ ok: true, reason })}
    />
  );
}
