import { SettingsHeader } from "@/components/my/settings/SettingsHeader";
import { BulkRegionChangeContent } from "@/components/my/settings/BulkRegionChangeContent";

export default function BulkRegionChangePage() {
  return (
    <div className="min-h-screen bg-gray-100">
      <SettingsHeader title="판매 글 동네 일괄 변경" backHref="/my/settings" />
      <div className="mx-auto max-w-[480px] bg-white px-4 py-4">
        <BulkRegionChangeContent />
      </div>
    </div>
  );
}
