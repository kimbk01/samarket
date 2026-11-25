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
import { Camera, Film, Gift, Image as ImageIcon, LayoutGrid, Plus } from "lucide-react";
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
import {
  isMessengerNativeRecentVideoSupported,
  isMessengerNativeVideoSupported,
  openMessengerAppSettings,
  pickPhotosAndVideos as pickMessengerPhotosAndVideos,
  presentMessengerLimitedPicker,
  registerMessengerNativeVideos,
  releaseMessengerNativeVideo,
} from "@/lib/community-messenger/attachment/messenger-photo-library";
import { isMessengerVideoFile, readMessengerWebVideo } from "@/lib/community-messenger/attachment/messenger-video-web";
import type { MessengerVideoSendSource } from "@/lib/community-messenger/upload/messenger-video-upload-client";
import {
  formatMessengerVideoDuration,
  MESSENGER_VIDEO_MAX_DURATION_MS,
  MESSENGER_VIDEO_WEB_ACCEPT,
  precheckMessengerVideo,
} from "@/lib/community-messenger/upload/messenger-video-upload-policy";
import { getMessengerRoomActionErrorMessage } from "@/lib/community-messenger/room/messenger-room-action-error-messages";

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
  /** 영상 — 1개 = 메시지 1건, 선택 순서대로. 넘긴 source 의 미리보기·네이티브 임시 파일 소유권은 받는 쪽으로 간다. */
  onSendVideos: (sources: MessengerVideoSendSource[]) => Promise<void> | void;
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
      /** 새 바이너리 최근 줄 영상(재감사 R3) */
      video?: boolean;
      durationMs?: number;
    }
  | {
      id: string;
      kind: "video";
      previewUrl: string;
      durationMs: number;
      source: MessengerVideoSendSource;
    };

