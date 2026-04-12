"use client";

import type { OrderChatMessage } from "@/lib/shared-order-chat/types";

function Bubble({
  m,
  perspective,
}: {
  m: OrderChatMessage;
  perspective: "member" | "owner" | "admin";
}) {
  if (m.sender_type === "system") {
    return (
      <div className="flex justify-center py-1">
        <div className="max-w-[90%] rounded-ui-rect bg-sam-surface-muted px-3 py-2 text-center text-xs text-sam-fg">
          <span className="font-semibold text-sam-muted">시스템 · </span>
          {m.content}
        </div>
      </div>
    );
  }

  const mine =
    (perspective === "member" && m.sender_type === "member") ||
    (perspective === "owner" && m.sender_type === "owner") ||
    (perspective === "admin" && m.sender_type === "admin");

  const adminStyle = m.sender_type === "admin" || m.message_type === "admin_note";

  return (
    <div className={`flex py-1 ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-ui-rect px-3 py-2 text-sm ${
          adminStyle
            ? "bg-amber-100 text-amber-950 ring-1 ring-amber-200"
            : mine
              ? "bg-signature text-white"
              : "bg-sam-surface text-sam-fg ring-1 ring-sam-border"
        }`}
      >
        {!mine && (
          <p className="mb-0.5 text-[10px] font-bold opacity-80">{m.sender_name}</p>
        )}
        {m.image_url ? (
          <p className="text-xs opacity-70">[이미지] {m.image_url}</p>
        ) : null}
        <p className="whitespace-pre-wrap">{m.content}</p>
        <p className="mt-1 text-[10px] opacity-60">
          {new Date(m.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );
}

export function OrderChatMessageList({
  messages,
  perspective,
}: {
  messages: OrderChatMessage[];
  perspective: "member" | "owner" | "admin";
}) {
  if (messages.length === 0) {
    return <p className="py-12 text-center text-sm text-sam-muted">아직 메시지가 없어요.</p>;
  }
  return (
    <div className="space-y-1 px-2 py-3">
      {messages.map((m) => (
        <Bubble key={m.id} m={m} perspective={perspective} />
      ))}
    </div>
  );
}
