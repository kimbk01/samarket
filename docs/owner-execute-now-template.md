# DIBAY EXTERNAL IMPORT — CLEAN RESET → FRESH REBUILD OWNER LOCK

새 Agent 채팅에 **이 블록만** 붙여넣으세요.  
긴 설계·과거 PASS 보고서는 경로만. CURRENT PASS / salvage 근거로 쓰지 마세요.

> **최종 Owner 의도:**  
> 1. OLD External Import/Crawling **FULL DELETE** (Community core만 보존)  
> 2. 새 제품 SSOT = **FRESH PRODUCT CONTRACT** (REAL CONTENT + PREVIEW + ADMIN DECISION)  
> 3. **OLD 8-step 세로 카드 UI = FORBIDDEN** (Production `1국가…8게시` 화면 = rejected evidence)  
> 4. FULL Admin 구현 전 **실제 수집 글 운영 샘플 화면 증명 + Owner sample approval 필수**  
> 5. 오픈소스는 **도구로만** 재평가 (OLD Crawlee **구현** 삭제 ≠ 오픈소스 포기)  
>  
> “이전으로 복구 후 일부 재사용” 금지. 텍스트 wireframe/설계 승인만으로 전체 Admin 구현 금지.

## Current phase board (2026-09-14)

| Phase | Status |
|---|---|
| A Full remove + Community recovery | **PASS / LOCKED** |
| B Real-site technical proof | **PASS / LOCKED** |
| C Owner sample (`.tmp/phase-c-owner-sample/`) | **PASS / LOCKED** (Owner approved) |
| D Product design lock | **OWNER APPROVED / LOCKED** — `docs/dibay-community-external-import-phase-d-product-design-lock.md` |
| E Real Admin implementation | **OPEN** (implement D lock; not Production E2E) |
| F Production E2E | **NOT STARTED** (Owner opens after E report) |

```text
PHASE C sample approval ≠ Admin already shipped
PHASE D locks the approved sample as product contract
PHASE E implements that contract in real DIBAY Admin
PHASE F = final Production E2E authority — do not claim F during E
```

---

