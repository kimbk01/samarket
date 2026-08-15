"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayConfirmDialog, DibayInfoDialog } from "@/components/ui/dibay-overlay/DibayConfirmDialog";
import { DibayPromptDialog } from "@/components/ui/dibay-overlay/DibayPromptDialog";

export type DibayConfirmRequest = {
  title: string;
  description?: string;
  cancelLabel?: string;
  confirmLabel?: string;
  confirmTone?: "primary" | "destructive";
  blocking?: boolean;
};

export type DibayAlertRequest = {
  title: string;
  description?: string;
  confirmLabel?: string;
};

export type DibayPromptRequest = {
  title: string;
  description?: string;
  defaultValue?: string;
  placeholder?: string;
  cancelLabel?: string;
  confirmLabel?: string;
  confirmTone?: "primary" | "destructive";
  /** When true, empty trimmed value cannot confirm. */
  required?: boolean;
};

type HostApi = {
  confirm: (req: DibayConfirmRequest) => Promise<boolean>;
  alert: (req: DibayAlertRequest) => Promise<void>;
  prompt: (req: DibayPromptRequest) => Promise<string | null>;
};

const DibayAppDialogContext = createContext<HostApi | null>(null);

type ConfirmState = DibayConfirmRequest & {
  resolve: (value: boolean) => void;
};

type AlertState = DibayAlertRequest & {
  resolve: () => void;
};

type PromptState = DibayPromptRequest & {
  resolve: (value: string | null) => void;
};

/**
 * App-owned confirm/alert/prompt host — replaces window.* dialogs for product UX.
 * Mount once under AppLanguageProvider.
 */
export function DibayAppDialogProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [alertState, setAlertState] = useState<AlertState | null>(null);
  const [promptState, setPromptState] = useState<PromptState | null>(null);
  const confirmSeq = useRef(0);
  const alertSeq = useRef(0);
  const promptSeq = useRef(0);

  const confirm = useCallback((req: DibayConfirmRequest) => {
    confirmSeq.current += 1;
    return new Promise<boolean>((resolve) => {
      setConfirmState({ ...req, resolve });
    });
  }, []);

  const alert = useCallback((req: DibayAlertRequest) => {
    alertSeq.current += 1;
    return new Promise<void>((resolve) => {
      setAlertState({ ...req, resolve });
    });
  }, []);

  const prompt = useCallback((req: DibayPromptRequest) => {
    promptSeq.current += 1;
    return new Promise<string | null>((resolve) => {
      setPromptState({ ...req, resolve });
    });
  }, []);

  const api = useMemo(() => ({ confirm, alert, prompt }), [confirm, alert, prompt]);

  return (
    <DibayAppDialogContext.Provider value={api}>
      {children}
      <DibayConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title ?? ""}
        description={confirmState?.description}
        cancelLabel={confirmState?.cancelLabel ?? t("common_cancel")}
        confirmLabel={confirmState?.confirmLabel ?? t("common_confirm")}
        confirmTone={confirmState?.confirmTone ?? "primary"}
        blocking={confirmState?.blocking ?? false}
        onCancel={() => {
          const cur = confirmState;
          setConfirmState(null);
          cur?.resolve(false);
        }}
        onConfirm={() => {
          const cur = confirmState;
          setConfirmState(null);
          cur?.resolve(true);
        }}
      />
      <DibayInfoDialog
        open={Boolean(alertState)}
        title={alertState?.title ?? ""}
        description={alertState?.description}
        confirmLabel={alertState?.confirmLabel ?? t("common_confirm")}
        onConfirm={() => {
          const cur = alertState;
          setAlertState(null);
          cur?.resolve();
        }}
      />
      <DibayPromptDialog
        open={Boolean(promptState)}
        title={promptState?.title ?? ""}
        description={promptState?.description}
        defaultValue={promptState?.defaultValue ?? ""}
        placeholder={promptState?.placeholder}
        cancelLabel={promptState?.cancelLabel ?? t("common_cancel")}
        confirmLabel={promptState?.confirmLabel ?? t("common_confirm")}
        confirmTone={promptState?.confirmTone ?? "primary"}
        required={promptState?.required ?? false}
        onCancel={() => {
          const cur = promptState;
          setPromptState(null);
          cur?.resolve(null);
        }}
        onConfirm={(value) => {
          const cur = promptState;
          setPromptState(null);
          cur?.resolve(value);
        }}
      />
    </DibayAppDialogContext.Provider>
  );
}

export function useDibayAppDialog(): HostApi {
  const ctx = useContext(DibayAppDialogContext);
  if (!ctx) {
    throw new Error("useDibayAppDialog must be used within DibayAppDialogProvider");
  }
  return ctx;
}

/** Imperative bridge — set by provider mount for non-React call sites. */
let imperativeApi: HostApi | null = null;

export function bindDibayAppDialogApi(api: HostApi | null) {
  imperativeApi = api;
}

export async function dibayConfirm(req: DibayConfirmRequest): Promise<boolean> {
  if (!imperativeApi) {
    if (typeof window !== "undefined") {
      return window.confirm([req.title, req.description].filter(Boolean).join("\n"));
    }
    return false;
  }
  return imperativeApi.confirm(req);
}

export async function dibayAlert(req: DibayAlertRequest): Promise<void> {
  if (!imperativeApi) {
    if (typeof window !== "undefined") {
      window.alert([req.title, req.description].filter(Boolean).join("\n"));
    }
    return;
  }
  return imperativeApi.alert(req);
}

/** Cancel → null; Confirm → string (may be empty unless required blocked confirm). */
export async function dibayPrompt(req: DibayPromptRequest): Promise<string | null> {
  if (!imperativeApi) {
    if (typeof window !== "undefined") {
      return window.prompt(
        [req.title, req.description].filter(Boolean).join("\n"),
        req.defaultValue ?? ""
      );
    }
    return null;
  }
  return imperativeApi.prompt(req);
}
