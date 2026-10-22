# DIBAY 커뮤니티 글쓰기 · 주제 선택 · WYSIWYG 편집 — 정밀 설계 승인안 (2026-10-22)

- 기준: [community-full-audit.md](community-full-audit.md) (결함 ID 그대로 사용). HEAD `a0777955e`.
- 이번 단계: **설계만**. 코드·DB·Storage 변경, 라이브러리 설치, 커밋, 배포 없음. 운영 DB `ckdosyydvgzqwpbwuhon` 은 SELECT 만.
- 새로 발견한 항목은 기존 결함과 겹치지 않을 때만 `CM-W-xx` 로 표기 (결함/개선 구분 명시).

---

## 0. 결론 요약

1. **주제 선택**: 지금은 「선택」이 아니라 첫 주제가 자동 선택되는 구조다. 기존 글쓰기 바텀시트 안에 **주제 선택 단계(1단계)** 를 추가하고, 작성 화면 상단에 「선택한 주제 · 변경」을 둔다. 새 화면·새 라우트는 만들지 않는다.
2. **편집기**: **ProseMirror 기반 Tiptap(헤드리스, MIT)** 을 최소 스키마(문단·줄바꿈·이미지)로 도입하는 안을 권장한다. 단 **DB 저장 형식은 바꾸지 않는다** — 편집기 문서 ↔ 기존 `content`(평문 + `![](url)`) 변환층을 두고, `images` 는 서버가 본문에서 파생한다.
3. **호환성**: 운영 DB 기준 회원 글 7건은 모두 이미지 없는 짧은 평문, 이미지가 있는 글 116건은 전부 외부 수집(imported)이며 회원 편집 대상이 아니다(서버 403). → 기존 데이터 변환·백필 **불필요**.
4. **HARD GATE**: 편집기 교체는 ① 운영 글 전체 왕복 변환 테스트 PASS ② Samsung·Xiaomi 태블릿·iPhone 14 Pro Max 한글 IME 실기기 PASS 전에는 기본값으로 켜지 않는다. 기능 플래그로 기존 textarea 편집기를 롤백 경로로 유지한다.
5. **DB 변경 없음. 네이티브 변경 없음.** 신규 의존성 1종(Tiptap/ProseMirror) — Owner 승인 필요.

---

## A. 현재 구조 (실제 흐름 · 코드 근거)

### A-1. 진입 → 주제 → 작성 → 등록

| 단계 | 현재 동작 | 근거 |
|---|---|---|
| 진입 | 헤더 연필 `PhilifeHeaderComposeButton.tsx:53-104`, 빈 피드 CTA `CommunityFeed.tsx:2054-2072` → `openWriteSheet(category)` (`contexts/PhilifeWriteSheetContext.tsx:47-63`). 상세 수정·마이페이지는 `/philife/write?edit=` 풀페이지 | |
| 초기 주제 | 현재 홈 탭 `?category=` 값. 「전체」·「추천」에서 들어오면 값이 없어 **`writeTopics[0]` 자동 선택** — 「주제 미선택」 상태가 존재하지 않음 | `PhilifeNeighborhoodWriteForm.tsx:189-191,280-291`, `lib/philife/compose-href.ts:11-16` |
| 주제 목록 | `GET /api/philife/neighborhood-topic-options` 한 응답에 홈 탭(`feedChips`)과 글쓰기(`writeTopics`)를 함께 생성. DB `community_topics` `is_active AND is_visible`, `sort_order` 정렬. 하드코딩 폴백 없음(정상) | `app/api/philife/neighborhood-topic-options/route.ts:20-40`, `lib/neighborhood/philife-neighborhood-topics.ts:146-368` |
| 주제 UI | 커스텀 드롭다운(포털). 라벨이 `"{name} ({slug})"` 라 **slug 가 회원에게 노출** | `:1302-1421`, `lib/i18n/catalog/philife.ts:96,237` |
| 주제 변경 | 풀페이지는 `router.replace(?category=)` → 주제 목록 재요청 → 드롭다운 로딩·등록 버튼 순간 비활성. 본문·이미지 상태는 유지되는 구조(실기기 NOT_PROVEN) | `:326-344`, deps `:298` |
| 본문 | `<textarea>` 8줄. 사진 버튼은 본문이 아니라 하단 64px 썸네일 줄(`imageUrls`)에 추가. HTML 붙여넣기만 본문에 `![](url)` 생성 | `:1432-1488`, `:440-515`, `:518-715` |
| 동영상 | 전용 기능 없음. URL 을 한 줄에 쓰면 상세에서 임베드(렌더 시 판정) | `lib/community/post-media-embed.ts:108-132` |
| 등록 | `images` = 본문에 `![]()` 가 있으면 본문 URL **만**(첨부 폐기 → **CM-P1-02**), 없으면 `imageUrls`. 업로드 중에도 등록 가능(**CM-P2-07**) | `:868-878`, `:1100-1101` |
| 서버 | `POST /api/community/neighborhood-posts`: 제목·본문 필수, 주제 `is_active AND is_visible` 검증, `images` 는 http(s) 최대 10, `thumbnail_url` 미설정. `is_question` 은 slug=`question` 하드코딩 | `route.ts:110-137,261-271,378` |
| 등록 후 | **상세가 아니라 피드**로 `router.replace` (`topic`, 최신순). persistent 피드 세션 캐시 미무효화 | `:939,983-1003` |
| 수정 | 풀페이지, DB `content`·`images` 원문 주입. 원 주제가 숨김·비활성이면 **첫 주제로 조용히 변경 후 저장**(**CM-P2-09**). 저장 후 상세로 이동 | `app/(main)/philife/write/page.tsx:54-62`, `:284-291,789` |

