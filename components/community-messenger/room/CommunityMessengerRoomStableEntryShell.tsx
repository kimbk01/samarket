"use client";

import dynamic from "next/dynamic";
import { memo, useLayoutEffect } from "react";
import { useParams } from "next/navigation";
import { useMatchMaxWidthMd } from "@/lib/ui/use-match-max-width";
import { CommunityMessengerRoomShellChromeFrame } from "@/components/community-messenger/room/CommunityMessengerRoomShellChromeFrame";
import { useMessengerRoomEntryHeaderSeed } from "@/lib/community-messenger/room/use-messenger-room-entry-header-seed";

const CommunityMessengerRoomPass1ComposerShell = dynamic(
  () =>
    import("@/components/community-messenger/room/CommunityMessengerRoomPass1ComposerShell").then(
      (m) => m.CommunityMessengerRoomPass1ComposerShell
    ),
  { ssr: false, loading: () => null }
);
import {
  noteCmRoomEntryShellFirstPaint,
  noteCmRoomStableShellPainted,
} from "@/lib/community-messenger/room/cm-room-entry-shell-first-pass";
import {
  noteR2M11SegmentLoadingFallbackVisible,
  noteR2M11SuspenseRelease,
} from "@/lib/community-messenger/room/cm-room-r2-m11-suspense-release";
import { noteR2M11BSuspenseRelease } from "@/lib/community-messenger/room/cm-room-r2-m11b-breakdown";
import { noteR2M11DRoomSuspenseRelease } from "@/lib/community-messenger/room/cm-room-r2-m11d-prefetch-flight";

/** BN13-rsc 3차 — segment·page entry·pass1 단일 stable shell (chrome frame only). */
export type CommunityMessengerRoomStableEntryShellVariant = "segment" | "entry" | "pass1";

export const CommunityMessengerRoomStableEntryShell = memo(function CommunityMessengerRoomStableEntryShell({
  roomId,
  narrowViewport: narrowViewportProp,
  variant = "segment",
  recordShellPaint = true,
  composerEntryVisible = false,
}: {
  roomId?: string;
  narrowViewport?: boolean;
  variant?: CommunityMessengerRoomStableEntryShellVariant;
  recordShellPaint?: boolean;
  composerEntryVisible?: boolean;
}) {
  const params = useParams();
  const resolvedRoomId = roomId?.trim() || String(params?.roomId ?? "").trim();
  const headerSeed = useMessengerRoomEntryHeaderSeed(resolvedRoomId);
  const narrowViewportFromHook = useMatchMaxWidthMd();
  const narrowViewport = narrowViewportProp ?? narrowViewportFromHook;
  const includePass1Milestone = variant === "entry" || variant === "pass1";

  useLayoutEffect(() => {
    if (variant === "segment" || variant === "entry") {
      noteR2M11SegmentLoadingFallbackVisible();
    }
    const rid = resolvedRoomId;
    if (!rid) return;
    if (recordShellPaint) {
      noteCmRoomEntryShellFirstPaint(rid);
      noteCmRoomStableShellPainted(rid);
    }
    if (includePass1Milestone) {
      noteR2M11SuspenseRelease(rid);
      noteR2M11BSuspenseRelease(rid);
      noteR2M11DRoomSuspenseRelease(rid);
    }
  }, [includePass1Milestone, recordShellPaint, resolvedRoomId, variant]);

  const dataAttrs: Record<string, string> = {
    "data-messenger-shell": "",
    "data-cm-room": "",
    "data-cm-room-route-entry-shell": "",
  };
  if (includePass1Milestone) {
    dataAttrs["data-cm-room-pass1-stable-shell"] = "";
  }

  return (
    <CommunityMessengerRoomShellChromeFrame
      narrowViewport={narrowViewport}
      screenReaderHidden={false}
      headerSeed={headerSeed}
      dataAttrs={dataAttrs}
      footerSlot={
        composerEntryVisible ? (
          <CommunityMessengerRoomPass1ComposerShell composerEntryVisible={composerEntryVisible} />
        ) : undefined
      }
    />
  );
});
