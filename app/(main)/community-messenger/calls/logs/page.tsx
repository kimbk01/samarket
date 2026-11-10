import { redirect } from "next/navigation";
import { buildMessengerCallLogsSectionHref } from "@/lib/community-messenger/messenger-call-logs-route";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * 통화 기록 별도 주소 → 메신저 홈 통화 탭 (채팅 시안 4판 「바꾸지 않는 화면」: 「통화 기록 별도 주소는 3. 통화 탭으로 연결만」).
 * 예전 별도 화면은 기록이 있어도 「통화 기록이 없습니다」를 보였다. 알림·구 앱 링크(`?callId=`)가 이 주소를 쓰므로 주소는 남긴다.
 */
export default async function CommunityMessengerCallLogsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const from = typeof sp.from === "string" ? sp.from : null;
  redirect(buildMessengerCallLogsSectionHref(from));
}
