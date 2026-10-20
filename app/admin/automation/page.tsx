import { Suspense } from "react";
import { AdminAutomationPage } from "@/components/admin/automation/AdminAutomationPage";

export default function AutomationPage() {
  return (
    <Suspense fallback={null}>
      <AdminAutomationPage />
    </Suspense>
  );
}