```text
# DIBAY EXTERNAL IMPORT — CLEAN RESET → FRESH REBUILD OWNER LOCK

EXECUTE NOW. NO PLAN MODE.
DONE = one FINAL REPORT only for the active PHASE (PASS/FAIL/NOT_PROVEN). No “almost/usable”.
DO NOT STOP mid-run for ordinary recoverable failures.
If evidence cannot prove provenance for a destructive delete,
or removal would risk Community core / unrelated work /
unapproved destructive Production DB changes:
STOP = FAIL / NOT_PROVEN.
Never guess provenance.
Never continue a destructive remove from uncertain provenance.
DO NOT redesign inside PHASE A.
DO NOT invent architecture inside PHASE A.
DO NOT claim PASS from build/deploy/API200/DB row/Admin shell/worker boot.
DO NOT start later phases until prior phase FINAL REPORT = PASS and Owner continues.
PHASE C Owner sample approval 없이 D/E/F 금지.
텍스트 wireframe/설계 승인만으로 E 진입 금지.

THIS MESSAGE = OWNER APPROVAL for PHASE A only unless later phases are explicitly started:
push / deploy verify / exclusive External Import DB removal with proven provenance /
exact QA data cleanup / Community recovery verify
NOT approval for: partial salvage, OLD worker/job/claim/adapter reuse,
replacement product build before PHASE A PASS,
Admin/UI/schema-first rebuild,
OLD 8-step card UI rebuild,
full Admin UI before PHASE C sample approval

==================================================
OWNER FINAL INTENT
==================================================
현재 External Import / Crawling 구현은 폐기한다.
기존 구현을 수정하거나,
기존 worker/job/claim/adapter/Admin 구조를 살리거나,
기존 External Import 코드를 기반으로 재설계하지 않는다.
새 구현은 FRESH PRODUCT CONTRACT가 authority다.
기존 코드/과거 PASS는 authority가 아니다.

==================================================
1. OLD PRODUCT = FULL DELETE
==================================================
DELETE COMPLETELY:
- current External Import Admin product
- current crawling architecture
- current Crawlee integration
- current worker-loop
- current job executor
- current job/claim RPC architecture
- current site adapters
- current external import APIs
- current publish bridge
- current external import libs
- current QA fixtures/scripts
- current External Import-specific DB product
- current External Import-specific Community patches

Community core는 보존한다.

KEEP:
- community_posts
- community_topics
- normal Community Admin
- Feed
- Detail
- comments
- reactions
- views
- share
- unrelated later work

NO PARTIAL SALVAGE.
이전 External Import 구현의 “PASS였던 부분”도 재사용 근거가 아니다.

==================================================
2. IMPORTANT — OPEN SOURCE INTENT
==================================================
Owner가 오픈소스를 사용하라고 한 목적은:
크롤링 기반 기술을 처음부터 직접 발명하지 말고,
검증된 오픈소스의
- HTTP request
- HTML parsing
- browser automation
- session handling
- retry
- queue
- concurrency
같은 기반 능력을 이용하라는 뜻이다.

오픈소스 자체를 제품 아키텍처로 만들라는 뜻이 아니다.

Crawlee가 다시 선택될 수도 있다.
그러나:
OLD Crawlee implementation = DELETE.
Crawlee package/library itself may be selected again ONLY
after fresh technical evaluation.

Old:
worker
job
claim
adapter
schema
Admin workflow
를 그대로 재사용해서는 안 된다.

==================================================
DIBAY EXTERNAL IMPORT — FRESH PRODUCT CONTRACT
==================================================
IMPORTANT:

OLD 8-STEP CARD UI IS FORBIDDEN.

Do NOT rebuild:

1 국가
2 사이트
3 게시판
4 범위
5 게시물
6 DIBAY 주제
7 미리보기
8 게시

as vertically stacked sections/cards.

That Production UI is rejected evidence.

==================================================
OWNER ACTUAL WORKFLOW
==================================================
The Admin product must be built around:

실제 외부 게시판 선택
→ 실제 게시물 목록 확인
→ 게시물 선택
→ 실제 원문 샘플 확인
→ 필요한 부분 수정/치환
→ 변경 결과 미리보기
→ 승인
→ DIBAY 주제 선택
→ 적용/게시

The center of the product is:

REAL CONTENT
+
PREVIEW
+
ADMIN DECISION

NOT crawler infrastructure.

==================================================
1. REAL ARTICLE LIST FIRST
==================================================
After Admin selects an actual source/site/board
and collection range:

show REAL article rows.

Required visible fields:

checkbox
thumbnail
title
author
source published date
source board/site
current import/publish state

Admin must be able to:

select one
select several
select all visible
clear selection

0 / 1 / N selection must be explicit.

Do not make empty future workflow cards occupy the page.

==================================================
2. ARTICLE SAMPLE / PREVIEW IS REQUIRED
==================================================
When Admin selects an article:

show the ACTUAL collected article sample.

The preview must include, when present:

title
author
source date
body
headings
paragraphs
lists
quotes
links
content images
gallery images
captions

Maintain original semantic order as closely as technically possible.

The Admin must see what was actually collected.

Do NOT approve/publish from title-only rows.

==================================================
3. SOURCE PRESENTATION MUST NOT BE COPIED
==================================================
Keep source CONTENT.

Do not keep source SITE PRESENTATION.

Strip:

site header
navigation
footer
ads
floating UI
avatar UI
site theme CSS
source background colors
external layout wrappers
unrelated recommendations

Keep:

article semantic content
article images
article order
actual author/date/title where available

Images should not inherit ivory/source page backgrounds.

Do not alter the image pixels merely to make them transparent.

==================================================
4. ADMIN TRANSFORM / REPLACEMENT WORKSPACE
==================================================
Admin needs a clear editing/transform workspace.

For the selected article,
show BEFORE and AFTER.

BEFORE:
actual collected source content

AFTER:
content that will appear in DIBAY

Admin must be able to inspect and explicitly decide changes.

Required operations where applicable:

- title replacement
- author display replacement
- date display confirmation
- text replacement
- unwanted block removal
- image inclusion/exclusion
- image order confirmation
- thumbnail selection
- DIBAY topic selection

Do NOT silently rewrite source content.

Do NOT automatically invent author/date/title.

==================================================
5. REPLACEMENT / TRANSFORM ACTION CONTRACT
==================================================
Every change must have an explicit operator action.

Required concepts:

미리보기
치환
적용
취소
저장
게시

Exact Korean CTA wording should be operator-friendly,
but these behaviors must exist separately.

Meaning:

미리보기
= show resulting DIBAY content without publishing

치환
= configure the requested replacement/change

적용
= apply the change to this import draft

취소
= discard unapplied change

저장
= preserve the reviewed import draft without publishing

게시
= create/update the approved DIBAY post only after explicit Admin action

Do not make “치환” automatically publish.

Do not make “저장” equal publish.

==================================================
6. APPROVAL IS PER ARTICLE
==================================================
Admin decides which imported articles are accepted.

Collection does NOT mean approval.

Preview does NOT mean approval.

Transform does NOT mean approval.

Save does NOT mean publish.

Only explicit publish action publishes.

For multiple selected articles:

Admin must still know exactly which items will publish.

No old behavior where MANUAL Publish unexpectedly publishes all collected rows.

==================================================
7. SELECTION UX
==================================================
Each article row must have a checkbox.

Required:

□ article A
□ article B
□ article C

[전체 선택]
[선택 해제]

Selected:
3개

Actions must operate on explicit selection only.

No implicit “all collected posts”.

==================================================
8. TOPIC ASSIGNMENT
==================================================
DIBAY topic belongs to the publishing decision.

Use real existing Community topic SSOT.

No free-text fallback.

No automatic 자유게시판 fallback.

No default 자유게시판.

Admin may explicitly select the target DIBAY topic.

If existing Admin topic creation is supported,
that remains a separate explicit Admin action.

==================================================
9. BEFORE / AFTER PREVIEW
==================================================
Before publishing,
Admin must be able to compare:

원문 수집 결과
vs
DIBAY 적용 결과

The DIBAY preview should approximate the actual
Community Detail rendering.

It must show:

title
author/display author
display date
body hierarchy
images
thumbnail/hero behavior

Do not show a fake mock card unrelated to actual Community rendering.

==================================================
10. IMAGE CONTRACT
==================================================
Imported content images must be visible in preview.

Site-specific extraction should exclude:

logos
avatars
navigation icons
ad images
tracking pixels
site banners
unrelated thumbnails

Article content/gallery images stay in source order.

Feed thumbnail priority must be explicitly determined
from real source capability, not guessed.

No image:
show no image area.

No fake placeholder unless Community product itself requires one.

==================================================
11. SOURCE ATTRIBUTION
==================================================
Public DIBAY Community UI:

do not show source attribution block/link
unless Owner explicitly changes this rule later.

Admin/Internal:

retain canonical source URL and provenance metadata
for operation/audit/dedupe.

Do not confuse internal provenance with public presentation.

==================================================
12. OPERATOR SCREEN PRINCIPLE
==================================================
Admin should work from real information, not steps.

Preferred functional structure:

LEFT:
source/site/board selection

CENTER:
real article list + selection

RIGHT or expandable workspace:
actual article preview
transform/replacement
DIBAY preview
topic
save/publish

The exact layout can be designed later,
but OLD 8 stacked empty cards are forbidden.

==================================================
13. REQUIRED SAMPLE BEFORE BUILD APPROVAL
==================================================
Before full Admin implementation,
show Owner an actual sample using one real source article.

The sample must demonstrate:

A. source article list row
B. selected article
C. actual collected detail
D. actual images
E. BEFORE source-normalized preview
F. AFTER DIBAY preview
G. one replacement example
H. APPLY result
I. CANCEL behavior
J. SAVE behavior
K. PUBLISH target/topic behavior

Do not proceed to full product implementation
from wireframe/text alone.

The Owner must be able to inspect
what actual imported content will look like.

FULL BUILD 전에 실제 수집 글을 이용한 운영 샘플을 화면으로 증명한다.
Owner sample approval 없이는 전체 Admin UI 구현 금지.

==================================================
14. TECHNICAL PROOF BEFORE PRODUCT BUILD
==================================================
For the first real board:

prove:

LIST extraction
DETAIL extraction
TITLE
AUTHOR
SOURCE DATE
BODY
IMAGE
IMAGE ORDER

Then demonstrate the actual Admin sample above.

Only after both are proven:

design/implement the reusable product structure.

==================================================
15. FORBIDDEN AGAIN
==================================================
Do NOT rebuild the screenshot.

Do NOT create giant numbered empty cards.

Do NOT expose:

worker
queue
RPC
adapter
crawler engine
job claim

as normal operator workflow.

Do NOT publish all collected posts.

Do NOT auto-assign a random/default topic.

Do NOT hide real article content behind a final “preview step”.

Do NOT claim product PASS because collection succeeded.

==================================================
OWNER ACCEPTANCE
==================================================
Fresh rebuild is acceptable only if Owner can visibly answer:

1. 어느 실제 게시판에서 가져왔는가?
2. 어떤 실제 글들이 들어왔는가?
3. 어떤 글을 선택했는가?
4. 선택한 실제 원문 내용은 무엇인가?
5. 이미지가 정확히 들어왔는가?
6. 무엇을 치환/삭제/수정했는가?
7. 적용 후 DIBAY에서는 어떻게 보이는가?
8. 어느 DIBAY 주제로 들어가는가?
9. 저장만 한 것인가, 게시한 것인가?
10. 정확히 선택한 게시물만 게시되는가?

하나라도 불명확하면 PRODUCT = FAIL.

==================================================
NO LEGACY RESURRECTION
==================================================
OLD External Import implementation의:
code
schema
components
adapters
worker
job contract
UI flow
가 새 코드에서 발견되면
그 이유와 필요성을 새 증거로 증명해야 한다.
“이미 구현돼 있어서”
“전에 PASS라서”
“재사용이 빨라서”
는 재사용 근거가 아니다.

==================================================
EXECUTION ORDER
==================================================
PHASE A
FULL REMOVE OLD PRODUCT
→ Production Community recovery
→ STOP / REPORT

PHASE B
Fresh technical crawling proof
→ actual site + actual board
→ LIST / DETAIL / TITLE / AUTHOR / SOURCE DATE / BODY / IMAGE / IMAGE ORDER
→ STOP / REPORT

PHASE C
실제 글 1개 운영 샘플 화면 증명
→ list row
→ selected article
→ actual collected detail
→ actual images
→ BEFORE source-normalized preview
→ AFTER DIBAY preview
→ one replacement example
→ APPLY result
→ CANCEL behavior
→ SAVE behavior
→ PUBLISH target/topic behavior
→ Owner sample approval
→ STOP / REPORT

PHASE D
샘플 승인 후 제품 설계 확정
→ STOP / APPROVAL

PHASE E
Fresh implementation
(FRESH PRODUCT CONTRACT only; no OLD 8-step UI)

PHASE F
실제 사이트 Production E2E

순서 변경 금지.
Active execution default = PHASE A only until Owner opens next phase.
PHASE C Owner sample approval 없이 PHASE D/E/F 금지.
텍스트/wireframe 설계 승인만으로 PHASE E 진입 금지.

==================================================
PHASE A SEQUENCE (no skip)
==================================================
1 PROVE BOUNDARY — classify DELETE / REVERT EXTERNAL-IMPORT DIFF ONLY / PRESERVE
2 CODE REMOVAL — no replacement
3 COMMUNITY PATCH REMOVAL — import-only diffs
4 DATABASE REMOVAL — provenance first; no name-guess broad DROP
5 DEPENDENCY CLEANUP — unused-only
6 COMMUNITY RECOVERY QA
7 COMMIT / PUSH / DEPLOY + Production SHA proof
8 FINAL REPORT for PHASE A → STOP

==================================================
FAILURE RULE
==================================================
FIRST DIVERGENCE
→ ROOT CAUSE
→ minimum removal correction (PHASE A) or minimum proof/sample correction (later phase)
→ same test retest
→ continue
Do not redesign in PHASE A.
Do not build replacement in PHASE A.
Do not rebuild OLD 8-step card UI.
Do not preserve failed code because it previously had PASS reports.
Do not skip PHASE C sample approval.

==================================================
FINAL PRINCIPLE
==================================================
OLD PRODUCT: DELETE
OLD CRAWLEE IMPLEMENTATION: DELETE
OLD 8-STEP CARD UI: FORBIDDEN
OPEN SOURCE CRAWLING TECHNOLOGY: RE-EVALUATE FRESH
COMMUNITY CORE: KEEP
NEW EXTERNAL IMPORT: BUILD FROM FRESH PRODUCT CONTRACT + OWNER INTENT,
NOT FROM OLD IMPLEMENTATION
FULL ADMIN BUILD: ONLY AFTER PHASE C OWNER SAMPLE APPROVAL

==================================================
PHASE A FINAL REPORT
==================================================
HEAD BEFORE:
HEAD AFTER:
FILES DELETED:
FILES PARTIALLY REVERTED:
FILES PRESERVED:
EXTERNAL IMPORT ADMIN: REMOVED / FAIL
EXTERNAL IMPORT ROUTES: REMOVED / FAIL
CRAWLEE IMPLEMENTATION: REMOVED / FAIL
WORKER: REMOVED / FAIL
JOB/CLAIM: REMOVED / FAIL
ADAPTERS: REMOVED / FAIL
PUBLISH BRIDGE: REMOVED / FAIL
EXTERNAL IMPORT API: REMOVED / FAIL
COMMUNITY PATCHES: REMOVED / FAIL
DB OBJECTS REMOVED: exact list
DB OBJECTS PRESERVED: exact list + reason
QA DATA CLEANUP: exact IDs
COMMUNITY ADMIN: PASS / FAIL / NOT_PROVEN
COMMUNITY FEED/DETAIL: PASS / FAIL / NOT_PROVEN
COMMIT: SHA
ORIGIN: SHA
PRODUCTION: SHA
DEPLOY: ID
EXTERNAL IMPORT PRODUCT: REMOVED / FAIL
NEW IMPLEMENTATION: NOT STARTED
SAMPLE APPROVAL: NOT STARTED
NEW ADMIN UI: NOT STARTED
PHASE B+: NOT STARTED
FINAL: PASS / FAIL / NOT_PROVEN
STOP.
```

---

## 사용 방법 (짧게)

1. **새 채팅**에 위 블록을 붙인다 → 기본 실행 = **PHASE A only**.
2. PHASE A FINAL REPORT PASS 후, Owner가 명시할 때만: **B** 기술검증 → **C** 실제 운영 샘플 + Owner sample approval → **D** 설계 확정 → **E** 구현 → **F** Production E2E.
3. PHASE C sample approval 없이 D/E/F 금지. 텍스트 설계만으로 E 금지. OLD 8-step 카드 UI 재구축 금지.

## Owner 재개 한 줄

```text
CONTINUE PHASE A from FIRST incomplete removal step. No redesign. No salvage. No OLD 8-step UI. No PHASE B+. Finish to PHASE A FINAL REPORT only.
```
