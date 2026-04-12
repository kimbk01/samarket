"use client";

import type { ComponentProps } from "react";
import type { MessengerChatListContext } from "@/lib/community-messenger/messenger-ia";
import { MessengerChatsScreen } from "@/components/community-messenger/MessengerChatsScreen";

type ChatsProps = ComponentProps<typeof MessengerChatsScreen>;

type Props = Omit<ChatsProps, "showFilters" | "emptyMessage" | "listContext"> & {
  emptyMessage?: string;
  listContext?: MessengerChatListContext;
};

/** 보관함 탭 — 필터 없이 보관된 대화만 표시 */
export function MessengerArchiveScreen({
  emptyMessage = "보관한 대화 없음",
  listContext = "archive",
  ...rest
}: Props) {
  return (
    <MessengerChatsScreen {...rest} emptyMessage={emptyMessage} showFilters={false} listContext={listContext} />
  );
}
