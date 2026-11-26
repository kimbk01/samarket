import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RegistrationKeyboardProofClient } from "@/components/dev/RegistrationKeyboardProofClient";

export const dynamic = "force-dynamic";

/**
 * 가입 단계(동의·전화·주소) 키보드·하단 버튼 기기 확인용 — 실제 가입 화면 부품을 서버 호출 없이 그린다.
 * 로컬 확인 전용 — 운영 빌드에서는 404.
 */
export default function RegistrationKeyboardProofPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense fallback={null}>
      <RegistrationKeyboardProofClient />
    </Suspense>
  );
}