### A-2. 본문 데이터 계약 (전부)

- `content`: **평문 + 독립 줄 `![alt](url)`**. 굵게·제목·목록·링크 문법 없음. 줄바꿈 `\n`, 빈 줄 `\n\n`, 화면은 `whitespace-pre-wrap`.
- 영상: 한 줄에 URL 1개(+40자 이하 라벨)면 YouTube/Vimeo/mp4 플레이어 — 저장값 변경 없이 렌더 시 판정.
- 해시태그: `#태그` 렌더·검색 시 평문에서 추출 (`topic-feed-skin.ts:42-55`, 검색은 `content` ilike).
- `summary`: DB 트리거가 `content` 에서 이미지 문법·스토리지 URL 제거 후 160자 (`20261025180000_…ssot.sql:8-62`). **HTML 태그는 제거하지 않음** → 본문에 HTML 을 저장하면 요약·검색·썸네일이 모두 깨진다.
- `images`: URL 배열(최대 10), 피드 썸네일 `images[0]`. `community_post_images` 는 미러.
- `content_blocks`: imported 전용(p·h·ul·ol·quote·table·img·link). imported 글도 `content` 에 평문+`![]()` 를 함께 저장.
- 상세 렌더 분기 (`CommunityPostDetailBody.tsx:27-29`): imported+blocks → `ImportedRichContent` / 본문에 `![](http…)` → 교차 렌더(갤러리 숨김) / 그 외 → 평문 + 하단 갤러리.

### A-3. 관리자

- 관리자 본문 편집 = `<textarea>` (`AdminCommunityPostDetailPage.tsx:519-528`), imported 는 블록 편집기.
- 관리자 PATCH 는 `content` 만 갱신, **`images`·`thumbnail_url`·`community_post_images` 미동기화** (`community-post-admin-patch.ts` 에 해당 컬럼 참조 0건) — 기존 차이(CM-W-07).
- 리비전 트리거는 title·content·content_blocks·topic 변경 시 이전 값 저장(`images` 미포함), **복구 API·UI 없음**.

---

## B. 레거시·기존 설계와의 차이

| 항목 | 레거시(e0c038e9f 이전 `CommunityWriteFormClient`) | 현재 | 판정 |
|---|---|---|---|
| 주제 「질문」 | 주제별 `allow_question` 체크박스 | slug=`question` 하드코딩, `allow_question` 무시, PATCH 가 `is_question` 미갱신 | CM-W-03 (개선) |
| 모임 | 글쓰기에서 장소·일시 | 메신저 오픈그룹으로 이전 | 의도된 변경 |
| 등록 레이트리밋 | 8/분 | 일 50건만 | CM-P3-16 |
| 임시저장 | 없음 | 없음 | 선택 개선 |
| 정렬 전용 주제 | — | 글쓰기 제외 규칙이 `is_feed_sort` 인자를 무시(slug 3개만 제외) | CM-W-02 (결함, 현재 운영 영향 없음: 정렬 주제는 `recommended` 1개로 slug 규칙에 걸림) |

---

## C. 개선할 글쓰기·주제 선택 프로세스

```
커뮤니티 홈
  └ 글쓰기(연필 / 빈 피드 CTA)
       │  홈에서 특정 주제 탭을 보고 있었다 → 그 주제를 「미리 선택」한 채 2단계로
       │  「전체」·「추천」·정렬 탭이었다      → 1단계부터
       ▼
  [1단계] 주제 선택  (같은 바텀시트 안 · 새 라우트 없음)
       운영 중 주제 목록(관리자 설정 순서) · 하나 선택(라디오) · 선택 즉시 2단계
       ▼
  [2단계] 글쓰기
       상단: [선택한 주제 ▼ 변경]  → 누르면 1단계로(본문·이미지 그대로)
       제목 / 본문(WYSIWYG: 글과 사진을 원하는 위치에) / 하단 도구: [사진] [링크·동영상]
       등록 버튼: 제목·본문·주제가 있고 업로드 진행·실패 이미지가 없을 때만 활성
       ▼
  [3단계] 등록 → 게시글 상세(/philife/:id, replace) → 뒤로가기 시 해당 주제 피드(새 글 반영)
```

