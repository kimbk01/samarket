"use client";

import {
  CommunityMessengerTradeProcessSection,
  MessengerTradeChatRoomDetailPrefetch,
  SeedTradeChatDetailMemoryFromSnapshot,
} from "@/components/community-messenger/room/community-messenger-room-phase2-lazy";
import { useMessengerRoomPhase2View } from "@/components/community-messenger/room/phase2/messenger-room-phase2-view-context";

export function CommunityMessengerRoomPhase2AttachmentsAndTrade() {
  const vm = useMessengerRoomPhase2View();
  return (
    <>
      <input
        ref={vm.imageInputRef}
        type="file"
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
          <CommunityMessengerTradeProcessSection
            productChatId={vm.tradeProductChatIdForDock}
            viewerUserId={vm.snapshot.viewerUserId}
            initialTradeChatRoom={vm.snapshot.tradeChatRoomDetail ?? null}
            onTradeMetaChanged={() => void vm.refresh(true)}
          />
        </>
      ) : null}
    </>
  );
}
