"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";
import { logCommunityShareEvent } from "./community-share-analytics";
import { copyTextToClipboard } from "./community-share-copy";
import {
  buildCommunityPostShareCardData,
  buildCommunityPostShareNativePayload,
} from "./community-share-payload";
import { shareCommunityPostViaNative } from "./community-share-native";

export function useCommunityPostShare(post: NeighborhoodFeedPostDTO, categoryLabel?: string) {
  const { t, safeT } = useI18n();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toastTimerRef = useRef<number | null>(null);

  const card = useMemo(
    () => buildCommunityPostShareCardData(post, categoryLabel),
    [post, categoryLabel]
  );

  const shareErrorMessage = safeT("community_share_toast_internal_error", {
    fallbackKo: "공유에 실패했어요. 다시 시도해 주세요.",
    fallbackEn: "Couldn't share. Please try again.",
  });

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current != null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast(message);
    toastTimerRef.current = window.setTimeout(() => {
      toastTimerRef.current = null;
      setToast(null);
    }, 3200);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current != null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const openSheet = useCallback(() => {
    setSheetOpen(true);
    logCommunityShareEvent("community_share_sheet_open", { postId: card.postId, result: "open" });
  }, [card.postId]);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
  }, []);

  const handleCopyLink = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    logCommunityShareEvent("community_share_copy_click", { postId: card.postId, platform: "copy" });
    try {
      const result = await copyTextToClipboard(card.canonicalUrl);
      if (result === "failed") {
        logCommunityShareEvent("community_share_error", { postId: card.postId, platform: "copy", result: "failed" });
        showToast(shareErrorMessage);
        return;
      }
      logCommunityShareEvent("community_share_success", { postId: card.postId, platform: "copy", result: "ok" });
      showToast(t("community_share_toast_copied"));
      closeSheet();
    } finally {
      setBusy(false);
    }
  }, [busy, card.canonicalUrl, card.postId, closeSheet, shareErrorMessage, showToast, t]);

  const handleNativeShare = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    logCommunityShareEvent("community_share_native_click", { postId: card.postId, platform: "native" });
    try {
      const payload = buildCommunityPostShareNativePayload(card);
      const outcome = await shareCommunityPostViaNative(payload);
      if (outcome === "cancelled") {
        logCommunityShareEvent("community_share_cancel", { postId: card.postId, platform: "native" });
        return;
      }
      if (outcome === "copied") {
        logCommunityShareEvent("community_share_fallback_copy", {
          postId: card.postId,
          platform: "native",
          result: "copied",
        });
        showToast(t("community_share_toast_native_fallback"));
        closeSheet();
        return;
      }
      if (outcome === "shared") {
        logCommunityShareEvent("community_share_success", { postId: card.postId, platform: "native", result: "ok" });
        closeSheet();
      } else {
        logCommunityShareEvent("community_share_error", { postId: card.postId, platform: "native", result: "failed" });
        showToast(shareErrorMessage);
      }
    } finally {
      setBusy(false);
    }
  }, [busy, card, closeSheet, shareErrorMessage, showToast, t]);

  return {
    sheetOpen,
    toast,
    busy,
    openSheet,
    closeSheet,
    handleCopyLink,
    handleNativeShare,
  };
}

export type UseCommunityPostShareReturn = ReturnType<typeof useCommunityPostShare>;
