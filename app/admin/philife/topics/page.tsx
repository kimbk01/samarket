/**
 * Philife URL — `/admin/community/topics` 와 동일 본문.
 * `community_topics`(동네 피드 섹션) ↔ `/api/philife/neighborhood-topic-options`·`neighborhood-feed` 가 동일
 * `loadPhilifeDefaultSectionTopics` 로 연동(저장 시 `clearPhilifeDefaultSectionTopicsCache` 호출).
 */
export { default } from "../../community/topics/page";
