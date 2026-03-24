"use client";

import { useMemo, useState } from "react";
import { getPersonalizedFeedPolicies } from "@/lib/personalized-feed/mock-personalized-feed-policies";
import { getOrCreateBehaviorProfile } from "@/lib/personalized-feed/mock-user-behavior-profiles";
import { getFeedCandidates } from "@/lib/home-feed/mock-feed-candidates";
import { getPersonalizedCandidatesFromFeedCandidates } from "@/lib/personalized-feed/mock-personalized-candidates";
import { buildPersonalizedFeedSections } from "@/lib/personalized-feed/personalized-feed-utils";
import { PERSONALIZED_SECTION_LABELS } from "@/lib/personalized-feed/mock-personalized-feed-policies";

const MOCK_USER_IDS = ["me", "user2"];
const MOCK_REGION = "마닐라 · Malate · Barangay 1";

export function PersonalizedFeedSimulator() {
  const [userId, setUserId] = useState("me");
  const [refreshKey, setRefreshKey] = useState(0);

  const policies = useMemo(() => getPersonalizedFeedPolicies(), [refreshKey]);
  const profile = useMemo(
    () => getOrCreateBehaviorProfile(userId, MOCK_REGION),
    [userId, refreshKey]
  );
  const feedCandidates = useMemo(
    () => getFeedCandidates(MOCK_REGION, { region: "마닐라", city: "Malate", barangay: "Barangay 1" }),
    [refreshKey]
  );
  const candidates = useMemo(
    () => getPersonalizedCandidatesFromFeedCandidates(feedCandidates),
    [feedCandidates]
  );
  const results = useMemo(
    () =>
      buildPersonalizedFeedSections(policies, candidates, profile, {
        userId,
        writeLog: false,
      }),
    [policies, candidates, profile, userId]
  );

  const totalItems = results.reduce((sum, r) => sum + r.items.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[14px] font-medium text-gray-700">사용자</label>
        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="rounded border border-gray-200 px-3 py-2 text-[14px]"
        >
          {MOCK_USER_IDS.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="rounded border border-signature bg-signature px-3 py-2 text-[14px] font-medium text-white"
        >
          시뮬레이션 실행
        </button>
      </div>
      <p className="text-[14px] text-gray-600">
        지역: {MOCK_REGION} · 총 {totalItems}건
      </p>
      {totalItems === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
          추천 결과가 없습니다. 관심 카테고리/최근 본/찜/채팅 데이터를 확인하세요.
        </div>
      ) : (
        <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
          {results.map((r) => (
            <div key={r.sectionKey} className="border-b border-gray-100 pb-3 last:border-0">
              <h3 className="mb-2 text-[14px] font-semibold text-gray-900">
                {PERSONALIZED_SECTION_LABELS[r.sectionKey]} ({r.items.length}건)
              </h3>
              <ul className="space-y-1 text-[13px] text-gray-700">
                {r.items.slice(0, 5).map((item) => (
                  <li key={item.id}>
                    {item.title} · {item.reasonLabel} (점수: {item.score})
                  </li>
                ))}
                {r.items.length > 5 && (
                  <li className="text-gray-500">… 외 {r.items.length - 5}건</li>
                )}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
