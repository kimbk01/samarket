export type GroupMediaIndexItem = {
  messageId: string;
  messageType: "image" | "file";
  content: string;
  createdAt: string;
  senderId: string | null;
  metadata: Record<string, unknown>;
};

export type GroupMediaIndexPage = {
  items: GroupMediaIndexItem[];
  nextCursor: string | null;
};

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function parseGroupMediaCursor(value: unknown): { createdAt: string; messageId: string } | null {
  if (typeof value !== "string" || !value.includes("|")) return null;
  const [createdAt, messageId] = value.split("|", 2);
  if (!trimText(createdAt) || !trimText(messageId)) return null;
  return { createdAt: trimText(createdAt), messageId: trimText(messageId) };
}

export function encodeGroupMediaCursor(createdAt: string, messageId: string): string {
  return `${createdAt}|${messageId}`;
}

export function filterGroupMediaRows(
  rows: Array<Record<string, unknown>>,
  filter: "all" | "image" | "file"
): GroupMediaIndexItem[] {
  return rows
    .map((row) => ({
      messageId: trimText(row.id),
      messageType: trimText(row.message_type) as "image" | "file",
      content: trimText(row.content),
      createdAt: trimText(row.created_at),
      senderId: typeof row.sender_id === "string" ? row.sender_id : null,
      metadata:
        row.metadata && typeof row.metadata === "object"
          ? (row.metadata as Record<string, unknown>)
          : {},
    }))
    .filter(
      (row) =>
        row.messageId &&
        row.createdAt &&
        (filter === "all"
          ? row.messageType === "image" || row.messageType === "file"
          : row.messageType === filter)
    );
}
