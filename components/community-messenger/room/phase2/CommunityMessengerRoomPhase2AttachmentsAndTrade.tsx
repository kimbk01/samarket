"use client";

import {
  CommunityMessengerRoomPhase2StoreOrderChrome,
} from "@/components/community-messenger/room/phase2/CommunityMessengerRoomPhase2StoreOrderChrome";
import { useMessengerRoomPhase2View } from "@/components/community-messenger/room/phase2/messenger-room-phase2-view-context";
import { useMessengerUIStore } from "@/lib/community-messenger/stores/useMessengerUIStore";
import { useMatchMaxWidthMd } from "@/lib/ui/use-match-max-width";

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
      {/* accept 미지정: iOS 는 UTI 없는 확장자(.hwp 등)를 선택기에서 비활성화한다 — 허용 여부는 선택 직후 JS 사전 검사(messenger-file-upload-policy)로 판정 */}
      <input
        ref={vm.fileInputRef}
        type="file"
        className="hidden"
        onChange={vm.onPickFile}
      />

      {vm.showMessengerStoreOrderDock ? (
        <CommunityMessengerRoomPhase2StoreOrderChrome keyboardCompact={keyboardCompact} />
      ) : null}
    </>
  );
}