설계 규칙
1. **주제 SSOT = 관리자 `community_topics`** (`is_active AND is_visible`, `sort_order`). 글쓰기 목록은 기존 `buildPhilifeWriteTopicOptionsFromTopics` 한 곳에서만 만들고 `is_feed_sort=true`·`allow_meetup=true` 주제를 제외(CM-W-02 수정). 하드코딩 추가 없음.
2. **미선택 상태 허용**: `writeTopics[0]` 자동 선택 삭제. 주제 없이 2단계로 갈 수 없다.
3. **주제 변경은 상태만 변경**: 풀페이지의 `router.replace(?category=)` 와 주제 목록 재요청을 없앤다(로딩 깜빡임 제거). 목록은 시트를 열 때 1회 로드.
4. **라벨에서 slug 제거**: `name`(언어별 `name_en`)만 표시.
5. **수정 모드**: 원 주제를 항상 표시. 원 주제가 숨김·비활성이면 「현재 주제(운영 중지)」로 읽기 전용 표시하고, 회원이 다른 주제를 직접 고르지 않는 한 **PATCH 에 category 를 보내지 않는다** → 서버는 기존 `topic_id` 유지(**CM-P2-09** 해결). 서버 PATCH 의 「category 필수」를 「category 생략 시 유지」로 변경.
6. **신규 작성 제한**: 숨김·비활성 주제로의 신규 등록은 서버가 이미 400 거부(정상, 유지). 관리자가 주제를 끄는 순간 열린 시트는 등록 시 400 → 「선택한 주제가 운영 중지되었습니다. 다른 주제를 선택해 주세요」 안내 후 1단계로.
7. **주제별 작성 권한**: 현재 테이블에 권한 컬럼이 없다. 「관리자 전용 주제」가 필요하면 DB 컬럼 추가가 필요하므로 **이번 범위에서 제외(선택 개선, 별도 승인)**.
8. **등록 후 상세로 이동**(CM-W-05): Owner 프로세스 「등록 → 상세 → 목록 반영」에 맞춘다. persistent 피드 세션 캐시도 무효화(CM-W-06).

---

## D. 회원 화면 단계별 UI

모든 버튼은 기존 글쓰기 푸터(`PhilifeWriteActionFooter`)·`rounded-ui-rect`·`bg-signature` 계열을 재사용하고 새 디자인 체계를 만들지 않는다. 헤더·바텀 내비 SSOT 무변경(시트는 기존처럼 `fullscreen-workflow` 로 내비를 가림).

| 화면 | 구성 | 상태·피드백 |
|---|---|---|
| 1단계 주제 선택 | 시트 제목 「주제 선택」, 주제 목록(아이콘·이름, 행 높이 ≥48px), 선택 시 체크 + 활성 배경 | 로딩 스켈레톤 / 0개면 「운영 중인 주제가 없습니다」 / 오류 시 재시도 |
| 2단계 글쓰기 | 상단 주제 칩 「여행정보 ▼」, 제목 input(서버 최대 길이와 동일 `maxLength`), 본문 편집기(최소 높이, 키보드 위로 커서 유지 — 기존 `useFormKeyboardViewport` 재사용), 하단 도구줄 [사진] [링크·동영상] + 「사진 n/10」 | 업로드 중 이미지: 본문 안 회색 자리표시 + 진행 표시 / 실패: 빨간 테두리 + [다시 시도] [삭제] |
| 이미지 블록 | 본문 폭 맞춤 미리보기, 탭하면 선택 테두리 + [삭제] [위로] [아래로] | 삭제 후 실행 취소(Undo) 가능 |
| 링크·동영상 | URL 입력 시트 → 커서 위치에 독립 줄로 삽입. YouTube·Vimeo·mp4 는 편집기 안에서 「동영상」 카드로 표시(저장값은 URL 한 줄) | 지원하지 않는 URL 은 일반 링크 줄 |
| 푸터 | [취소] [등록] — 등록 비활성 조건: 주제 없음·제목 없음·본문 없음·업로드 중·실패 이미지 존재·제출 중 | 비활성 이유를 버튼 위 한 줄 안내 |
| 이탈 | 하드웨어·브라우저·스와이프 뒤로가기 → 내용이 있으면 확인창(`useOverlayHardwareBack` + 풀페이지 history guard) | 확인 시 닫기, 업로드된 미사용 이미지는 GC 대상 |
| 등록 성공 | 시트 닫힘 → 상세 `replace` | 실패 시 입력 유지 + 푸터 오류 + 재시도 |

모바일·태블릿은 FD5 hard-lock 대로 단일 페이지·같은 흐름(좌우 분할 없음).

---

## E. 편집기 기술 결정

### E-1. 비교

