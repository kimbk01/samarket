export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-sam-fg">개인정보처리방침</h1>
      <div className="mt-4 space-y-3 sam-text-body leading-relaxed text-sam-fg">
        <p>SAMARKET은 계정 식별, 거래 안전, 고객지원, 신고 처리, 법적 의무 이행을 위해 필요한 최소한의 개인정보를 처리합니다.</p>
        <p>전화번호, 로그인 공급자 정보, 거래 및 신고 관련 기록은 서비스 안전과 분쟁 대응 목적상 일정 기간 보관될 수 있습니다.</p>
        <p>회원은 앱 내 계정 관리 메뉴와 웹 계정 삭제 요청 페이지를 통해 삭제 요청을 시작할 수 있습니다.</p>
        <p>운영상 또는 법적 의무로 보관해야 하는 기록을 제외한 개인정보는 탈퇴 처리 시 비식별화 또는 삭제 정책에 따라 관리됩니다.</p>
      </div>
    </div>
  );
}
