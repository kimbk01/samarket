import { PhoneVerificationRequestForm } from "@/components/my/PhoneVerificationRequestForm";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";

export default function MyPhoneVerificationPage() {
  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title="전화번호 인증"
        subtitle="계정 보안"
        backHref="/my/account"
        section="account"
        hideCtaStrip
      />
      <div className="mx-auto max-w-4xl px-4 py-4">
        <PhoneVerificationRequestForm />
      </div>
    </div>
  );
}