/** 시트를 닫을 때 보내지 않은 영상의 미리보기·네이티브 임시 파일 해제 */
function releaseUnsentVideo(source: MessengerVideoSendSource): void {
  if (source.kind === "web") URL.revokeObjectURL(source.thumbUrl);
  else void releaseMessengerNativeVideo(source.picked.id);
}

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
  onSendVideos,
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
  /** 이번 시트에서 고른 영상(최근 줄 앞쪽). 보내면 소유권이 컨트롤러로 넘어가 목록에서 빠진다. */
  const [videoItems, setVideoItems] = useState<Extract<AttachmentStripItem, { kind: "video" }>[]>([]);
  const videoItemsRef = useRef(videoItems);
  videoItemsRef.current = videoItems;
  const videoInputRef = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      for (const item of videoItemsRef.current) releaseUnsentVideo(item.source);
    },
    []
  );
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

  const nativeLoadSeqRef = useRef(0);
  const reloadNativeRecent = useCallback(async () => {
    if (!messengerAttachmentDeviceLibrarySupported()) return;
    const seq = ++nativeLoadSeqRef.current;
    const state = await getMessengerPhotoLibraryPermissionState();
    if (seq !== nativeLoadSeqRef.current) return;
    setPhotoPermissionState(state);
    if (state !== "authorized" && state !== "limited") {
      setNativeRecent([]);
      return;
    }
    const result = await getMessengerPhotoLibraryRecentPhotos(MESSENGER_ATTACHMENT_NATIVE_RECENT_LIMIT, {
      includeVideos: isMessengerNativeRecentVideoSupported(),
    });
    if (seq !== nativeLoadSeqRef.current) return;
    setPhotoPermissionState(result.state);
    setNativeRecent(result.photos);
  }, []);

  /** 안내 칸 「허용」 — 이때만 시스템 권한 창(사진·영상 함께) */
  const onRequestMediaPermission = useCallback(async () => {
    await requestMessengerPhotoLibraryPermission();
    await reloadNativeRecent();
  }, [reloadNativeRecent]);

  /** 「설정에서 허용」 — 시스템이 더는 묻지 않을 때 */
  const onOpenMediaSettings = useCallback(() => {
    void openMessengerAppSettings();
  }, []);

  /** 제한된 접근 「더 고르기」 — iOS 선택 범위 편집 · Android 는 시스템 권한 창이 고르기 화면을 띄운다 */
  const onSelectMoreMedia = useCallback(async () => {
    const presented = await presentMessengerLimitedPicker();
    if (!presented) await requestMessengerPhotoLibraryPermission();
    await reloadNativeRecent();
  }, [reloadNativeRecent]);

  useEffect(() => {
    setRecent(listMessengerAttachmentRecent());
    setNativeRecent([]);
    setPhotoPermissionState("unavailable");
    setSelectedIds([]);
    sendingLockRef.current = false;
    setSending(false);

    /**
     * 재감사 R2 (텔레그램 `ChatAttachAlertPhotoLayout` 930–939 와 같음): 시트를 열 때 권한을 **요청하지 않는다**.
     * 상태만 읽고, 허용(전체·제한)이면 최근 사진·영상을 불러온다. 요청은 안내 칸의 「허용」을 누를 때만.
     */
    void reloadNativeRecent();
    /** 「설정에서 허용」 뒤 돌아오면 상태를 다시 읽는다 */
    const onVisible = () => {
      if (document.visibilityState === "visible") void reloadNativeRecent();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      nativeLoadSeqRef.current += 1;
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      ...(item.mediaType === "video" ? { video: true, durationMs: Number(item.durationMs) || 0 } : {}),
    }));
    return [...videoItems, ...sessionItems, ...nativeItems];
  }, [nativeRecent, recent, videoItems]);
  const stripItemsRef = useRef(stripItems);
  stripItemsRef.current = stripItems;

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

  const notifyVideoError = useCallback(
    (error: string) => {
      showMessengerSnackbar(getMessengerRoomActionErrorMessage(error, t), { variant: "error" });
    },
    [t]
  );

  /** 고른 영상 → 선택 줄에 추가하고 선택(보내기는 「보내기」 버튼). 상한 넘으면 해제하고 안내. */
  const commitVideosToSelection = useCallback(
    (sources: MessengerVideoSendSource[]) => {
      if (sources.length === 0) return;
      const room = MESSENGER_ATTACHMENT_ALBUM_PICK_MAX - selectedIdsRef.current.length;
      const accepted = sources.slice(0, Math.max(0, room));
      for (const src of sources.slice(accepted.length)) releaseUnsentVideo(src);
      if (accepted.length < sources.length) notifyAlbumPickMax();
      if (accepted.length === 0) return;
      const added = accepted.map((source, i) => ({
        id: `video:${Date.now()}:${i}:${source.kind === "web" ? source.file.name : source.picked.id}`,
        kind: "video" as const,
        previewUrl: source.kind === "web" ? source.thumbUrl : source.picked.thumbnailDataUrl,
        durationMs: source.kind === "web" ? source.durationMs : source.picked.durationMs,
        source,
      }));
      setVideoItems((prev) => [...added, ...prev]);
      setSelectedIds((prev) =>
        mergeAttachmentSelectedIds(
          prev,
          added.map((item) => item.id),
          MESSENGER_ATTACHMENT_ALBUM_PICK_MAX
        )
      );
    },
    [notifyAlbumPickMax]
  );

  /** 웹 경로(구 바이너리·브라우저) 영상 파일 → 길이·썸네일 읽고 검사 */
  const commitWebVideoFiles = useCallback(
    async (files: File[]) => {
      const sources: MessengerVideoSendSource[] = [];
      for (const file of files) {
        const read = await readMessengerWebVideo(file);
        if (read.ok) sources.push(read.video);
        else notifyVideoError(read.error);
      }
      commitVideosToSelection(sources);
    },
    [commitVideosToSelection, notifyVideoError]
  );

  const onToggleRecent = useCallback(
    (id: string) => {
      if (uploadBlocked) return;
      const item = stripItemsRef.current.find((x) => x.id === id);
      if (
        item?.kind === "native" &&
        item.video &&
        selectedIdsRef.current.indexOf(id) < 0 &&
        !precheckMessengerVideo({ bytes: 1, durationMs: item.durationMs || null, ext: "mp4" }).ok
      ) {
        notifyVideoError("video_too_long");
        return;
      }
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
    [notifyVideoError, t, uploadBlocked]
  );

  const onSendSelected = useCallback(async () => {
    if (sendingLockRef.current || selectedIds.length === 0 || uploadBlocked) return;
    sendingLockRef.current = true;
    setSending(true);
    const byId = new Map(stripItems.map((item) => [item.id, item]));
    const files: File[] = [];
    const previewUrls: string[] = [];
    const nativeIds: string[] = [];
    const nativeVideoIds: string[] = [];
    const videos: MessengerVideoSendSource[] = [];
    const sentVideoIds = new Set<string>();
    for (const id of selectedIds) {
      const item = byId.get(id);
      if (!item) continue;
      if (item.kind === "video") {
        videos.push(item.source);
        sentVideoIds.add(item.id);
        continue;
      }
      if (item.kind === "native" && item.video) {
        nativeVideoIds.push(item.nativeId);
        continue;
      }
      if (item.kind === "session") {
        files.push(item.file);
        /**
         * P0-D: 보관소 URL 을 넘기면 전송 컨트롤러가 60초 뒤·실패 시 해제해 「최근 사진」 썸네일이 깨졌다.
         * 전송용 URL 을 새로 만든다 — 그 URL 의 주인은 전송 컨트롤러(기존 해제 경로 그대로).
         */
        previewUrls.push(URL.createObjectURL(item.file));
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
    if (nativeVideoIds.length > 0) {
      /** 최근 줄 영상 → 보낼 준비 등록(압축은 보낼 때 네이티브가) */
      const reg = await registerMessengerNativeVideos(nativeVideoIds);
      if (reg.failed.length > 0) notifyVideoError("video_read_failed");
      for (const picked of reg.videos) videos.push({ kind: "native", picked, prepared: null });
    }
    if (files.length === 0 && videos.length === 0) {
      sendingLockRef.current = false;
      setSending(false);
      return;
    }
    /* 영상 소유권은 컨트롤러로 — 시트가 닫혀도 해제하지 않게 목록에서 먼저 뺀다 */
    if (sentVideoIds.size > 0) {
      const remaining = videoItemsRef.current.filter((item) => !sentVideoIds.has(item.id));
      videoItemsRef.current = remaining;
      setVideoItems(remaining);
    }
    try {
      if (files.length > 0) {
        if (sendAsAlbum || files.length === 1) {
          await onSendImages(files, previewUrls);
        } else {
          /** 개별 전송 — 선택 순서대로 한 장씩 별도 메시지(각자 clientMessageId). 실패해도 나머지 계속. */
          await onSendImages(files, previewUrls, { individually: true });
        }
      }
      if (videos.length > 0) {
        /* 사진 묶음 다음에 영상 — 영상은 업로드가 길어 기다리지 않고 시트를 닫는다 */
        void onSendVideos(videos);
      }
      setSelectedIds([]);
      onDismiss();
    } finally {
      sendingLockRef.current = false;
      setSending(false);
    }
  }, [notifyPhotoLoadFailed, notifyVideoError, onDismiss, onSendImages, onSendVideos, selectedIds, sendAsAlbum, stripItems, uploadBlocked]);

  const onGalleryChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const all = Array.from(event.target.files ?? []);
      event.target.value = "";
      commitPickedFilesToSelection(all.filter((f) => f.type.startsWith("image/")));
      const videos = all.filter((f) => !f.type.startsWith("image/") && isMessengerVideoFile(f));
      if (videos.length > 0 && !uploadBlocked) void commitWebVideoFiles(videos);
    },
    [commitPickedFilesToSelection, commitWebVideoFiles, uploadBlocked]
  );

  /** 구 바이너리(네이티브 사진 선택기는 있으나 영상 압축 없음) 전용 — 웹 선택기로 영상만 */
  const onVideoInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const videos = Array.from(event.target.files ?? []).filter((f) => isMessengerVideoFile(f));
      event.target.value = "";
      if (videos.length > 0 && !uploadBlocked) void commitWebVideoFiles(videos);
    },
    [commitWebVideoFiles, uploadBlocked]
  );

  const onNativePhotoPick = useCallback(async () => {
    if (uploadBlocked || sendingLockRef.current) return;
    if (isMessengerNativeVideoSupported()) {
      /** 새 바이너리 — 한 선택기에서 사진·동영상(영상은 압축 전 메타만, 보낼 때 네이티브가 압축) */
      const { photos, failed, videos } = await pickMessengerPhotosAndVideos(MESSENGER_ATTACHMENT_ALBUM_PICK_MAX);
      notifyPhotoLoadFailed(failed.length);
      if (photos.length > 0) {
        commitPickedFilesToSelection(photos.map((payload, index) => messengerPhotoPayloadToFile(payload, index)));
      }
      const accepted: MessengerVideoSendSource[] = [];
      for (const picked of videos) {
        /* 압축 전이라 크기는 보지 않는다(압축 후 서버·클라가 다시 검사) — 길이만 */
        const pre = precheckMessengerVideo({ bytes: 1, durationMs: picked.durationMs || null, ext: "mp4" });
        if (!pre.ok || !(picked.durationMs > 0)) {
          notifyVideoError(
            picked.durationMs > MESSENGER_VIDEO_MAX_DURATION_MS ? "video_too_long" : "video_read_failed"
          );
          void releaseMessengerNativeVideo(picked.id);
          continue;
        }
        accepted.push({ kind: "native", picked, prepared: null });
      }
      commitVideosToSelection(accepted);
      return;
    }
    const { photos: payloads, failed } = await pickMessengerPhotoLibraryPhotos(
      MESSENGER_ATTACHMENT_ALBUM_PICK_MAX
    );
    notifyPhotoLoadFailed(failed.length);
    if (payloads.length === 0) return;
    const files = payloads.map((payload, index) => messengerPhotoPayloadToFile(payload, index));
    commitPickedFilesToSelection(files);
  }, [commitPickedFilesToSelection, commitVideosToSelection, notifyPhotoLoadFailed, notifyVideoError, uploadBlocked]);

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
    if (id === "photo") return t("cm_ui_attach_photo_video");
    return safeT("gift_u3_wallet_send");
  };

  const actionIcon = (id: MessengerAttachmentActionId) => {
    const cls = "h-6 w-6 shrink-0 text-[color:var(--overlay-primary)]";
    if (id === "photo") return <ImageIcon className={cls} strokeWidth={1.75} aria-hidden />;
    return <Gift className={cls} strokeWidth={1.75} aria-hidden />;
  };

  const deviceLibrary = messengerAttachmentDeviceLibrarySupported();
  const nativeVideo = deviceLibrary && isMessengerNativeVideoSupported();
  /** 권한 안내 칸 — prompt: 「허용」, denied(시스템이 더는 안 물음): 「설정에서 허용」. unavailable(브리지 준비 전)은 칸 없음 */
  const permissionCta: "allow" | "settings" | null = !deviceLibrary
    ? null
    : photoPermissionState === "prompt"
      ? "allow"
      : photoPermissionState === "denied"
        ? "settings"
        : null;
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
        accept={`image/jpeg,image/png,image/webp,image/gif,${MESSENGER_VIDEO_WEB_ACCEPT}`}
        className="hidden"
        onChange={(e) => void onGalleryChange(e)}
      />
      <input
        ref={videoInputRef}
        type="file"
        multiple
        accept={MESSENGER_VIDEO_WEB_ACCEPT}
        className="hidden"
        onChange={onVideoInputChange}
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

          {deviceLibrary && !nativeVideo ? (
            /* 구 바이너리: 네이티브 사진 선택기에는 영상이 없어 웹 선택기로 영상만 고른다(압축 없음 · 설계 §3-7) */
            <button
              type="button"
              disabled={uploadBlocked}
              onClick={() => videoInputRef.current?.click()}
              className="relative flex h-[88px] w-[88px] shrink-0 flex-col items-center justify-center gap-1 rounded-[length:var(--overlay-radius-md)] bg-[color:var(--overlay-secondary)] text-[color:var(--overlay-text-primary)] transition-transform enabled:active:scale-[var(--overlay-press-scale)] disabled:cursor-not-allowed disabled:bg-[color:var(--sm-color-primary-disabled)] disabled:text-[color:var(--overlay-text-secondary)]"
              aria-label={t("cm_ui_attach_video")}
              data-cm-attach-video-legacy=""
            >
              <Film className="h-7 w-7" strokeWidth={1.75} aria-hidden />
              <span className="text-[length:var(--overlay-caption-size)] font-medium">{t("cm_ui_attach_video")}</span>
            </button>
          ) : null}

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
                {item.kind === "video" || (item.kind === "native" && item.video) ? (
                  <span
                    data-cm-attach-video-duration=""
                    className="absolute bottom-1 right-1 rounded-ui-rect bg-black/55 px-1 py-[1px] text-[length:var(--overlay-caption-size)] font-medium tabular-nums text-white"
                  >
                    {formatMessengerVideoDuration(item.durationMs)}
                  </span>
                ) : null}
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

          {permissionCta ? (
            /* 재감사 R2 — 텔레그램 GalleryEmptyView 와 같은 역할: 제목 + 누를 버튼(누를 때만 권한 요청) */
            <div
              data-cm-attach-permission-cta={permissionCta}
              className="flex h-[88px] w-[200px] shrink-0 flex-col justify-center gap-1.5 rounded-[length:var(--overlay-radius-md)] bg-[color:var(--overlay-secondary)] px-3"
            >
              <p className="text-[length:var(--overlay-caption-size)] font-semibold leading-snug text-[color:var(--overlay-text-primary)]">
                {t("cm_ui_attach_permission_title")}
              </p>
              <button
                type="button"
                disabled={uploadBlocked}
                onClick={() => (permissionCta === "settings" ? onOpenMediaSettings() : void onRequestMediaPermission())}
                className="min-h-[32px] self-start rounded-full bg-[color:var(--overlay-primary)] px-3 text-[length:var(--overlay-caption-size)] font-semibold text-[color:var(--overlay-surface)] disabled:cursor-not-allowed disabled:bg-[color:var(--sm-color-primary-disabled)]"
              >
                {permissionCta === "settings" ? t("cm_ui_attach_permission_settings") : t("cm_ui_attach_permission_allow")}
              </button>
            </div>
          ) : null}

          {photoPermissionState === "limited" && deviceLibrary ? (
            <button
              type="button"
              disabled={uploadBlocked}
              onClick={() => void onSelectMoreMedia()}
              data-cm-attach-select-more=""
              className="relative flex h-[88px] w-[88px] shrink-0 flex-col items-center justify-center gap-1 rounded-[length:var(--overlay-radius-md)] bg-[color:var(--overlay-secondary)] text-[color:var(--overlay-text-primary)] transition-transform enabled:active:scale-[var(--overlay-press-scale)] disabled:cursor-not-allowed"
            >
              <Plus className="h-7 w-7" strokeWidth={1.75} aria-hidden />
              <span className="text-[length:var(--overlay-caption-size)] font-medium">{t("cm_ui_attach_more_select")}</span>
            </button>
          ) : null}

          {/* 재감사 R3 — 줄 끝 「전체」: 시스템 선택기(아래 「사진·동영상」과 같은 동작) */}
          <button
            type="button"
            disabled={uploadBlocked}
            onClick={() => onAction("photo")}
            data-cm-attach-all=""
            className="relative flex h-[88px] w-[88px] shrink-0 flex-col items-center justify-center gap-1 rounded-[length:var(--overlay-radius-md)] bg-[color:var(--overlay-secondary)] text-[color:var(--overlay-text-primary)] transition-transform enabled:active:scale-[var(--overlay-press-scale)] disabled:cursor-not-allowed"
            aria-label={t("cm_ui_attach_all")}
          >
            <LayoutGrid className="h-7 w-7" strokeWidth={1.75} aria-hidden />
            <span className="text-[length:var(--overlay-caption-size)] font-medium">{t("cm_ui_attach_all")}</span>
          </button>

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
