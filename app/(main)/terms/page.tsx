export const dynamic = "force-dynamic";

export default function TermsPage() {
  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-sam-fg">이용약관</h1>
      <div className="mt-4 space-y-3 sam-text-body leading-relaxed text-sam-fg">
        <p>SAMARKET은 커뮤니티, 거래, 주문, 채팅 기능을 제공하며 서비스 내 불법 행위, 사기, 혐오 표현, 성적 착취, 개인정보 유출을 금지합니다.</p>
        <p>회원은 본인 계정으로만 서비스를 이용해야 하며, 허위 정보 등록이나 타인 명의 도용은 금지됩니다.</p>
        <p>필리핀 전화번호 인증이 필요한 기능은 정회원 인증 후에만 사용할 수 있습니다.</p>
        <p>신고 및 차단 기능을 통해 부적절한 사용자나 콘텐츠를 제재할 수 있으며, 운영자는 심사와 안전을 위해 필요한 기록을 보관할 수 있습니다.</p>
      </div>
    </div>
  );
}
