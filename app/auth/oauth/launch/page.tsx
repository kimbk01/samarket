import { Suspense } from "react";
import { NativeOAuthLaunchClient } from "@/app/auth/oauth/launch/NativeOAuthLaunchClient";

export default function NativeOAuthLaunchPage() {
  return (
    <Suspense fallback={null}>
      <NativeOAuthLaunchClient />
    </Suspense>
  );
}
