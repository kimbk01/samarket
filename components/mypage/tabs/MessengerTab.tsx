import type { ReactNode } from "react";
import { ChatSettingsContent } from "@/components/my/settings/ChatSettingsContent";
import { NotificationsSettingsContent } from "@/components/my/settings/NotificationsSettingsContent";
import { MessengerOverviewPanel } from "@/components/mypage/MessengerOverviewPanel";
import { MyPageQuickActions } from "@/components/mypage/MyPageQuickActions";
import { MyPageSectionHeader } from "@/components/mypage/MyPageSectionHeader";

export function MessengerTab({ section }: { section: string }) {
  if (section === "dm") {
    return (
      <TabShell
        title="1:1 채팅"
        description="메신저 1:1 채팅과 거래 / 주문 채팅을 구분해서 관리합니다."
      >
        <MessengerOverviewPanel mode="dm" />
        <div className="mt-4">
          <MyPageQuickActions
            items={[
              { label: "거래 채팅", href: "/mypage?tab=trade&section=chat", caption: "거래 전용 채팅" },
              { label: "주문 채팅", href: "/mypage?tab=store&section=order-chat", caption: "주문 전용 채팅" },
            ]}
          />
        </div>
      </TabShell>
    );
  }

  if (section === "groups") {
    return (
      <TabShell
        title="그룹 채팅"
        description="공개 그룹과 비공개 그룹은 메신저 축에서 유지하되, 내정보 안에서 빠르게 진입합니다."
      >
        <MessengerOverviewPanel mode="groups" />
      </TabShell>
    );
  }

  if (section === "chat-settings") {
    return (
      <TabShell
        title="채팅 설정"
        description="거래 채팅, 주문 채팅, 메신저가 공통으로 참조하는 채팅 설정입니다."
      >
        <ChatSettingsContent />
      </TabShell>
    );
  }

  if (section === "alerts") {
    return (
      <TabShell
        title="알림 설정"
        description="메신저 알림과 전체 서비스 알림을 함께 관리합니다."
      >
        <NotificationsSettingsContent />
      </TabShell>
    );
  }

  return (
    <div className="space-y-4">
      <MyPageSectionHeader
        title="메신저"
        description="거래 채팅, 주문 채팅과 별개로 1:1 / 그룹 메신저 축을 분리합니다."
      />
      <MyPageQuickActions
        items={[
          { label: "1:1 채팅", href: "/mypage?tab=messenger&section=dm", caption: "메신저 / 거래 / 주문 채팅 분리" },
          { label: "그룹 채팅", href: "/mypage?tab=messenger&section=groups", caption: "공개 / 비공개 그룹" },
          { label: "채팅 설정", href: "/mypage?tab=messenger&section=chat-settings", caption: "공통 채팅 정책" },
          { label: "알림 설정", href: "/mypage?tab=messenger&section=alerts", caption: "알림과 방해금지" },
        ]}
      />
    </div>
  );
}

function TabShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <MyPageSectionHeader title={title} description={description} />
      <div className="rounded-[4px] border border-gray-200 bg-white p-4">{children}</div>
    </div>
  );
}
