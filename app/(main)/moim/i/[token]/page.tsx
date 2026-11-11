import { Suspense } from "react";
import { MoimInviteLanding } from "@/components/moim/MoimInviteLanding";

export default async function MoimInviteLandingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <Suspense fallback={null}>
      <MoimInviteLanding token={token} />
    </Suspense>
  );
}