| 항목 | A. textarea + 마크다운 개선 | B. 자체 contenteditable | **C. Tiptap(ProseMirror) 헤드리스** | C'. Lexical |
|---|---|---|---|---|
| 본문 안 이미지 표시 | **불가**(목표 미충족). 미리보기 분리만 가능 | 가능 | 가능 (노드뷰) | 가능 (DecoratorNode) |
| 기존 데이터 호환 | 그대로 | 변환층 직접 작성 | 변환층 작성 (스키마가 문단·줄바꿈·이미지뿐이라 단순) | 변환층 작성 |
| 이미지 삽입·삭제·이동 | 텍스트 편집 | 직접 구현(선택·커서 버그 위험 큼) | 트랜잭션 단위 삽입, 노드 이동 명령 | 가능 |
| 한글 IME / Android WebView | 안정(현재) | **고위험** — composition·Gboard 버그를 직접 처리 | DOM 변경 관찰 방식, 모바일·IME 실사용 이력이 가장 길다 | `beforeinput` 의존, Android 조합 입력 이슈 이력 |
| iOS WebView | 안정 | 고위험 | 양호(알려진 이슈는 커뮤니티 해법 존재) | 양호 |
| 붙여넣기 | 현재 HTML→마크다운 변환기 | 직접 | `transformPastedHTML`/`handlePaste` 에 **기존 `interleavedMarkdownFromPastedHtml` 재사용** | 가능 |
| Undo/Redo | 브라우저 기본(불안정) | 직접 | history 확장 | 내장 |
| XSS | 텍스트라 안전 | 직접 정화 필요 | 스키마 밖 노드는 파싱 단계에서 버려짐 + **저장은 평문 직렬화**라 HTML 미저장 | 동일 |
| 관리자 호환 | 동일 | 동일 | 저장 형식 불변 → 관리자 textarea 그대로 | 동일 |
| 번들 | 0 | 소 | 예상 60~90KB gzip(core+pm+최소 확장, **실측 NOT_PROVEN**) — 글쓰기 시트에서만 동적 로드, 피드 hot path 영향 없음 | 예상 30~50KB |
| 유지보수 | 낮음 | **높음** | 중 (외부 엔진, 버전 고정) | 중 |
| 접근성 | 양호 | 직접 | contenteditable + role 지정 | 양호 |
| 라이선스 | — | — | MIT (Pro 확장 미사용) | MIT |

### E-2. 권장안: **C. Tiptap(ProseMirror) 헤드리스, 최소 스키마**

- 근거: ① 목표(본문 안 이미지)를 충족하는 안 중 Android WebView 한글 조합 입력 실사용 이력이 가장 길다 ② 스키마를 `doc > (paragraph | image)*`, `paragraph > (text | hardBreak)*` 로 제한하면 변환층이 단순하고 저장 형식을 바꿀 필요가 없다 ③ 붙여넣기에 기존 변환기를 그대로 연결할 수 있다.
- 사용하지 않는 것: 굵게·제목·목록·표·서식(회원 본문 계약에 없음 → 추가하면 저장 형식 변경이 필요하므로 제외), Tiptap Pro/Cloud, 협업.
- 대안 단점: A 는 목표 미충족(단, HARD GATE 실패 시 A 개선안 = 현재 결함 수정 + 썸네일 줄 대신 본문 순서 미리보기로 후퇴). B 는 IME·선택 버그를 자체 유지해야 함. C' 는 Android 조합 입력 리스크가 상대적으로 큼.
- 이 판단은 공개된 사례 기반이며 **이 앱 WebView 에서의 동작은 NOT_PROVEN** → G-HARD GATE 2 로 검증.

### E-3. 변환층 (편집기 ↔ 기존 `content`)

- **파싱(열기)**: 기존 `parseInterleavedMarkdownToSegments` 로 text/img 조각 분리 → text 는 `\n` 기준으로 줄마다 paragraph(빈 줄 = 빈 paragraph) → img 는 image 노드.
- **직렬화(저장)**: paragraph 를 `\n` 으로 잇고, image 노드는 앞뒤 빈 줄을 둔 독립 줄 `![](url)` 로 출력. 영상·링크·해시태그는 평문 그대로.
- **무변경 보장**: 편집기 문서가 열 때와 같으면(편집 없음) **원문 `content` 문자열을 그대로 전송** — 공백 정규화로 인한 리비전·summary 변경 없음.
- 변환 불가 콘텐츠: 회원 편집 대상에는 존재하지 않음(imported 는 403). 방어 규칙: 파싱 결과를 다시 직렬화해 원문과 **이미지 URL 순서·텍스트(공백 제외)** 가 다르면 WYSIWYG 대신 기존 textarea 편집기로 연다(조용한 변형 금지).

---

## F. 데이터 호환성 검증표 (HARD GATE 1)

운영 DB 실측(2026-10-22, 123건):

