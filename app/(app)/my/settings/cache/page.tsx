import { SettingsHeader } from "@/components/my/settings/SettingsHeader";
import { CacheSettingsContent } from "@/components/my/settings/CacheSettingsContent";

export default function CachePage() {
  return (
    <div className="min-h-screen bg-gray-100">
      <SettingsHeader title="캐시 삭제" backHref="/my/settings" />
      <div className="mx-auto max-w-[480px] bg-white px-4 py-4">
        <CacheSettingsContent />
      </div>
    </div>
  );
}
