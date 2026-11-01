/**
 * Vitest Node 전역 setup.
 * Browser-only SDK 는 vitest.config alias (agora-rtc-sdk-ng 등).
 * window 는 테스트별 stub — 전역 덮어쓰기 금지 (delivery-home-hub 등 setTimeout 필요).
 */
import { setImmediate as realSetImmediate } from "node:timers";
import { afterEach } from "vitest";

/**
 * 시험마다 이벤트 루프를 한 번 놓아준다 — CI `[vitest-worker]: Timeout calling "onTaskUpdate"` 근본 수정.
 * 가짜 DB 처럼 즉시 끝나는 async 시험만 이어지면 파일이 끝날 때까지 매크로태스크가 한 번도 돌지 않아,
 * 작업 프로세스가 메인의 RPC 응답(birpc 60초)을 처리하지 못한다. 파일 전체가 60초를 넘으면(느린 러너에서
 * trade-browse-location-tiers-contract 40초+) 시험이 모두 통과해도 실행 전체가 실패했다
 * (main CI 실패 표본 10건 중 7건 · 2026-11-01 대기 시간을 5초로 줄여 로컬 재현 → 이 처리로 해소).
 * `node:timers` 의 setImmediate 를 쓰므로 vi.useFakeTimers() 가 남아 있어도 막히지 않는다.
 */
afterEach(() => new Promise<void>((resolve) => realSetImmediate(resolve)));