| 글 유형 | 운영 건수 | 새 편집기로 열기 | 글자만 수정 후 저장 | 재조회 순서 | 썸네일 | 판정 |
|---|---|---|---|---|---|---|
| 회원 · 평문(이미지 없음) | 7 (최대 55자) | 문단으로 표시 | 평문 직렬화, 무편집 시 원문 그대로 | 동일 | 없음 → 없음 | 설계상 PASS (테스트로 확정) |
| 회원 · 갤러리 이미지만(`images` 有, 본문 `![]` 無) | 0 | `images` 를 본문 끝 이미지 노드로 배치 | 저장 시 본문 끝 `![]()` 로 직렬화 → 상세가 갤러리 → 교차 렌더로 바뀜(내용·순서 동일, 표시 형태만 변경) | 동일 | `images[0]` 유지 | 영향 0건, 표시 변경 보고 |
| 회원 · 교차 본문(HTML 붙여넣기 글) | 0 | 이미지 위치 그대로 | 순서 보존, 이미지 앞뒤 빈 줄만 정규화 가능(렌더 동일) | 동일 | 첫 본문 이미지 | 영향 0건 |
| 회원 · 본문 이미지 + 별도 첨부(CM-P1-02 피해 글) | 0 | 본문 이미지 + 누락 첨부를 끝에 | — | — | — | 영향 0건 |
| imported (blocks 有 70 / 無 46) | 116 | **회원 편집 불가(403) — 변경 없음** | 관리자: 기존 blocks 편집기·textarea 그대로 | — | 기존 규칙 | 무영향 |
| 외부 핫링크 이미지 글 | 15 (전부 imported) | 회원 편집 대상 아님 | — | — | — | 무영향 |
| 삭제·숨김 글 | 12 | 회원 수정 차단 유지(deleted), hidden 정책은 CM-P3-09 | — | — | — | 무변경 |

10개 필수 검증 항목 판정:

| # | 항목 | 설계 판정 | 증명 방법 |
|---|---|---|---|
| 1 | 기존 글을 새 편집기로 열 수 있는가 | 회원 글 전부 가능(평문·`![]()` 만 존재) | 왕복 테스트 |
| 2 | 텍스트·이미지 순서 유지 | 변환층이 조각 순서 그대로 | 왕복 테스트 |
| 3 | 글자만 수정해도 이미지 보존 | 이미지 노드는 텍스트 편집과 독립, `images` 는 서버가 본문에서 파생 | 단위·E2E |
| 4 | 저장 후 재조회 순서 동일 | 직렬화 → 파싱 왕복 동일 | 왕복 테스트 |
| 5 | 목록 썸네일 유지 | `images[0]` = 첫 본문 이미지(아래 G-3) | API 테스트 |
| 6 | imported 구조 손상 없음 | 회원 편집 403 유지, 관리자 경로 무변경 | 기존 테스트 유지 |
| 7 | 관리자 엔진 처리 가능 | 저장 형식 불변 → 관리자 textarea 그대로 편집 가능 | 기존 테스트 + 수동 |
| 8 | 리비전 기록·복구 | 기록: 트리거 그대로(형식 불변). 복구: **기존에도 기능 없음**(신규 요구 시 별도) | — |
| 9 | 구버전 웹 클라이언트 | 앱 WebView 는 원격 `https://samarket.vercel.app` 로드(로컬 `capacitor.config.json`) → 새로고침 시 새 번들. 캐시된 구 번들은 기존 `images` 배열을 계속 보내므로 서버는 **본문 이미지 ∪ 클라이언트 첨부** 합집합 규칙으로 양쪽 수용. 설치 바이너리의 local-runtime 모드 여부는 NOT_PROVEN | 서버 테스트 |
| 10 | 이미지 URL·Storage 참조 유지 | URL 문자열 그대로 보존, 업로드 경로·버킷 불변 | 왕복 테스트 |

왕복 테스트: 구현 단계에서 **운영 글 123건을 읽기 전용으로 내려받아 로컬에서만** 파싱→직렬화 비교(저장소에 운영 데이터 커밋 금지), 결과 수치 보고. 회원 글 7건 100% 일치, imported 116건은 「편집기 대상 아님」 판정 + 참고용 일치율.

---

## G. 이미지 · 본문 · 썸네일 · Storage

### G-1. 단일 원천 규칙
- **본문(편집기 문서)이 이미지의 유일한 원천.** 사진 버튼·클립보드 이미지·HTML 붙여넣기 모두 **커서 위치에 이미지 노드로 삽입**한다. 하단 64px 첨부 줄은 없앤다 → 본문과 첨부가 따로 놀아 사진이 사라지는 **CM-P1-02 의 구조적 원인 제거**.
- 서버(POST·PATCH, 회원 native 글): `images = (본문 http(s) 이미지 URL, 순서대로) ∪ (요청 images 중 본문에 없는 것)`, 최대 10 — **초과 시 조용히 자르지 않고 400 「사진은 10장까지」**(편집기도 10장에서 사진 버튼 비활성). 구 클라이언트 호환을 위해 합집합 유지.
- 서버 호스트 제한: 회원 글의 본문·`images` 이미지 URL 은 `post-images` 공개 URL 만 허용, `data:`·외부 URL 은 400(**CM-P2-11**). imported·관리자 경로는 제외.

### G-2. 입력 경로별 처리

