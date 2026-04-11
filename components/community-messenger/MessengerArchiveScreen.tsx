"use client";

import type { ComponentProps } from "react";
import { MessengerChatsScreen } from "@/components/community-messenger/MessengerChatsScreen";

type ChatsProps = ComponentProps<typeof MessengerChatsScreen>;

type Props = Omit<ChatsProps, "showFilters" | "emptyMessage"> & {
  emptyMessage?: string;
};

/** 보관함 탭 — 필터 없이 보관된 대화만 표시 */
export function MessengerArchiveScreen({ emptyMessage = "보관된 대화가 없습니다.", ...rest }: Props) {
  return <MessengerChatsScreen {...rest} emptyMessage={emptyMessage} showFilters={false} />;
}
