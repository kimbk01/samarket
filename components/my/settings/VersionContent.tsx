"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

/** app_meta app_version, app_build 표시. Supabase 미연동 시 1.0.0 */
export function VersionContent() {
  const [version, setVersion] = useState("1.0.0");
  const [build, setBuild] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (supabase) {
      // TODO: supabase.from('app_meta').select('key,value').in('key', ['app_version','app_build']).then(({ data }) => { ... })
    }
  }, []);

  return (
    <div>
      <p className="text-[15px] text-gray-900">현재 버전 {version}{build != null ? ` (${build})` : ""}</p>
      <p className="mt-2 text-[13px] text-gray-500">최신 버전입니다.</p>
    </div>
  );
}
