"use client";

import { useCallback, useState, type ReactNode } from "react";
import { DibayShareSheet, type DibayShareSheetProps } from "./DibayShareSheet";

export type DibayShareSheetConfig = Omit<DibayShareSheetProps, "open" | "onClose">;

/**
 * 통합 공유 시트를 여는 훅 (S3) — 화면마다 따로 만든 「공유 또는 복사」 코드를 대신한다.
 * `openShare(config)` 로 열고, `shareSheet` 를 화면 아무 곳에 한 번 그린다.
 */
export function useDibayShareSheet(): {
  openShare: (config: DibayShareSheetConfig) => void;
  shareSheet: ReactNode;
} {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<DibayShareSheetConfig | null>(null);

  const openShare = useCallback((next: DibayShareSheetConfig) => {
    setConfig(next);
    setOpen(true);
  }, []);

  const onClose = useCallback(() => setOpen(false), []);

  const shareSheet = config ? <DibayShareSheet {...config} open={open} onClose={onClose} /> : null;

  return { openShare, shareSheet };
}
