"use client";

import type { ComponentProps } from "react";
import { MessengerChatSearchScreen } from "@/components/community-messenger/MessengerChatSearchScreen";
import { MessengerFriendPickerScreen } from "@/components/community-messenger/MessengerFriendPickerScreen";
import { MessengerSettingsScreen } from "@/components/community-messenger/MessengerSettingsScreen";
import type { MessengerSubScreen } from "@/lib/community-messenger/messenger-sub-screen-route";

type Props = {
  screen: MessengerSubScreen;
  picker: Omit<ComponentProps<typeof MessengerFriendPickerScreen>, "mode">;
  settings: Omit<ComponentProps<typeof MessengerSettingsScreen>, "page">;
  search: ComponentProps<typeof MessengerChatSearchScreen>;
};

/**
 * 채팅 하위 화면 자리 (채팅 시안 4판 「6. 친구 고르기」·「7. 채팅 설정」·「8. 채팅 검색」) — 대화·친구·통화 탭 목록 대신 이 화면 하나.
 * 주소(`section=pick|settings|search`)가 기준이고, 머리글(뒤로 + 가운데 제목)은 1단 공통 하위 화면 머리글이 그린다.
 * 하단 탭은 보관함(채팅 시안 4판 「4」)과 같이 그대로 보인다.
 */
export function MessengerHomeSubScreenHost({ screen, picker, settings, search }: Props) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-cm-home-sub-screen={screen.kind}>
      {screen.kind === "pick" ? <MessengerFriendPickerScreen mode={screen.mode} {...picker} /> : null}
      {screen.kind === "settings" ? <MessengerSettingsScreen page={screen.page} {...settings} /> : null}
      {screen.kind === "search" ? <MessengerChatSearchScreen {...search} /> : null}
    </div>
  );
}
