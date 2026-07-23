/**
 * group PreviewPort — 최신 그룹 메시지만. description/notice/memberCount 대체 금지.
 */
import type { DomainPreview, MessengerPreviewPort } from "@/lib/messenger/contracts/ports";
import { GROUP_DOMAIN } from "@/lib/messenger/group/domain";

export type GroupPreviewMessage = Readonly<{
  content: string | null | undefined;
  messageType: string | null | undefined;
  senderDisplayName?: string | null | undefined;
  isSystemAllowed?: boolean;
}>;

export type GroupPreviewPortInput = Readonly<{
  message: GroupPreviewMessage | null | undefined;
  /** 혼용 금지 */
  groupDescription?: string | null;
  groupNotice?: string | null;
  memberCountAsPreview?: number | null;
  roomTitleAsPreview?: string | null;
  pinnedMessageAsPreview?: string | null;
  joinMetadataAsPreview?: string | null;
}>;

export function assertGroupPreviewDoesNotUseMetadata(input: {
  groupDescription?: string | null;
  groupNotice?: string | null;
  memberCountAsPreview?: number | null;
  roomTitleAsPreview?: string | null;
  pinnedMessageAsPreview?: string | null;
  joinMetadataAsPreview?: string | null;
}): void {
  if (
    input.groupDescription?.trim() ||
    input.groupNotice?.trim() ||
    input.roomTitleAsPreview?.trim() ||
    input.pinnedMessageAsPreview?.trim() ||
    input.joinMetadataAsPreview?.trim() ||
    (input.memberCountAsPreview != null && Number.isFinite(input.memberCountAsPreview))
  ) {
    throw new Error("dibay_group_preview_metadata_forbidden");
  }
}

export function resolveGroupPreview(input: GroupPreviewPortInput): DomainPreview {
  assertGroupPreviewDoesNotUseMetadata(input);
  const message = input.message;
  if (!message) return { text: "", source: "empty" };
  const type = (message.messageType ?? "text").trim();
  let content = (message.content ?? "").trim();
  if (type === "image") content = "사진";
  else if (type === "voice") content = "음성 메시지";
  else if (type === "file") content = content || "파일";
  else if (type === "system") {
    if (message.isSystemAllowed === false) return { text: "", source: "empty" };
    if (!content) return { text: "", source: "empty" };
    return { text: content, source: "allowed_system_message" };
  }
  if (!content) return { text: "", source: "empty" };
  const sender = message.senderDisplayName?.trim();
  const text = sender ? `${sender}: ${content}` : content;
  return { text, source: "latest_user_message" };
}

export const groupPreviewPort: MessengerPreviewPort = {
  domain: GROUP_DOMAIN,
  resolvePreview: () => resolveGroupPreview({ message: null }),
};
