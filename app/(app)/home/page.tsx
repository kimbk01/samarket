import { HomeContent } from "./HomeContent";
import { APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";

export default function HomePage() {
  return (
    <div className={`${APP_MAIN_GUTTER_X_CLASS} py-3`}>
      <HomeContent />
    </div>
  );
}
