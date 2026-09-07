"use client";

import type { MessageKey } from "@/lib/i18n/messages";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { Camera, Gift, Image as ImageIcon, MapPin, Phone } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import {
  resolveMessengerAttachmentCapabilities,
  type MessengerAttachmentActionId,
} from "@/lib/community-messenger/attachment/attachment-action-capability";
import {
  listMessengerAttachmentRecent,
  MESSENGER_ATTACHMENT_ALBUM_PICK_MAX,
  MESSENGER_ATTACHMENT_NATIVE_RECENT_LIMIT,
  messengerAttachmentDeviceLibrarySupported,
  rememberMessengerAttachmentRecent,
  type MessengerAttachmentRecentItem,
} from "@/lib/community-messenger/attachment/messenger-attachment-recent-store";
import {
  getPermissionState as getMessengerPhotoLibraryPermissionState,
  getRecentPhotos as getMessengerPhotoLibraryRecentPhotos,
  messengerPhotoPayloadToFile,
  pickPhotos as pickMessengerPhotoLibraryPhotos,
  requestPermission as requestMessengerPhotoLibraryPermission,
  resolvePhotos as resolveMessengerPhotoLibraryPhotos,
  type MessengerPhotoLibraryPermissionState,
  type MessengerPhotoLibraryRecentPhoto,
} from "@/lib/community-messenger/attachment/messenger-photo-library";
import { isMessengerComposerOutboundBusy } from "@/lib/community-messenger/room/messenger-composer-outbound-busy";

export type CommunityMessengerAttachmentSheetProps = {
  roomUnavailable: boolean;
  busy: string | null;
  canUploadAttachments: boolean;
  isGroupRoom: boolean;
  roomChatDomain: string;
  peerUserId: string;
  peerIsFriend: boolean;
  canStartGroupCall: boolean;
  canStartDirectCall: boolean;
  onDismiss: () => void;
  onSendImages: (files: File[], previewUrls: string[]) => Promise<void> | void;
  onOpenGift: () => void;
  onGiftFriendRequired: () => void;
  onCallVoice: () => void;
  onCallVideo: () => void;
  onSendLocation: () => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
};

function toggleSelectionOrder(prev: string[], id: string, max: number): string[] {
  const idx = prev.indexOf(id);
  if (idx >= 0) return prev.filter((x) => x !== id);
  if (prev.length >= max) return prev;
  return [...prev, id];
}

type AttachmentStripItem =
  | {
      id: string;
      kind: "session";
      previewUrl: string;
      file: File;
    }
  | {
      id: string;
      kind: "native";
      previewUrl: string;
      nativeId: string;
    };

