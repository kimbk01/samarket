"use strict";
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const phase2Main = path.join(root, "components/community-messenger/room/CommunityMessengerRoomPhase2.tsx");
const ex = path.join(root, "components/community-messenger/room/phase2/_extract");
const outDir = path.join(root, "components/community-messenger/room/phase2");
const destructurePath = path.join(outDir, "_view_destructure_block.txt");

function readChunk(name) {
  return fs.readFileSync(path.join(ex, `${name}.txt`), "utf8");
}

const fullDestructure = fs.readFileSync(destructurePath, "utf8");

const sharedImports = `"use client";

import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { communityMessengerRoomIsGloballyUsable } from "@/lib/community-messenger/types";
import { CM_CLUSTER_GAP_MS } from "@/lib/community-messenger/room/messenger-room-ui-constants";
import { describeManagementEvent } from "@/lib/community-messenger/room/describe-management-event";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { BOTTOM_NAV_STACK_ABOVE_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { useMessengerRoomUiStore } from "@/lib/community-messenger/stores/messenger-room-ui-store";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import {
  BackIcon,
  communityMessengerMemberAvatar,
  communityMessengerMessageSearchText,
  communityMessengerVoiceAudioSrc,
  extractHttpUrls,
  FileIcon,
  formatDuration,
  formatFileMeta,
  formatParticipantStatus,
  formatRoomCallStatus,
  formatTime,
  formatVoiceRecordTenThousandths,
  getLatestCallStubForSession,
  looksLikeDirectImageUrl,
  mergeRoomMessages,
  MicHoldIcon,
  MoreIcon,
  PlusIcon,
  SendPlaneIcon,
  SendVoiceArrowIcon,
  TrashVoiceIcon,
  VideoCallIcon,
  VoiceCallIcon,
  VoiceRecordingLiveWaveform,
  ViberChatBubble,
} from "@/components/community-messenger/room/community-messenger-room-helpers";
import {
  CommunityMessengerTradeProcessSection,
  GroupRoomCallOverlay,
  MessengerTradeChatRoomDetailPrefetch,
  SeedTradeChatDetailMemoryFromSnapshot,
  VoiceMessageBubble,
} from "@/components/community-messenger/room/community-messenger-room-phase2-lazy";
import { useMessengerRoomPhase2View } from "@/components/community-messenger/room/phase2/messenger-room-phase2-view-context";
`;

const headerFile =
  `"use client";

import { communityMessengerRoomIsGloballyUsable } from "@/lib/community-messenger/types";
import {
  BackIcon,
  MoreIcon,
  VideoCallIcon,
  VoiceCallIcon,
} from "@/components/community-messenger/room/community-messenger-room-helpers";
import { useMessengerRoomPhase2View } from "@/components/community-messenger/room/phase2/messenger-room-phase2-view-context";

export function CommunityMessengerRoomPhase2Header() {
  const {
    snapshot,
    router,
    t,
    isGroupRoom,
    roomHeaderStatus,
    roomUnavailable,
    outgoingDialLocked,
    setActiveSheet,
    startManagedDirectCall,
  } = useMessengerRoomPhase2View();
  return (
    <>
` +
  readChunk("header") +
  `
    </>
  );
}
`;

const attachmentsFile =
  `"use client";

import {
  CommunityMessengerTradeProcessSection,
  MessengerTradeChatRoomDetailPrefetch,
  SeedTradeChatDetailMemoryFromSnapshot,
} from "@/components/community-messenger/room/community-messenger-room-phase2-lazy";
import { useMessengerRoomPhase2View } from "@/components/community-messenger/room/phase2/messenger-room-phase2-view-context";

export function CommunityMessengerRoomPhase2AttachmentsAndTrade() {
  const {
    snapshot,
    imageInputRef,
    cameraInputRef,
    fileInputRef,
    onPickImageFile,
    onPickFile,
    showMessengerTradeProcessDock,
    tradeProductChatIdForDock,
    refresh,
  } = useMessengerRoomPhase2View();
  return (
    <>
` +
  readChunk("attachmentsTrade") +
  `
    </>
  );
}
`;

function wrapShared(exportFn, chunkName) {
  return (
    sharedImports +
    `
export function ${exportFn}() {
${fullDestructure}
  return (
    <>
${readChunk(chunkName)}
    </>
  );
}
`
  );
}