| 경로 | 처리 | 실패 시 |
|---|---|---|
| 파일 선택·모바일 사진(여러 장) | 선택 순서대로 커서 위치에 자리표시 노드 삽입 → 클라이언트 리사이즈(긴 변 2048, JPEG q0.85; HEIC 는 브라우저 디코딩 가능 시 변환, 불가 시 원본 업로드 시도) → `upload-image` | 노드 「실패」 상태 + [다시 시도][삭제], 이미 성공한 사진은 유지 (**CM-P1-03**) |
| 클립보드 이미지 파일 | 동일 | 동일 |
| 외부 웹페이지 이미지 / HTML+이미지 붙여넣기 | 기존 `interleavedMarkdownFromPastedHtml` 로 텍스트+이미지 조각 → 텍스트는 문단, 이미지는 자리표시 노드(원본 URL 은 노드 내부 속성에만 보관) → 서버 `upload-image-from-url` 재호스팅 | 실패 노드는 외부 URL 로 저장되지 않음 — 등록 차단, 사용자가 삭제 또는 재시도 |
| data URI | blob 변환 후 `upload-image` | 동일 |
| 링크 붙여넣기 | 일반 링크 텍스트로 삽입. **OG 대표 이미지 자동 첨부는 하지 않음**(CM-P3-17) — 원하면 도구줄에서 명시 선택(선택 개선) | — |
| 업로드 중 입력 | 편집기 트랜잭션이 노드 위치를 추적 → 업로드 완료 시 해당 노드만 갱신, 사용자가 그 사이 입력한 글자 보존 (**CM-P2-08**) | — |

등록 버튼: 업로드 중·실패 노드가 하나라도 있으면 비활성(**CM-P2-07**). 제출 시 서버 저장 성공 후에만 상세 이동, 이동 완료 전 버튼 재활성 금지(**CM-P3-16** 일부).

### G-3. 대표 썸네일 단일 규칙
- `images[0]` = **본문에서 가장 먼저 나오는 이미지** (서버 파생). 순서 변경·첫 이미지 삭제·수정 시 자동 재계산.
- `thumbnail_url` 은 회원 경로에서 계속 쓰지 않는다(현행 유지, 피드 동네 썸네일은 `images[0]` 기준).
- 이미지 없는 글: 썸네일 없음(현행).
- 피드 API 는 본문 대신 summary 를 내려 본문 추출 폴백이 사실상 동작하지 않는다 → 서버 파생으로 `images` 가 항상 본문과 일치하므로 폴백 불필요.
- 기존 규칙과의 차이: 「첨부 첫 장」 → 「본문 첫 이미지」. 회원 글 중 이미지 글이 0건이라 기존 데이터 영향 없음.

### G-4. Storage 참조 무결성
- 업로드는 지금처럼 즉시(`{uid}/community/{uuid}.webp`). 버킷·경로 불변. **메신저가 쓰는 `{uid}/community/messenger-*` 하위 경로는 읽지도 지우지도 않음.**
- 글 수정 중 이미지 제거·등록 취소·업로드 후 이탈: **즉시 삭제하지 않는다**(리비전이 옛 본문 URL 을 참조할 수 있음). 고아는 감사 단계 6(CM-P2-12) GC dry-run 이 탐지 — 참조 집합 = `community_posts`(전 status: images·content·content_blocks·thumbnail_url) + `community_post_images` + `community_post_revisions` + `meetings.cover_image_url`, 24h 미만 보존, 메신저 하위 폴더 제외. 실제 삭제는 별도 Owner 승인.
- 다른 글 이미지 재사용: 회원 경로는 본인 폴더 URL 만 허용(G-1) → 교차 참조 신규 발생 차단. 관리자 영구 삭제의 참조 검사(CM-P2-13)는 감사 단계 4 에서.
- `community_post_images` 미러 갱신은 POST·PATCH 를 RPC 한 트랜잭션으로(CM-P3-02, 선택 — DB 함수 추가가 필요하므로 별도 승인; 미채택 시 현행 delete→insert 유지).

---

## H. 회원·관리자 영향

| 대상 | 변경 | 비변경 |
|---|---|---|
| 회원 작성·수정 | 새 편집기(플래그), 주제 단계, 서버 `images` 파생·호스트 제한·category 생략 허용 | 소유권·제재·금칙어·길이·일일 한도·포인트 원장(`evaluateCommunityPostAcceptance`·`applyCommunityPointRewardOnPostWrite`) |
| 관리자 | **화면 변경 없음**. 관리자 PATCH 에 같은 「본문→images 파생」 헬퍼를 native 글에만 적용하는 것은 **선택**(CM-W-07) — 미적용 시 현행 유지 | 관리자 엔진 m1~m10(CAS·사유·리비전·감사·고정·영구삭제), blocks 편집기, 이미지 삭제 헬퍼 |
| 저장 규칙 일치 | 회원·관리자 모두 `content` = 평문+`![]()` 동일 형식 → 서로 다른 데이터 저장 충돌 없음 | |
| 리비전 | 형식 불변이라 기록 그대로 | 복구 기능 없음(현행) |

---

## I. 모바일·태블릿 (HARD GATE 2)

- 네이티브 플러그인 변경 **불필요** — 웹 편집기만으로 구현(키보드 inset 은 기존 `window.samarketShell` 계약·`useFormKeyboardViewport` 재사용, `@capacitor/keyboard` 없음).
- 「웹 구현 가능」과 「WebView 실동작」을 구분: 아래는 실기기 PASS 전 NOT_PROVEN.

