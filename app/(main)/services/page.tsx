import { Suspense } from "react";
import { AllServicesContent } from "./AllServicesContent";

export default function ServicesPage() {
  return (
    <div className="px-4 pt-4">
      <Suspense fallback={null}>
        <AllServicesContent />
      </Suspense>
    </div>
  );
}
