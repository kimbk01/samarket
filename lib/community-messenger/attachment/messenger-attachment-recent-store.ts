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
    recentItems = [
      item,
      ...recentItems.filter(
        (r) =>
          !(
            r.file.name === file.name &&
            r.file.size === file.size &&
            r.file.lastModified === file.lastModified
          )
      ),
    ];
  }
  while (recentItems.length > MESSENGER_ATTACHMENT_RECENT_MAX) {
    const drop = recentItems.pop();
    if (drop) URL.revokeObjectURL(drop.previewUrl);
  }
  return added;
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
