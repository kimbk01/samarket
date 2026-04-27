import { Suspense } from "react";
import LoginPageClient from "./LoginPageClient";
import { MainFormRouteLoading } from "@/components/layout/MainRouteLoading";

export default function LoginPage() {
  return (
    <Suspense fallback={<MainFormRouteLoading />}>
      <LoginPageClient />
    </Suspense>
  );
}
