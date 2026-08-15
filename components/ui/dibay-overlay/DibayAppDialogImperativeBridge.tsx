"use client";

import { useEffect } from "react";
import {
  bindDibayAppDialogApi,
  useDibayAppDialog,
} from "@/components/ui/dibay-overlay/DibayAppDialogProvider";

/** Binds imperative dibayConfirm/dibayAlert/dibayPrompt to the mounted provider. */
export function DibayAppDialogImperativeBridge() {
  const api = useDibayAppDialog();
  useEffect(() => {
    bindDibayAppDialogApi(api);
    return () => bindDibayAppDialogApi(null);
  }, [api]);
  return null;
}
