# 커뮤니티 글쓰기 WYSIWYG — 조건부 승인 구현 기록 (2026-10-22)

- 브랜치: `community/wysiwyg-editor` (base `origin/main` `cab5180f3`). main 병합·배포·운영 DB 변경 없음.
- 기준: [설계 승인안](community-write-wysiwyg-design.md) · [전체 감사](community-full-audit.md)
- `[배포 구분]` 웹만 (`verify:native-version-bump` PASS, Android 1.2.4(11)·iOS 1.2(7) 무변경)

## 단계별 원인 · 수정 · 검증

| 단계 | 원인(결함 ID) | 수정 | 검증 |
|---|---|---|---|
| 1 주제 선택 흐름 | 첫 주제 자동 선택·slug 라벨(CM-W-01), 수정 시 숨김 주제 자동 변경(CM-P2-09), 주제 변경 시 URL 교체·재요청(CM-W-04), 등록 후 피드 이동·persistent 캐시 미무효화(CM-W-05·06) | 같은 시트·페이지 안 주제 선택 단계(라디오 목록, 자동 선택 제거), 이름만 표시, 「변경」으로 재선택(본문·사진 유지), 수정 모드는 원 주제 유지·운영 중지 주제 표시, PATCH 는 회원이 바꿀 때만 category 전송·서버는 생략 시 기존 주제 유지, 등록 후 상세 이동 + `clearAllPhilifeFeedPersistentCaches` | 계약 테스트 `philife-write-category-dropdown-contract`(Owner 승인 계약으로 갱신) PASS |
| 2 서버 이미지·관리자 | 첨부 줄 사진 폐기(CM-P1-02), 외부·data URL 저장(CM-P2-11), 10장 조용히 절단, 관리자 본문 수정 시 images 미동기화(CM-W-07) | `lib/philife/post-body-images.ts` SSOT: images = 본문 이미지 순서 ∪ 본문 밖 후보(본문에서 지운 이미지는 제외). 회원 POST/PATCH 는 본인 post-images URL 만(수정 시 기존 저장 URL 은 유지 허용), 10장 초과 400. 관리자 PATCH 는 native 글에만 같은 규칙 적용 + `community_post_images` 미러·대표 썸네일 정리, CAS·리비전·감사·권한 경로 무변경, imported 무변경. 상세 화면은 교차 본문이어도 본문 밖 사진을 갤러리로 표시 | `post-body-images.test.ts` 7건 PASS |
| 3 기존 textarea 결함 | 업로드 실패 무음·압축 없음(CM-P1-03), 업로드 중 등록(CM-P2-07), 붙여넣기 중 입력 덮어씀(CM-P2-08), 뒤로가기 소실(CM-P2-10), 성공 후 버튼 재활성(CM-P3-16 일부) | 업로드 결과·오류 처리 + 업로드 전 축소(긴 변 2048, JPEG 0.85), 성공분 즉시 반영, 업로드 중·실패 시 등록 차단과 사유 표시, 붙여넣기 구간만 함수형 치환, 하드웨어(overlay back)·브라우저/스와이프(history 가드) 이탈 확인, 이동 시작 후 버튼 잠금 유지 | 타입·린트 PASS, 실기기 NOT_PROVEN |
| 4 Tiptap·변환층·플래그 | 본문 안 이미지 편집 불가 | Tiptap 3.31.4(MIT, 버전 고정, 글쓰기에서만 동적 로드) 최소 스키마(문단·텍스트·이미지). `content-codec.ts` 줄 단위 무손실 변환(불가 본문은 기존 편집기로 열고 안내). 커서 위치 사진 삽입·업로드 상태·재시도·삭제·위/아래 이동·실행 취소, HTML 붙여넣기는 기존 변환기 + 재호스팅(실패 시 외부 URL 저장 안 함). 플래그 `COMMUNITY_WYSIWYG_EDITOR` 기본 `admin` = 일반 회원 비노출, 관리자 계정만 글쓰기 화면 토글로 사용 | `content-codec.test.ts`·`content-codec-tiptap.test.ts`(실제 ProseMirror 스키마) PASS |
| 5 데이터 왕복 | — | 운영 게시글 124건(읽기 전용 SQL, 같은 줄 규칙): member 7/7·imported 117/117 무손실 파싱 가능, 이미지 줄 684개, 불가 0건. TS 바이트 비교는 `COMMUNITY_BODY_ROUNDTRIP_FIXTURE` 로컬 스냅샷으로 재실행 가능(저장소에 운영 데이터 미포함) | PASS |

## 자동화 검증 (최종 트리 1회)
- `npm run typecheck:build` PASS
- vitest `lib/philife lib/community/ lib/community-feed lib/neighborhood lib/admin/community-admin lib/i18n` — 63 files / 397 passed, 1 skipped
- eslint 변경 파일 — 오류 0 (경고 8건은 모두 기존 미변경 코드)
- `verify:routes`·`verify:community-dpoint-financial-hard-lock`·`verify:single-community-feed-renderer` PASS
- 기존 실패(이번 변경과 무관): `verify:single-community-surface-authority`(미변경 파일 `resolve-main-surface` 등 검사), `lib/community-messenger/attachment/__tests__/messenger-image-auto-save.test.ts`(node 환경 localStorage 부재)

## 변경하지 않은 것
- `is_feed_sort` 주제의 글쓰기 포함 여부(CM-W-02): 기존 계약 테스트가 의도적으로 허용 → 승인 범위 밖이라 보류(운영 영향 0).
- DB 스키마·마이그레이션, Storage 삭제, 기존 글 변환·백필, textarea 제거, 임시저장, 리비전 복구, 통화·메신저·배달·거래.

## 실기기 검증 경로 (플래그 OFF 유지)
1. 브랜치를 main 에 반영(Owner 승인 필요) — env 미설정 = `admin` 모드라 일반 회원 화면은 기존 편집기 + 주제 단계·결함 수정만 반영.
2. 관리자 테스트 계정으로 앱 로그인 → 글쓰기 → 「새 편집기(검증용)」 켜기(기기별 저장).
3. 검증 글은 테스트 계정 작성 → 확인 후 본인 삭제(소프트) 또는 관리자 숨김. 업로드된 사진은 GC dry-run 대상(삭제 별도 승인).
4. 행렬: 설계안 §I (Samsung·Xiaomi 태블릿·iPhone 14 Pro Max).
