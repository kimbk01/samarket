import { AccountDeletionRequestForm } from "@/components/account/AccountDeletionRequestForm";

export const dynamic = "force-dynamic";

export default function AccountDeleteRequestPage() {
  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-sam-fg">계정 삭제 요청</h1>
      <p className="mt-2 sam-text-body-secondary leading-relaxed text-sam-muted">
        SAMARKET 앱과 웹에서 계정 삭제를 시작할 수 있습니다. 로그인한 상태에서 아래 양식을 제출하면 운영팀이 삭제 요청을 처리합니다.
      </p>
      <div className="mt-6">
        <AccountDeletionRequestForm source="web_delete_request" />
      </div>
    </div>
  );
}
