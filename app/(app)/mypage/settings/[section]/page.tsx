import { SettingsSubLayout } from "@/components/mypage/SettingsSubLayout";
import { SettingsSectionContent } from "@/components/mypage/SettingsSectionContent";

const SECTION_TITLES: Record<string, string> = {
  account: "내 계정",
  notifications: "알림 설정",
  "quiet-hours": "방해금지 시간",
  following: "모아보는 사용자",
  "hidden-users": "숨긴 사용자",
  autoplay: "동영상 자동 재생",
  "region-bulk": "판매 글 동네 일괄 변경",
  chat: "채팅 설정",
  preferences: "맞춤 설정",
  notice: "공지사항",
  country: "국가 변경",
  language: "언어 설정",
  cache: "캐시 삭제",
  version: "버전 정보",
  leave: "탈퇴하기",
};

const SECTION_DESCRIPTIONS: Record<string, string> = {
  account: "이메일, 연락처, 본인 인증 정보를 관리합니다.",
  notifications: "알림 종류와 수신 방식을 설정합니다.",
  "quiet-hours": "설정한 시간에는 알림을 받지 않습니다.",
  following: "모아보기한 사용자 목록을 확인하고 관리합니다.",
  "hidden-users": "숨긴 사용자 목록을 확인하고 관리합니다.",
  autoplay: "동영상 자동 재생 여부를 설정합니다.",
  "region-bulk": "등록한 판매 글의 동네를 한 번에 변경합니다.",
  chat: "채팅 알림, 읽음 표시 등을 설정합니다.",
  preferences: "추천과 맞춤 설정을 관리합니다.",
  notice: "서비스 공지사항을 확인합니다.",
  country: "서비스 이용 국가를 변경합니다.",
  language: "앱 표시 언어를 선택합니다.",
  cache: "저장된 캐시를 삭제하여 저장 공간을 확보합니다.",
  version: "현재 앱 버전을 확인합니다.",
  leave: "계정을 탈퇴하면 모든 데이터가 삭제됩니다.",
};

export default async function SettingsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const title = SECTION_TITLES[section] ?? "설정";
  const description = SECTION_DESCRIPTIONS[section];

  return (
    <SettingsSubLayout title={title}>
      <div className="rounded-xl bg-white p-6 shadow-sm">
        {description && (
          <p className="text-[14px] text-gray-600">{description}</p>
        )}
        <SettingsSectionContent section={section} description={description} />
      </div>
    </SettingsSubLayout>
  );
}
