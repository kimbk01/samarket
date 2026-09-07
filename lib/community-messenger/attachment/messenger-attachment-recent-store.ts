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