| 시나리오 | Samsung Android 폰 | Xiaomi Android 태블릿 | iPhone 14 Pro Max | 웹 |
|---|---|---|---|---|
| 한글 조합 중 커서 이동·자모 분리 없음 | | | | |
| 문장 중간 커서에 사진 삽입 → 커서가 이미지 다음 문단 | | | | |
| 사진 삽입 후 키보드가 커서를 가리지 않음 | | | | |
| 이미지 선택·삭제·위/아래 이동, Undo | | | | |
| 외부 기사 HTML 붙여넣기(이미지 3장) 순서 | | | | |
| 업로드 중 계속 입력 → 글자 보존 | | | | |
| 6MB·HEIC 사진 | | | | |
| 긴 글(5,000자+ 이미지 10장) 스크롤·입력 지연 | | | | |
| 하드웨어·스와이프 뒤로가기 확인창 | | | | |
| 등록 버튼 연타 → 1건만 생성 | | | | |
| 주제 변경 시 본문·이미지 보존 | | | | |
| 기존 글 수정 → 무편집 저장 시 원문 동일 | | | | |

GATE 실패 시: 해당 플랫폼에서 플래그로 기존 textarea 편집기(결함 수정본)를 사용.

---

## J. 실제 결함 vs 선택 개선

| 구분 | ID | 이 설계에서의 처리 |
|---|---|---|
| 확정 결함 | **CM-P1-02** 사진 누락 | 본문 단일 원천 + 서버 합집합 |
| 확정 결함 | **CM-P1-03** 업로드 실패 무음·압축 없음 | 노드별 상태·재시도·리사이즈 |
| 확정 결함 | **CM-P2-07** 업로드 중 등록 | 등록 비활성 |
| 확정 결함 | **CM-P2-08** 붙여넣기 중 타이핑 덮어씀 | 트랜잭션 위치 추적 |
| 확정 결함 | **CM-P2-09** 수정 시 주제 자동 변경 | category 생략 시 유지 |
| 확정 결함 | **CM-P2-10** 뒤로가기 소실 | overlay back + history guard |
| 확정 결함 | **CM-P2-11** 외부 핫링크 저장 | 회원 경로 호스트 제한, 실패 노드 등록 차단 |
| 확정 결함(신규) | **CM-W-02** 정렬 주제 제외 규칙이 `is_feed_sort` 무시 | 규칙 수정(현재 운영 영향 0) |
| 확정 결함(신규) | **CM-W-06** 등록 후 persistent 피드 캐시 미무효화 | 무효화 추가 |
| 프로세스 개선(Owner 요구) | **CM-W-01** 주제 자동 선택·slug 라벨 노출 | 1단계 주제 선택, 이름만 표시 |
| 프로세스 개선(Owner 요구) | **CM-W-05** 등록 후 피드로 이동 | 상세로 이동 |
| 선택 개선 | **CM-W-03** `allow_question` 무시·PATCH `is_question` 미갱신 | 채택 시 서버 2곳 |
| 선택 개선 | **CM-W-04** 풀페이지 주제 변경 시 URL 교체·재요청 | 상태만 변경(C-3) |
| 선택 개선 | **CM-W-07** 관리자 PATCH `images` 미동기화 | 헬퍼 재사용 여부 결정 |
| 선택 개선 | 임시저장(자동 저장), 링크 OG 이미지 수동 첨부, 주제별 작성 권한, 리비전 복구, `community_post_images` RPC 원자화(CM-P3-02) | 각각 별도 승인 |
| 관련·별도 단계 | CM-P2-12 GC, CM-P2-13 영구삭제 참조검사, CM-P3-16 서버 레이트리밋 | 감사 승인안 G-1 단계 4·6 |

---

## K. 최종 구현 승인안

### K-1. 변경 파일 (예상)

| 영역 | 파일 |
|---|---|
| 편집기(신규) | `components/philife/write-editor/*` (Tiptap 래퍼·이미지 노드뷰·도구줄), `lib/philife/write-editor/content-codec.ts`(파싱·직렬화·무변경 판정) + 테스트 |
| 글쓰기 폼 | `components/philife/PhilifeNeighborhoodWriteForm.tsx`(편집기·주제 단계·등록 조건·이동), `PhilifeWriteBottomSheet.tsx`(단계·뒤로가기), `contexts/PhilifeWriteSheetContext.tsx`, `PhilifeWriteActionFooter.tsx`, `WriteScreenTier1Sync.tsx`(history guard), `app/(main)/philife/write/page.tsx`(수정 모드 주제 전달) |
| 주제 | `lib/neighborhood/philife-topic-slug-rules.ts`(is_feed_sort), `lib/philife/philife-write-topic-label.ts`(slug 제거), `lib/i18n/catalog/philife.ts` |
| 서버 | `app/api/community/neighborhood-posts/route.ts`, `[postId]/route.ts`(images 파생·호스트 제한·10장 400·category 생략 유지), 공용 `lib/philife/derive-post-images-from-content.ts` |
| 업로드 | `lib/philife/client-image-resize.ts`(신규), 업로드 오류 처리 |
| 캐시 | `invalidateCommunityAuthorPostsClientCaches` 에 persistent 피드 캐시 추가 |
| 플래그 | 기존 관리자 설정 저장소(`admin_settings` 의 커뮤니티 ops JSON) 키 1개 또는 env — DB 스키마 변경 없음 |
| 계약 테스트 갱신 | `philife-write-category-dropdown-contract.test.ts`, `community-p1-divergence-contracts.test.ts` 등 WriteForm 문자열 계약 |

