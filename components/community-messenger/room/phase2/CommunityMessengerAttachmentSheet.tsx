"use client";

import {
  readMessengerSendAsAlbumPreference,
  writeMessengerSendAsAlbumPreference,
} from "@/lib/community-messenger/attachment/messenger-send-as-album-preference";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { Camera, Gift, Image as ImageIcon } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import {
  resolveMessengerAttachmentCapabilities,
  type MessengerAttachmentActionId,
} from "@/lib/community-messenger/attachment/attachment-action-capability";
import {
  listMessengerAttachmentRecent,
  mergeAttachmentSelectedIds,
  MESSENGER_ATTACHMENT_ALBUM_PICK_MAX,
  MESSENGER_ATTACHMENT_NATIVE_RECENT_LIMIT,
  messengerAttachmentDeviceLibrarySupported,
  rememberMessengerAttachmentRecent,
  takeFilesWithinAttachmentSelectionBudget,
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
  onDismiss: () => void;
  /**
   * `individually` — '묶어 보내기' OFF: 컨트롤러가 한 장씩 별도 메시지로 보내며 한 장 실패가 나머지를
   * 막지 않고 끝에 요약을 알린다(C-3, 루프 단일 구현은 컨트롤러).
   */
  onSendImages: (files: File[], previewUrls: string[], opts?: { individually?: boolean }) => Promise<void> | void;
  onOpenGift: () => void;
  onGiftFriendRequired: () => void;
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
  onDismiss,
  onSendImages,
  onOpenGift,
  onGiftFriendRequired,
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
  /** 여러 장 선택 시 묶어 보내기(앨범 1건) / 한 장씩 따로 보내기 — 마지막 선택을 기기에 기억 */
  const [sendAsAlbum, setSendAsAlbum] = useState<boolean>(() => readMessengerSendAsAlbumPreference());
  const toggleSendAsAlbum = useCallback(() => {
    setSendAsAlbum((prev) => {
      const next = !prev;
      writeMessengerSendAsAlbumPreference(next);
      return next;
    });
  }, []);
  const selectedIdsRef = useRef<string[]>([]);
  selectedIdsRef.current = selectedIds;

  const outboundBusy = isMessengerComposerOutboundBusy(busy) || busy === "send-image";
  const uploadBlocked = roomUnavailable || !canUploadAttachments || outboundBusy || sending;

  const notifyAlbumPickMax = useCallback(() => {
    showMessengerSnackbar(t("cm_ui_album_pick_max", { count: MESSENGER_ATTACHMENT_ALBUM_PICK_MAX }), {
      variant: "error",
    });
  }, [t]);

  /** Native decode failures (iCloud-only / HEIC / OOM) are reported, never silently dropped. */
  const notifyPhotoLoadFailed = useCallback(
    (count: number) => {
      if (count <= 0) return;
      showMessengerSnackbar(t("cm_ui_attach_photo_partial_failed", { count }), { variant: "error" });
    },
    [t]
  );

  const giftVisible =
    !isGroupRoom && roomChatDomain === "general_direct" && Boolean(peerUserId.trim());
  const giftEligible = giftVisible && peerIsFriend && !roomUnavailable;

  const caps = useMemo(
    () =>
      resolveMessengerAttachmentCapabilities({
        isGroupRoom,
        roomChatDomain,
        peerUserId,
        giftVisible,
      }),
    [giftVisible, isGroupRoom, peerUserId, roomChatDomain]
  );

  useEffect(() => {
    setRecent(listMessengerAttachmentRecent());
    setNativeRecent([]);
    setPhotoPermissionState("unavailable");
    setSelectedIds([]);
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

  /** Gallery / native / camera → selection only (explicit Send via onSendSelected). */
  const commitPickedFilesToSelection = useCallback(
    (picked: File[]) => {
      if (picked.length === 0 || uploadBlocked) return;
      const { accepted, overflow } = takeFilesWithinAttachmentSelectionBudget(
        selectedIdsRef.current.length,
        picked,
        MESSENGER_ATTACHMENT_ALBUM_PICK_MAX
      );
      if (overflow) notifyAlbumPickMax();
      if (accepted.length === 0) return;
      const added = rememberMessengerAttachmentRecent(accepted);
      refreshRecent();
      setSelectedIds((prev) =>
        mergeAttachmentSelectedIds(
          prev,
          added.map((item) => item.id),
          MESSENGER_ATTACHMENT_ALBUM_PICK_MAX
        )
      );
    },
    [notifyAlbumPickMax, refreshRecent, uploadBlocked]
  );

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
      const { photos: payloads, failed } = await resolveMessengerPhotoLibraryPhotos(nativeIds);
      notifyPhotoLoadFailed(failed.length);
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
      if (sendAsAlbum || files.length === 1) {
        await onSendImages(files, previewUrls);
      } else {
        /** 개별 전송 — 선택 순서대로 한 장씩 별도 메시지(각자 clientMessageId). 실패해도 나머지 계속. */
        await onSendImages(files, previewUrls, { individually: true });
      }
      setSelectedIds([]);
      onDismiss();
    } finally {
      sendingLockRef.current = false;
      setSending(false);
    }
  }, [notifyPhotoLoadFailed, onDismiss, onSendImages, selectedIds, sendAsAlbum, stripItems, uploadBlocked]);

  const onGalleryChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const picked = Array.from(event.target.files ?? []).filter((f) => f.type.startsWith("image/"));
      event.target.value = "";
      commitPickedFilesToSelection(picked);
    },
    [commitPickedFilesToSelection]
  );

  const onNativePhotoPick = useCallback(async () => {
    if (uploadBlocked || sendingLockRef.current) return;
    const { photos: payloads, failed } = await pickMessengerPhotoLibraryPhotos(
      MESSENGER_ATTACHMENT_ALBUM_PICK_MAX
    );
    notifyPhotoLoadFailed(failed.length);
    if (payloads.length === 0) return;
    const files = payloads.map((payload, index) => messengerPhotoPayloadToFile(payload, index));
    commitPickedFilesToSelection(files);
  }, [commitPickedFilesToSelection, notifyPhotoLoadFailed, uploadBlocked]);

  const onCameraChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const picked = Array.from(event.target.files ?? []).filter((f) => f.type.startsWith("image/"));
      event.target.value = "";
      commitPickedFilesToSelection(picked.slice(0, 1));
    },
    [commitPickedFilesToSelection]
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
      }
    },
    [
      giftEligible,
      onGiftFriendRequired,
      onOpenGift,
      onNativePhotoPick,
      outboundBusy,
      roomUnavailable,
      sending,
      uploadBlocked,
    ]
  );

  const actionLabel = (id: MessengerAttachmentActionId): string => {
    if (id === "photo") return t("cm_ui_attach_photo");
    return safeT("gift_u3_wallet_send", { fallbackKo: "선물하기", fallbackEn: "Send gift" });
  };

  const actionIcon = (id: MessengerAttachmentActionId) => {
    const cls = "h-6 w-6 shrink-0 text-[color:var(--overlay-primary)]";
    if (id === "photo") return <ImageIcon className={cls} strokeWidth={1.75} aria-hidden />;
    return <Gift className={cls} strokeWidth={1.75} aria-hidden />;
  };

  const deviceLibrary = messengerAttachmentDeviceLibrarySupported();
  const showPermissionHint =
    deviceLibrary && (photoPermissionState === "denied" || photoPermissionState === "unavailable");
  const sendEnabled = selectedIds.length >= 1 && !uploadBlocked && !sending;

  return (
    <div
      className="flex w-full flex-col bg-[color:var(--overlay-surface)] pb-[max(0.75rem,var(--safe-bottom))]"
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
        <span className="h-1 w-10 rounded-full bg-[color:var(--overlay-border)]" />
      </div>

      <div className="flex items-center justify-between gap-3 px-4 pb-2">
        <p className="text-[length:var(--overlay-body-1-size)] font-semibold text-[color:var(--overlay-text-primary)]">{t("cm_ui_attach_recent_photos")}</p>
        <button
          type="button"
          disabled={!sendEnabled}
          onClick={() => void onSendSelected()}
          className="min-h-[40px] min-w-[56px] rounded-full px-3 text-[length:var(--overlay-body-1-size)] font-semibold text-[color:var(--overlay-primary)] transition-colors enabled:active:bg-[color:var(--overlay-secondary)] disabled:cursor-not-allowed disabled:text-[color:var(--overlay-text-secondary)]"
        >
          {t("common_send")}
        </button>
      </div>

      {selectedIds.length > 1 ? (
        <div className="flex items-center justify-between gap-3 px-4 pb-2">
          <span className="min-w-0 text-[length:var(--overlay-body-2-size)] text-[color:var(--overlay-text-secondary)]">
            {sendAsAlbum
              ? t("cm_ui_send_as_album_hint_on", { count: selectedIds.length })
              : t("cm_ui_send_as_album_hint_off", { count: selectedIds.length })}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={sendAsAlbum}
            onClick={toggleSendAsAlbum}
            disabled={sending}
            className="group flex shrink-0 items-center gap-2 text-[length:var(--overlay-body-2-size)] font-medium text-[color:var(--overlay-text-primary)] disabled:cursor-not-allowed disabled:text-[color:var(--overlay-text-secondary)]"
          >
            {t("cm_ui_send_as_album")}
            <span
              className={`relative inline-block h-6 w-10 rounded-full transition-colors group-disabled:bg-[color:var(--sm-color-primary-disabled)] ${
                sendAsAlbum ? "bg-[color:var(--overlay-primary)]" : "bg-[color:var(--overlay-border)]"
              }`}
              aria-hidden
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-[color:var(--overlay-surface)] shadow transition-transform ${
                  sendAsAlbum ? "translate-x-[18px]" : "translate-x-0.5"
                }`}
              />
            </span>
          </button>
        </div>
      ) : null}

      <div className="px-4 pb-3">
        <div className="-mx-1 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            disabled={uploadBlocked}
            onClick={() => cameraInputRef.current?.click()}
            className="relative flex h-[88px] w-[88px] shrink-0 flex-col items-center justify-center gap-1 rounded-[length:var(--overlay-radius-md)] bg-[color:var(--overlay-secondary)] text-[color:var(--overlay-text-primary)] transition-transform enabled:active:scale-[var(--overlay-press-scale)] disabled:cursor-not-allowed disabled:bg-[color:var(--sm-color-primary-disabled)] disabled:text-[color:var(--overlay-text-secondary)]"
            aria-label={t("cm_ui_camera")}
          >
            <Camera className="h-7 w-7" strokeWidth={1.75} aria-hidden />
            <span className="text-[length:var(--overlay-caption-size)] font-medium">{t("cm_ui_camera")}</span>
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
                className="relative h-[88px] w-[88px] shrink-0 overflow-hidden rounded-[length:var(--overlay-radius-md)] bg-[color:var(--overlay-secondary)] transition-transform enabled:active:scale-[var(--overlay-press-scale)] disabled:cursor-not-allowed disabled:grayscale"
                aria-label={t("cm_ui_attach_recent_photos")}
                aria-pressed={selected}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
                <span
                  className={`absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-[length:var(--overlay-caption-size)] font-bold ${
                    selected
                      ? "bg-[color:var(--overlay-primary)] text-[color:var(--overlay-surface)]"
                      : "border-2 border-[color:var(--overlay-surface)] bg-black/20 text-transparent"
                  }`}
                  aria-hidden
                >
                  {selected ? order : ""}
                </span>
              </button>
            );
          })}

          {showPermissionHint ? (
            <div className="flex h-[88px] min-w-[180px] shrink-0 items-center rounded-[length:var(--overlay-radius-md)] px-2">
              <p className="text-[length:var(--overlay-caption-size)] leading-snug text-[color:var(--overlay-text-secondary)]">
                {t("cm_ui_attach_photo_permission_hint")}
              </p>
            </div>
          ) : null}

          {stripItems.length === 0 && !showPermissionHint ? (
            <div className="flex h-[88px] min-w-[140px] shrink-0 items-center rounded-[length:var(--overlay-radius-md)] px-2">
              <p className="text-[length:var(--overlay-caption-size)] leading-snug text-[color:var(--overlay-text-secondary)]">{t("cm_ui_attach_recent_empty")}</p>
            </div>
          ) : null}
        </div>
      </div>

      <nav className="flex flex-col border-t border-[color:var(--overlay-border)]" aria-label={t("common_attach")}>
        {caps.actions.map((actionId) => (
          <button
            key={actionId}
            type="button"
            onClick={() => onAction(actionId)}
            disabled={
              roomUnavailable ||
              outboundBusy ||
              sending ||
              (actionId === "photo" && uploadBlocked)
            }
            className="dibay-overlay-popover__item"
          >
            {actionIcon(actionId)}
            <span>{actionLabel(actionId)}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
