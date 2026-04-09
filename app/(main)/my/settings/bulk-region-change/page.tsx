import { SettingsHeader } from "@/components/my/settings/SettingsHeader";
import { BulkRegionChangeContent } from "@/components/my/settings/BulkRegionChangeContent";
import { APP_MYPAGE_SUBPAGE_NARROW_BODY_CLASS } from "@/lib/ui/app-content-layout";

export default function BulkRegionChangePage() {
  return (
    <div className="min-h-screen bg-background">
      <SettingsHeader title="판매 글 동네 일괄 변경" />
      <div className={`${APP_MYPAGE_SUBPAGE_NARROW_BODY_CLASS} py-4`}>
        <BulkRegionChangeContent />
      </div>
    </div>
  );
}