### K-2. 요약

| 항목 | 내용 |
|---|---|
| 신규 의존성 | **필요** — `@tiptap/core`, `@tiptap/pm`, `@tiptap/react` + 최소 확장(document·paragraph·text·hard-break·history·placeholder), 버전 고정, MIT. 글쓰기에서만 동적 import |
| DB 변경 | **없음** (마이그레이션·RLS·트리거 무변경). 선택 개선 채택 시에만(작성 권한 컬럼·RPC) 별도 |
| 기존 데이터 변환·백필 | **없음** |
| 웹 / 네이티브 | 웹만. 네이티브·Capacitor·버전 번호 무변경 (`[배포 구분]` 웹) |
| 회귀 위험 | 중 — 글쓰기 화면 전면 교체. 완화: 플래그 + 기존 편집기 유지, 저장 형식 불변, 서버 합집합 규칙 |
| 성능 | 피드·상세 hot path 무변경, 편집기 번들은 시트 열 때 로드(실측 보고) |

### K-3. 자동화 테스트
- 변환층: 평문·빈 줄·이미지 앞뒤·연속 이미지·영상 줄·해시태그·이모지·CRLF·무변경 판정 / 운영 123건 로컬 왕복(커밋 없음).
- 서버: images 파생·합집합·10장 400·호스트 제한·imported 제외·category 생략 시 topic 유지·숨김 주제 신규 400.
- 폼: 등록 비활성 조건, 업로드 실패 노드, 주제 미선택 차단, 수정 모드 원 주제 유지, 등록 후 상세 이동, 캐시 무효화.
- 기존 테스트 유지: `post-media-embed`, `interleaved-body-markdown-paste`, `community-post-summary-authority`, 관리자 content/image 테스트, imported blocks.

### K-4. 구현 순서 (각 단계 검증 PASS 후 다음)
1. **주제 선택 단계 + 수정 모드 주제 보존 + 등록 후 상세 이동·캐시** (편집기 무관, 현 textarea 위에서) — CM-W-01·02·05·06, CM-P2-09.
2. **서버 이미지 규칙** (images 파생·합집합·호스트 제한·10장) — CM-P1-02(서버측), CM-P2-11. 현 클라이언트와 호환.
3. **현 편집기 결함 즉시 수정** (업로드 오류·압축·업로드 중 등록 차단·뒤로가기) — CM-P1-03, CM-P2-07·10. 플래그 off 시의 롤백 편집기 품질 확보.
4. **WYSIWYG 편집기 (플래그 off 로 배포)** + 변환층 + 왕복 테스트 — CM-P1-02(클라이언트)·CM-P2-08.
5. **HARD GATE**: 왕복 테스트 수치 + 실기기 3대 행렬 PASS → Owner 승인 → 플래그 on.
6. 2주 운영 후 기존 textarea 편집기 제거 여부 별도 승인.

### K-5. Owner 승인 필요 사항
1. 권장 편집기 **Tiptap(ProseMirror) 도입**(신규 의존성) 여부 — 미승인 시 K-4 1~3단계만 진행(textarea 유지·결함 수정).
2. 프로세스 변경: 「전체」에서 글쓰기 시 주제 선택 단계 필수, 등록 후 **상세**로 이동.
3. 하단 사진 첨부 줄 제거(모든 사진을 본문에 삽입) — 상세 화면에서 갤러리 대신 본문 내 이미지로 표시.
4. 회원 글 외부 이미지·`data:` URL 저장 차단(서버 400).
5. 사진 10장 초과 시 자르지 않고 등록 거부.
6. 플래그 on 시점(실기기 GATE 결과 확인 후).
7. 선택 개선 채택 여부: CM-W-03(`allow_question`), CM-W-07(관리자 images 동기화), 임시저장, 주제별 작성 권한(DB), 리비전 복구.

---

## 집계

| 항목 | 값 |
|---|---|
| 이번 설계가 해결하는 기존 결함 | 7 (CM-P1-02·03, CM-P2-07·08·09·10·11) |
| 신규 확인 결함 | 2 (CM-W-02, CM-W-06) |
| 프로세스 개선(Owner 요구) | 2 (CM-W-01, CM-W-05) |
| 선택 개선 | 3 + 5 (CM-W-03·04·07 + 임시저장·OG·작성권한·리비전 복구·RPC) |
| 기존 데이터 변환 | 0건 (회원 이미지 글 0, imported 116 회원 편집 불가) |
| DB 변경 | 0 |
| 네이티브 변경 | 0 |
| NOT_PROVEN | WebView IME·커서·키보드(3기기), 번들 실측, 설치 바이너리 local-runtime 여부, HEIC 디코딩 |
