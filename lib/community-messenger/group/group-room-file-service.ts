import type { GroupMediaIndexItem } from "@/lib/community-messenger/group/group-room-media-index";

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function resolveGroupFileDownloadUrl(item: GroupMediaIndexItem): string | null {
  const fromMeta = trimText(item.metadata.fileUrl ?? item.metadata.file_url ?? item.metadata.url);
  if (fromMeta) return fromMeta;
  if (item.messageType === "image") {
    return trimText(item.metadata.imageUrl ?? item.metadata.image_url) || trimText(item.content) || null;
  }
  return trimText(item.content) || null;
}

export function resolveGroupFileDisplayName(item: GroupMediaIndexItem): string {
  const name = trimText(item.metadata.fileName ?? item.metadata.file_name ?? item.metadata.name);
  if (name) return name;
  if (item.messageType === "image") return "사진";
  return "파일";
}

export function isGroupMediaFileItem(item: GroupMediaIndexItem): boolean {
  return item.messageType === "file";
}

export function isGroupMediaImageItem(item: GroupMediaIndexItem): boolean {
  return item.messageType === "image";
}