export function CommunityMessengerAttachmentSheet({
  roomUnavailable,
  busy,
  canUploadAttachments,
  isGroupRoom,
  roomChatDomain,
  peerUserId,
  peerIsFriend,
  canStartGroupCall,
  canStartDirectCall,
  onDismiss,
  onSendImages,
  onOpenGift,
  onGiftFriendRequired,
  onCallVoice,
  onCallVideo,
  onSendLocation,
  t,
}: CommunityMessengerAttachmentSheetProps) {
  const { safeT } = useI18n();
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const sendingLockRef = useRef(false);
  const [recent, setRecent] = useState<MessengerAttachmentRecentItem[]>([]);
  const [nativeRecent, setNativeRecent] = useState<MessengerPhotoLibraryRecentPhoto[]>([]);
  const [photoPermissionState, setPhotoPermissionState] =
    useState<MessengerPhotoLibraryPermissionState>("unavailable");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [callChooserOpen, setCallChooserOpen] = useState(false);

  const outboundBusy = isMessengerComposerOutboundBusy(busy) || busy === "send-image";
  const uploadBlocked = roomUnavailable || !canUploadAttachments || outboundBusy || sending;

  const giftVisible =
    !isGroupRoom && roomChatDomain === "general_direct" && Boolean(peerUserId.trim());
  const giftEligible = giftVisible && peerIsFriend && !roomUnavailable;
  const callVisible = isGroupRoom ? canStartGroupCall : canStartDirectCall;

  const caps = useMemo(
    () =>
      resolveMessengerAttachmentCapabilities({
        isGroupRoom,
        roomChatDomain,
        peerUserId,
        giftVisible,
        callVisible,
      }),
    [callVisible, giftVisible, isGroupRoom, peerUserId, roomChatDomain]
  );

  useEffect(() => {
    setRecent(listMessengerAttachmentRecent());
    setNativeRecent([]);
    setPhotoPermissionState("unavailable");
    setSelectedIds([]);
    setCallChooserOpen(false);
    sendingLockRef.current = false;
    setSending(false);

    let cancelled = false;
    async function loadNativeRecent() {
      if (!messengerAttachmentDeviceLibrarySupported()) return;
      let state = await getMessengerPhotoLibraryPermissionState();
      if (cancelled) return;
      if (state === "prompt") {
        state = await requestMessengerPhotoLibraryPermission();
        if (cancelled) return;
      }
      setPhotoPermissionState(state);
      if (state !== "authorized" && state !== "limited") return;
      const result = await getMessengerPhotoLibraryRecentPhotos(MESSENGER_ATTACHMENT_NATIVE_RECENT_LIMIT);
      if (cancelled) return;
      setPhotoPermissionState(result.state);
      setNativeRecent(result.photos);
    }

    void loadNativeRecent();
    return () => {
      cancelled = true;
    };
  }, []);

  const stripItems = useMemo<AttachmentStripItem[]>(() => {
    const sessionItems: AttachmentStripItem[] = recent.map((item) => ({
      id: item.id,
      kind: "session",
      previewUrl: item.previewUrl,
      file: item.file,
    }));
    const nativeItems: AttachmentStripItem[] = nativeRecent.map((item) => ({
      id: `native:${item.id}`,
      kind: "native",
      previewUrl: item.thumbnailDataUrl,
      nativeId: item.id,
    }));
    return [...sessionItems, ...nativeItems];
  }, [nativeRecent, recent]);

  const selectedOrderIndex = useMemo(() => {
    const map = new Map<string, number>();
    selectedIds.forEach((id, i) => map.set(id, i + 1));
    return map;
  }, [selectedIds]);

  const refreshRecent = useCallback(() => {
    setRecent(listMessengerAttachmentRecent());
  }, []);

  const onToggleRecent = useCallback(
    (id: string) => {
      if (uploadBlocked) return;
      setSelectedIds((prev) => {
        if (prev.indexOf(id) < 0 && prev.length >= MESSENGER_ATTACHMENT_ALBUM_PICK_MAX) {
          showMessengerSnackbar(
            t("cm_ui_album_pick_max", { count: MESSENGER_ATTACHMENT_ALBUM_PICK_MAX }),
            { variant: "error" }
          );
          return prev;
        }
        return toggleSelectionOrder(prev, id, MESSENGER_ATTACHMENT_ALBUM_PICK_MAX);
      });
    },
    [t, uploadBlocked]
  );

  const onSendSelected = useCallback(async () => {
    if (sendingLockRef.current || selectedIds.length === 0 || uploadBlocked) return;
    sendingLockRef.current = true;
    setSending(true);
    const byId = new Map(stripItems.map((item) => [item.id, item]));
    const files: File[] = [];
    const previewUrls: string[] = [];
    const nativeIds: string[] = [];
    for (const id of selectedIds) {
      const item = byId.get(id);
      if (!item) continue;
      if (item.kind === "session") {
        files.push(item.file);
        previewUrls.push(item.previewUrl);
      } else {
        nativeIds.push(item.nativeId);
      }
    }
    if (nativeIds.length > 0) {
      const payloads = await resolveMessengerPhotoLibraryPhotos(nativeIds);
      payloads.forEach((payload, index) => {
        const file = messengerPhotoPayloadToFile(payload, files.length + index);
        files.push(file);
        previewUrls.push(URL.createObjectURL(file));
      });
    }
    if (files.length === 0) {
      sendingLockRef.current = false;
      setSending(false);
      return;
    }
    try {
      await onSendImages(files, previewUrls);
      setSelectedIds([]);
      onDismiss();
    } finally {
      sendingLockRef.current = false;
      setSending(false);
    }
  }, [onDismiss, onSendImages, selectedIds, stripItems, uploadBlocked]);

  const onGalleryChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const picked = Array.from(event.target.files ?? []).filter((f) => f.type.startsWith("image/"));
      event.target.value = "";
      if (picked.length === 0 || uploadBlocked || sendingLockRef.current) return;
      const files = picked.slice(0, MESSENGER_ATTACHMENT_ALBUM_PICK_MAX);
      if (picked.length > MESSENGER_ATTACHMENT_ALBUM_PICK_MAX) {
        showMessengerSnackbar(t("cm_ui_album_pick_max", { count: MESSENGER_ATTACHMENT_ALBUM_PICK_MAX }), {
          variant: "error",
        });
      }
      rememberMessengerAttachmentRecent(files);
      refreshRecent();
      const previewUrls = files.map((f) => URL.createObjectURL(f));
      sendingLockRef.current = true;
      setSending(true);
      try {
        await onSendImages(files, previewUrls);
        onDismiss();
      } finally {
        sendingLockRef.current = false;
        setSending(false);
      }
    },
    [onDismiss, onSendImages, refreshRecent, t, uploadBlocked]
  );

  const onNativePhotoPick = useCallback(async () => {
    if (uploadBlocked || sendingLockRef.current) return;
    sendingLockRef.current = true;
    setSending(true);
    try {
      const payloads = await pickMessengerPhotoLibraryPhotos(MESSENGER_ATTACHMENT_ALBUM_PICK_MAX);
      if (payloads.length === 0) return;
      const files = payloads.map((payload, index) => messengerPhotoPayloadToFile(payload, index));
      const previewUrls = files.map((file) => URL.createObjectURL(file));
      await onSendImages(files, previewUrls);
      onDismiss();
    } finally {
      sendingLockRef.current = false;
      setSending(false);
    }
  }, [onDismiss, onSendImages, uploadBlocked]);

  const onCameraChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const picked = Array.from(event.target.files ?? []).filter((f) => f.type.startsWith("image/"));
      event.target.value = "";
      if (picked.length === 0 || uploadBlocked) return;
      const added = rememberMessengerAttachmentRecent(picked.slice(0, 1));
      refreshRecent();
      if (added[0]) {
        setSelectedIds((prev) => {
          const id = added[0]!.id;
          const without = prev.filter((x) => x !== id);
          if (without.length >= MESSENGER_ATTACHMENT_ALBUM_PICK_MAX) return prev;
          return [...without, id];
        });
      }
    },
    [refreshRecent, uploadBlocked]
  );

  const onAction = useCallback(
    (id: MessengerAttachmentActionId) => {
      if (roomUnavailable || outboundBusy || sending) return;
      if (id === "photo") {
        if (uploadBlocked) return;
        if (messengerAttachmentDeviceLibrarySupported()) {
          void onNativePhotoPick();
          return;
        }
        galleryInputRef.current?.click();
        return;
      }
      if (id === "gift") {
        if (!giftEligible) {
          onGiftFriendRequired();
          return;
        }
        onOpenGift();
        return;
      }
      if (id === "call") {
        setCallChooserOpen((v) => !v);
        return;
      }
      if (id === "map") {
        onSendLocation();
      }
    },
    [
      giftEligible,
      onGiftFriendRequired,
      onOpenGift,
      onSendLocation,
      onNativePhotoPick,
      outboundBusy,
      roomUnavailable,
      sending,
      uploadBlocked,
    ]
  );

  const actionLabel = (id: MessengerAttachmentActionId): string => {
    if (id === "photo") return t("cm_ui_attach_photo");
    if (id === "gift") {
      return safeT("gift_u3_wallet_send", { fallbackKo: "선물하기", fallbackEn: "Send gift" });
    }
    if (id === "call") return t("cm_ui_attach_call");
    return t("cm_ui_attach_map");
  };

  const actionIcon = (id: MessengerAttachmentActionId) => {
    const cls = "h-6 w-6 shrink-0 text-[color:var(--sam-brand,#085C3F)]";
    if (id === "photo") return <ImageIcon className={cls} strokeWidth={1.75} aria-hidden />;
    if (id === "gift") return <Gift className={cls} strokeWidth={1.75} aria-hidden />;
    if (id === "call") return <Phone className={cls} strokeWidth={1.75} aria-hidden />;
    return <MapPin className={cls} strokeWidth={1.75} aria-hidden />;
  };

  const deviceLibrary = messengerAttachmentDeviceLibrarySupported();
  const showPermissionHint =
    deviceLibrary && (photoPermissionState === "denied" || photoPermissionState === "unavailable");
  const sendEnabled = selectedIds.length >= 1 && !uploadBlocked && !sending;

  return (
    <div
      className="flex w-full flex-col bg-white pb-[max(0.75rem,var(--safe-bottom))]"
      data-cm-attachment-sheet="kakao-parity"
      data-cm-attachment-device-library={deviceLibrary ? "1" : "0"}
    >
      <input
        ref={galleryInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => void onGalleryChange(e)}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onCameraChange}
      />

      <div className="flex justify-center pb-2 pt-2" aria-hidden>
        <span className="h-1 w-10 rounded-full bg-[#D1D5DB]" />
      </div>

      <div className="flex items-center justify-between gap-3 px-4 pb-2">
        <p className="text-[15px] font-semibold text-[#191919]">{t("cm_ui_attach_recent_photos")}</p>
        <button
          type="button"
          disabled={!sendEnabled}
          onClick={() => void onSendSelected()}
          className="min-h-[40px] min-w-[56px] rounded-full px-3 text-[15px] font-semibold text-[color:var(--sam-brand,#085C3F)] disabled:text-[#B0B0B0]"
        >
          {t("common_send")}
        </button>
      </div>

      <div className="px-4 pb-3">
        <div className="-mx-1 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            disabled={uploadBlocked}
            onClick={() => cameraInputRef.current?.click()}
            className="relative flex h-[88px] w-[88px] shrink-0 flex-col items-center justify-center gap-1 rounded-[10px] bg-[#F3F4F6] text-[#191919] active:opacity-80 disabled:opacity-40"
            aria-label={t("cm_ui_camera")}
          >
            <Camera className="h-7 w-7" strokeWidth={1.75} aria-hidden />
            <span className="text-[11px] font-medium text-[#666]">{t("cm_ui_camera")}</span>
          </button>

          {stripItems.map((item) => {
            const order = selectedOrderIndex.get(item.id);
            const selected = typeof order === "number";
            return (
              <button
                key={item.id}
                type="button"
                disabled={uploadBlocked}
                onClick={() => onToggleRecent(item.id)}
                className="relative h-[88px] w-[88px] shrink-0 overflow-hidden rounded-[10px] bg-[#E5E7EB] active:opacity-90 disabled:opacity-40"
                aria-label={t("cm_ui_attach_recent_photos")}
                aria-pressed={selected}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
                <span
                  className={`absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold ${
                    selected
                      ? "bg-[color:var(--sam-brand,#085C3F)] text-white"
                      : "border-2 border-white bg-black/20 text-transparent"
                  }`}
                  aria-hidden
                >
                  {selected ? order : ""}
                </span>
              </button>
            );
          })}

          {showPermissionHint ? (
            <div className="flex h-[88px] min-w-[180px] shrink-0 items-center rounded-[10px] px-2">
              <p className="text-[12px] leading-snug text-[#888888]">
                {t("cm_ui_attach_photo_permission_hint")}
              </p>
            </div>
          ) : null}

          {stripItems.length === 0 && !showPermissionHint ? (
            <div className="flex h-[88px] min-w-[140px] shrink-0 items-center rounded-[10px] px-2">
              <p className="text-[12px] leading-snug text-[#888888]">{t("cm_ui_attach_recent_empty")}</p>
            </div>
          ) : null}
        </div>
      </div>

      <nav className="flex flex-col border-t border-[#ECECEC]" aria-label={t("common_attach")}>
        {caps.actions.map((actionId, index) => {
          const prev = caps.actions[index - 1];
          const showDivider =
            (actionId === "call" && (prev === "photo" || prev === "gift")) ||
            (actionId === "map" && (prev === "call" || prev === "gift" || prev === "photo"));
          return (
            <div key={actionId}>
              {showDivider ? <div className="mx-4 border-t border-[#ECECEC]" /> : null}
              <button
                type="button"
                onClick={() => onAction(actionId)}
                disabled={
                  roomUnavailable ||
                  outboundBusy ||
                  sending ||
                  (actionId === "photo" && uploadBlocked)
                }
                className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[16px] font-medium text-[#191919] active:bg-[#F5F5F5] disabled:opacity-40"
              >
                {actionIcon(actionId)}
                <span>{actionLabel(actionId)}</span>
              </button>
              {actionId === "call" && callChooserOpen ? (
                <div className="flex gap-2 px-4 pb-3">
                  <button
                    type="button"
                    className="min-h-[44px] flex-1 rounded-[10px] bg-[#F3F4F6] text-[14px] font-semibold text-[#191919] active:opacity-80"
                    onClick={() => {
                      setCallChooserOpen(false);
                      onCallVoice();
                    }}
                  >
                    {t("cm_ui_voice_call")}
                  </button>
                  <button
                    type="button"
                    className="min-h-[44px] flex-1 rounded-[10px] bg-[#F3F4F6] text-[14px] font-semibold text-[#191919] active:opacity-80"
                    onClick={() => {
                      setCallChooserOpen(false);
                      onCallVideo();
                    }}
                  >
                    {t("nav_video_call_label")}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
    </div>
  );
}
