/**
 * Session-scoped recent photos for Kakao-parity + sheet strip.
 *
 * FIRST DIVERGENCE (platform):
 * Native MediaStore/PHPicker recent photos live in MessengerPhotoLibrary.
 * This store keeps images the user already picked/captured in-session.
 */

import { isMessengerPhotoLibraryNativeAvailable } from "@/lib/community-messenger/attachment/messenger-photo-library";

export const MESSENGER_ATTACHMENT_ALBUM_PICK_MAX = 10;
export const MESSENGER_ATTACHMENT_RECENT_MAX = 30;
export const MESSENGER_ATTACHMENT_NATIVE_RECENT_LIMIT = 24;

export type MessengerAttachmentRecentItem = {
  id: string;
  file: File;
  previewUrl: string;
  createdAt: number;
};

let recentItems: MessengerAttachmentRecentItem[] = [];
let idSeq = 0;

export function listMessengerAttachmentRecent(): MessengerAttachmentRecentItem[] {
  return recentItems.slice();
}

export function rememberMessengerAttachmentRecent(files: File[]): MessengerAttachmentRecentItem[] {
  if (files.length === 0) return [];
  const added: MessengerAttachmentRecentItem[] = [];
  const now = Date.now();
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    const id = `att-recent:${now}:${idSeq++}:${file.name}:${file.size}`;
    const previewUrl = URL.createObjectURL(file);
    const item: MessengerAttachmentRecentItem = { id, file, previewUrl, createdAt: now };
    added.push(item);
    const isSameFile = (r: MessengerAttachmentRecentItem) =>
      r.file.name === file.name && r.file.size === file.size && r.file.lastModified === file.lastModified;
    // P0-D: 같은 파일을 다시 넣으면 이전 항목 URL 은 이 보관소가 해제(주인 = 보관소).
    for (const r of recentItems) if (isSameFile(r)) revokeQuietly(r.previewUrl);
    recentItems = [item, ...recentItems.filter((r) => !isSameFile(r))];
  }
  while (recentItems.length > MESSENGER_ATTACHMENT_RECENT_MAX) {
    const drop = recentItems.pop();
    if (drop) revokeQuietly(drop.previewUrl);
  }
  return added;
}

function revokeQuietly(url: string): void {
  try {
    URL.revokeObjectURL(url);
  } catch {
    /* ignore */
  }
}

/**
 * P0-D: 로그아웃·계정 전환 — 이전 계정의 최근 사진(File·URL) 폐기.
 * 이 보관소의 URL 은 보관소만 해제한다. 전송 경로는 보관소 URL 을 빌려 쓰지 않고 새 URL 을 만든다
 * (`CommunityMessengerAttachmentSheet` onSendSelected).
 */
export function clearMessengerAttachmentRecent(): void {
  for (const r of recentItems) revokeQuietly(r.previewUrl);
  recentItems = [];
}

export function messengerAttachmentDeviceLibrarySupported(): boolean {
  return isMessengerPhotoLibraryNativeAvailable();
}

/**
 * CUT2 — Photo CTA / gallery / native pick budget before selection merge.
 * Does not send; only decides how many picked files may enter selection.
 */
export function takeFilesWithinAttachmentSelectionBudget(
  prevSelectedCount: number,
  pickedFiles: File[],
  max: number = MESSENGER_ATTACHMENT_ALBUM_PICK_MAX
): { accepted: File[]; overflow: boolean } {
  const selected = Math.max(0, prevSelectedCount);
  const cap = Math.max(0, max);
  const room = Math.max(0, cap - selected);
  if (pickedFiles.length === 0) return { accepted: [], overflow: false };
  if (room <= 0) return { accepted: [], overflow: true };
  const accepted = pickedFiles.slice(0, room);
  return { accepted, overflow: pickedFiles.length > room };
}

/** Append remembered item ids into selection without exceeding max (dedupe by id). */
export function mergeAttachmentSelectedIds(
  prevSelectedIds: string[],
  addedIds: string[],
  max: number = MESSENGER_ATTACHMENT_ALBUM_PICK_MAX
): string[] {
  const next = [...prevSelectedIds];
  for (const id of addedIds) {
    if (!id || next.includes(id)) continue;
    if (next.length >= max) break;
    next.push(id);
  }
  return next;
}
