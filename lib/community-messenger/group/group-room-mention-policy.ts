import { contentHasMentionSyntax } from "@/lib/community-messenger/group/group-room-mention-parser";

export function shouldNotifyMentionRecipient(input: {
  mentionUserIds: string[];
  recipientUserId: string;
  senderUserId: string;
}): boolean {
  const recipient = input.recipientUserId.trim();
  const sender = input.senderUserId.trim();
  if (!recipient || recipient === sender) return false;
  return input.mentionUserIds.some((id) => id.trim() === recipient);
}

export function mentionOverridesGroupMessageMute(input: {
  mentionUserIds: string[];
  recipientUserId: string;
}): boolean {
  return shouldNotifyMentionRecipient({
    mentionUserIds: input.mentionUserIds,
    recipientUserId: input.recipientUserId,
    senderUserId: "",
  });
}

export function hasStructuredMentions(mentionUserIds: string[] | null | undefined): boolean {
  return Array.isArray(mentionUserIds) && mentionUserIds.some((id) => String(id ?? "").trim());
}

export function hasMentionInContent(content: string, mentionUserIds?: string[] | null): boolean {
  if (hasStructuredMentions(mentionUserIds)) return true;
  return contentHasMentionSyntax(content);
}