fs.writeFileSync(path.join(outDir, "CommunityMessengerRoomPhase2Header.tsx"), headerFile);
fs.writeFileSync(path.join(outDir, "CommunityMessengerRoomPhase2AttachmentsAndTrade.tsx"), attachmentsFile);
fs.writeFileSync(
  path.join(outDir, "CommunityMessengerRoomPhase2MessageTimeline.tsx"),
  wrapShared("CommunityMessengerRoomPhase2MessageTimeline", "timeline")
);
fs.writeFileSync(
  path.join(outDir, "CommunityMessengerRoomPhase2MessageOverlays.tsx"),
  wrapShared("CommunityMessengerRoomPhase2MessageOverlays", "messageOverlays")
);
fs.writeFileSync(
  path.join(outDir, "CommunityMessengerRoomPhase2Composer.tsx"),
  wrapShared("CommunityMessengerRoomPhase2Composer", "composer")
);
fs.writeFileSync(
  path.join(outDir, "CommunityMessengerRoomPhase2RoomSheets.tsx"),
  wrapShared("CommunityMessengerRoomPhase2RoomSheets", "roomSheets")
);
fs.writeFileSync(
  path.join(outDir, "CommunityMessengerRoomPhase2MemberActionModal.tsx"),
  wrapShared("CommunityMessengerRoomPhase2MemberActionModal", "memberModal")
);
fs.writeFileSync(
  path.join(outDir, "CommunityMessengerRoomPhase2CallLayer.tsx"),
  wrapShared("CommunityMessengerRoomPhase2CallLayer", "callLayer")
);

const newMain = `"use client";

import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import type { MessengerRoomPhase2ViewModel } from "@/lib/community-messenger/room/phase2/messenger-room-phase2-view-model";
import { useMessengerRoomPhase2Controller } from "@/lib/community-messenger/room/phase2";
import { MessengerRoomPhase2ViewProvider } from "@/components/community-messenger/room/phase2/messenger-room-phase2-view-context";
import { CommunityMessengerRoomPhase2Header } from "@/components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Header";
import { CommunityMessengerRoomPhase2AttachmentsAndTrade } from "@/components/community-messenger/room/phase2/CommunityMessengerRoomPhase2AttachmentsAndTrade";
import { CommunityMessengerRoomPhase2MessageTimeline } from "@/components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageTimeline";
import { CommunityMessengerRoomPhase2MessageOverlays } from "@/components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageOverlays";
import { CommunityMessengerRoomPhase2Composer } from "@/components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Composer";
import { CommunityMessengerRoomPhase2RoomSheets } from "@/components/community-messenger/room/phase2/CommunityMessengerRoomPhase2RoomSheets";
import { CommunityMessengerRoomPhase2MemberActionModal } from "@/components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MemberActionModal";
import { CommunityMessengerRoomPhase2CallLayer } from "@/components/community-messenger/room/phase2/CommunityMessengerRoomPhase2CallLayer";

export function CommunityMessengerRoomClientPhase2() {
  const room = useMessengerRoomPhase2Controller();

  if (room.loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4 text-[14px] text-ui-muted">
        채팅방을 불러오는 중입니다.
      </div>
    );
  }

  if (!room.snapshot) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-[16px] font-semibold text-ui-fg">채팅방을 찾을 수 없습니다.</p>
        <button
          type="button"
          onClick={() => room.router.replace("/community-messenger?section=chats")}
          className="rounded-ui-rect bg-ui-fg px-4 py-3 text-[14px] font-semibold text-ui-surface"
        >
          {room.t("nav_messenger_home")}
        </button>
      </div>
    );
  }

  const view: MessengerRoomPhase2ViewModel = {
    ...room,
    snapshot: room.snapshot as CommunityMessengerRoomSnapshot,
  };

  return (
    <MessengerRoomPhase2ViewProvider value={view}>
      <div
        data-messenger-shell
        data-cm-room
        className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--cm-room-page-bg)] text-[color:var(--cm-room-text)]"
      >
        <CommunityMessengerRoomPhase2Header />
        <CommunityMessengerRoomPhase2AttachmentsAndTrade />
        <CommunityMessengerRoomPhase2MessageTimeline />
        <CommunityMessengerRoomPhase2MessageOverlays />
        <CommunityMessengerRoomPhase2Composer />
        <CommunityMessengerRoomPhase2RoomSheets />
        <CommunityMessengerRoomPhase2MemberActionModal />
        <CommunityMessengerRoomPhase2CallLayer />
      </div>
    </MessengerRoomPhase2ViewProvider>
  );
}
`;

fs.writeFileSync(phase2Main, newMain);
console.log("generated view split");
