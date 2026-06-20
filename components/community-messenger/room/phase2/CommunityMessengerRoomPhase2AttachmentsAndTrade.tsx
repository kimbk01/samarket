"use client";

import { Suspense } from "react";
import {
  CommunityMessengerTradeProcessSection,
  MessengerTradeChatRoomDetailPrefetch,
  SeedTradeChatDetailMemoryFromSnapshot,
} from "@/components/community-messenger/room/community-messenger-room-phase2-lazy";
import { useMessengerRoomPhase2View } from "@/components/community-messenger/room/phase2/messenger-room-phase2-view-context";
import { useMessengerUIStore } from "@/lib/community-messenger/stores/useMessengerUIStore";
import { useMatchMaxWidthMd } from "@/lib/ui/use-match-max-width";
import { CommunityMessengerRoomPhase2StoreOrderChrome } from "@/components/community-messenger/room/phase2/CommunityMessengerRoomPhase2StoreOrderChrome";

export function CommunityMessengerRoomPhase2AttachmentsAndTrade() {
  const vm = useMessengerRoomPhase2View();
  const composerFocused = useMessengerUIStore((s) => s.composerFocused);
  const isNarrowViewport = useMatchMaxWidthMd();
  const keyboardCompact = Boolean(isNarrowViewport && !vm.voiceRecording && composerFocused);

  return (
    <>
      <input
        ref={vm.imageInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={vm.onPickImageFile}
      />
      <input
        ref={vm.cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={vm.onPickImageFile}
      />
      <input ref={vm.fileInputRef} type="file" className="hidden" onChange={vm.onPickFile} />

      {vm.showMessengerStoreOrderDock ? (
        <CommunityMessengerRoomPhase2StoreOrderChrome keyboardCompact={keyboardCompact} />
      ) : null}

      {vm.showMessengerTradeProcessDock ? (
        <>
          {vm.snapshot.tradeChatRoomDetail ? (
            <SeedTradeChatDetailMemoryFromSnapshot
              productChatId={vm.tradeProductChatIdForDock}
              room={vm.snapshot.tradeChatRoomDetail}
            />
          ) : (
            <MessengerTradeChatRoomDetailPrefetch productChatId={vm.tradeProductChatIdForDock} />
          )}
          <Suspense fallback={null}>
            <CommunityMessengerTradeProcessSection
              productChatId={vm.tradeProductChatIdForDock}
              viewerUserId={vm.snapshot.viewerUserId}
              initialTradeChatRoom={vm.snapshot.tradeChatRoomDetail ?? null}
              onTradeMetaChanged={() => void vm.refresh(true)}
              keyboardCompact={keyboardCompact}
              dockPlacement="aboveComposer"
            />
          </Suspense>
        </>
      ) : null}
    </>
  );
}
