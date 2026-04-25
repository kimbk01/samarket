import { AuthConsentForm } from "@/components/auth/AuthConsentForm";

export const dynamic = "force-dynamic";

export default function AuthConsentPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <AuthConsentForm />
    </div>
  );
}
