"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

/**
 * 4-0 (RC-11) — 오너 화면 공통 토스트 (성공·실패 2종).
 * 호스트는 오너 셸(`BusinessAdminShell`)에 1곳만 마운트하고, 화면은 `useOwnerToast()` 로만 띄운다.
 */

export type OwnerToastKind = "success" | "error";
export type OwnerToastItem = { id: number; kind: OwnerToastKind; message: string };

const MAX_VISIBLE = 3;
export const OWNER_TOAST_DURATION_MS = 3200;
const EMPTY: OwnerToastItem[] = [];

let items: OwnerToastItem[] = EMPTY;
let seq = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): OwnerToastItem[] {
  return items;
}

function getServerSnapshot(): OwnerToastItem[] {
  return EMPTY;
}

function pushOwnerToast(kind: OwnerToastKind, message: string) {
  const text = message.trim();
  if (!text) return;
  seq += 1;
  items = [...items, { id: seq, kind, message: text }].slice(-MAX_VISIBLE);
  emit();
}

function dismissOwnerToast(id: number) {
  const next = items.filter((x) => x.id !== id);
  if (next.length === items.length) return;
  items = next.length === 0 ? EMPTY : next;
  emit();
}

/** 테스트 전용 — 모듈 상태 초기화 */
export function resetOwnerToastsForTest() {
  items = EMPTY;
  seq = 0;
  emit();
}

export type OwnerToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
};

const OWNER_TOAST_API: OwnerToastApi = {
  success: (message) => pushOwnerToast("success", message),
  error: (message) => pushOwnerToast("error", message),
};

export function useOwnerToast(): OwnerToastApi {
  return OWNER_TOAST_API;
}

function OwnerToastRow({ item, dismissLabel }: { item: OwnerToastItem; dismissLabel: string }) {
  useEffect(() => {
    const timer = setTimeout(() => dismissOwnerToast(item.id), OWNER_TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [item.id]);

  const tone =
    item.kind === "error"
      ? "border-sam-danger bg-sam-danger-soft text-sam-danger"
      : "border-sam-success bg-sam-success-soft text-sam-fg";

  return (
    <div
      role={item.kind === "error" ? "alert" : "status"}
      data-owner-toast={item.kind}
      className={`pointer-events-auto flex w-full max-w-md items-start gap-2 rounded-ui-rect border px-3 py-2 shadow-[var(--sam-shadow-elevated)] ${tone}`}
    >
      <p className="min-w-0 flex-1 sam-text-body-secondary font-medium">{item.message}</p>
      <button
        type="button"
        onClick={() => dismissOwnerToast(item.id)}
        aria-label={dismissLabel}
        className="shrink-0 rounded-ui-rect px-1 sam-text-helper text-sam-muted"
      >
        ✕
      </button>
    </div>
  );
}

export function OwnerToastHost() {
  const { t } = useI18n();
  const list = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (list.length === 0) return null;
  return (
    <div
      data-owner-toast-host="1"
      aria-label={t("owner_s4_toast_region")}
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--safe-bottom,0px)+5.5rem)] z-[130] flex flex-col items-center gap-2 px-4"
    >
      {list.map((item) => (
        <OwnerToastRow key={item.id} item={item} dismissLabel={t("owner_s4_toast_dismiss")} />
      ))}
    </div>
  );
}
