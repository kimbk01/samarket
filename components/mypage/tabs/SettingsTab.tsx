import type { ReactNode } from "react";
import { AddressManagementClient } from "@/components/addresses/AddressManagementClient";
import { BulkRegionChangeContent } from "@/components/my/settings/BulkRegionChangeContent";
import { CacheSettingsContent } from "@/components/my/settings/CacheSettingsContent";
import { ChatSettingsContent } from "@/components/my/settings/ChatSettingsContent";
import { CountrySettingsContent } from "@/components/my/settings/CountrySettingsContent";
import { LanguageSettingsContent } from "@/components/my/settings/LanguageSettingsContent";
import { LeaveContent } from "@/components/my/settings/LeaveContent";
import { LogoutContent } from "@/components/my/settings/LogoutContent";
import { NoticesContent } from "@/components/my/settings/NoticesContent";
import { NotificationsSettingsContent } from "@/components/my/settings/NotificationsSettingsContent";
import { PersonalizationContent } from "@/components/my/settings/PersonalizationContent";
import { UserListContent } from "@/components/my/settings/UserListContent";
import { VersionContent } from "@/components/my/settings/VersionContent";
import { VideoAutoplayContent } from "@/components/my/settings/VideoAutoplayContent";
import { MyPageMobileFold } from "@/components/mypage/MyPageMobileFold";
import { MyPageSectionHeader } from "@/components/mypage/MyPageSectionHeader";

export function SettingsTab({ section }: { section: string }) {
  if (section === "address") {
    return (
      <TabShell
        title="주소 관리"
        description="생활주소, 거래주소, 배달주소를 주소 관리 한 곳에서 분리해 관리합니다."
      >
        <AddressManagementClient embedded />
      </TabShell>
    );
  }

  if (section === "service") {
    return (
      <TabShell
        title="서비스"
        description="채팅 설정, 알림, 동영상 자동 재생, 맞춤 설정을 관리합니다."
      >
        <SettingsBlock title="채팅 설정">
          <ChatSettingsContent />
        </SettingsBlock>
        <SettingsBlock title="알림 설정">
          <NotificationsSettingsContent />
        </SettingsBlock>
        <SettingsBlock title="동영상 자동 재생">
          <VideoAutoplayContent />
        </SettingsBlock>
        <SettingsBlock title="맞춤 설정">
          <PersonalizationContent />
        </SettingsBlock>
      </TabShell>
    );
  }

  if (section === "users") {
    return (
      <TabShell
        title="사용자 관리"
        description="친구 / 관심 사용자, 차단 사용자, 숨긴 사용자를 공통 사용자 관리로 묶습니다."
      >
        <SettingsBlock title="친구 / 관심 사용자">
          <UserListContent type="favorite" emptyMessage="모아보는 사용자가 없습니다." />
        </SettingsBlock>
        <SettingsBlock title="차단 사용자">
          <UserListContent type="blocked" emptyMessage="차단한 사용자가 없습니다." />
        </SettingsBlock>
        <SettingsBlock title="숨긴 사용자">
          <UserListContent type="hidden" emptyMessage="숨긴 사용자가 없습니다." />
        </SettingsBlock>
      </TabShell>
    );
  }

  if (section === "region-language") {
    return (
      <TabShell
        title="지역 / 언어 / 국가"
        description="서비스 전체 공통 값으로 지역, 언어, 국가를 한곳에서 관리합니다."
      >
        <SettingsBlock title="언어 설정">
          <LanguageSettingsContent />
        </SettingsBlock>
        <SettingsBlock title="국가 설정">
          <CountrySettingsContent />
        </SettingsBlock>
        <SettingsBlock title="판매 글 동네 일괄 변경">
          <BulkRegionChangeContent />
        </SettingsBlock>
      </TabShell>
    );
  }

  if (section === "system") {
    return (
      <TabShell
        title="시스템"
        description="캐시 삭제, 버전 정보, 로그아웃, 탈퇴 같은 시스템 단위 작업을 모읍니다."
      >
        <SettingsBlock title="캐시 삭제">
          <CacheSettingsContent />
        </SettingsBlock>
        <SettingsBlock title="버전 정보">
          <VersionContent />
        </SettingsBlock>
        <SettingsBlock title="로그아웃">
          <LogoutContent />
        </SettingsBlock>
        <SettingsBlock title="탈퇴하기">
          <LeaveContent />
        </SettingsBlock>
      </TabShell>
    );
  }

  if (section === "support") {
    return (
      <TabShell
        title="공지 / 고객센터 / 약관"
        description="공지사항과 운영 안내, 도움말 영역을 설정 하단 보조 영역으로 분리합니다."
      >
        <SettingsBlock title="공지사항">
          <NoticesContent />
        </SettingsBlock>
        <SettingsBlock title="고객센터">
          <div className="space-y-2 text-[12px] leading-5 text-gray-500">
            <p>주문 문제는 주문 내역과 주문 상세에서 먼저 상태를 확인하세요.</p>
            <p>거래 문제는 거래 채팅과 거래 후기 화면에서 먼저 확인하세요.</p>
            <p>그래도 해결되지 않으면 운영 문의 흐름으로 접수하는 구조를 유지합니다.</p>
          </div>
        </SettingsBlock>
        <SettingsBlock title="이용약관">
          <div className="space-y-2 text-[12px] leading-5 text-gray-500">
            <p>계정, 거래, 주문, 커뮤니티 사용 정책은 서비스 공통 규칙으로 적용됩니다.</p>
            <p>정확한 프로필, 지역, 연락처 정보는 거래와 주문 신뢰도에 직접 연결됩니다.</p>
          </div>
        </SettingsBlock>
      </TabShell>
    );
  }

  return (
    <TabShell
      title="주소 관리"
      description="생활주소, 거래주소, 배달주소를 주소 관리 한 곳에서 분리해 관리합니다."
    >
      <AddressManagementClient embedded />
    </TabShell>
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
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function SettingsBlock({
  title,
  summary,
  children,
}: {
  title: string;
  summary?: string;
  children: ReactNode;
}) {
  return (
    <MyPageMobileFold title={title} summary={summary}>
      {children}
    </MyPageMobileFold>
  );
}
