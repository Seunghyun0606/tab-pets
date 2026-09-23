# Experience Flows

Status: Baseline

## Scope and Ownership

이 문서는 사용자가 보는 화면, 행동 순서, 문구 원칙을 정의한다. 상태 계산과 행동 가중치는 `specs/feature/pet-brain.md`, 렌더링 경계는 `specs/architecture/runtime-architecture.md`가 소유한다.

## Screen Information Architecture

First Playable이 사용하는 표면은 다음 여섯 가지다.

1. Onboarding
2. Pet Selection
3. Browser World
4. Pet Quick Interaction
5. Pet Home
6. Lifestyle / Advanced Settings

Shop, Inventory, Achievement, Collection은 별도 화면을 만들지 않는다.

## Onboarding

목표는 10초 안에 “브라우저에서 같이 지낼 작은 친구”라는 제품 개념을 이해시키는 것이다.

- 한 문장의 소개와 Momo의 모습, `친구 만나기` 행동만 우선 노출한다.
- Virtual Pet, Chrome Extension, State Management, Local Storage 같은 구현 용어를 설명하지 않는다.
- 기능 목록을 먼저 읽히지 않고 직접 경험하게 한다.

## Pet Selection

Prototype에서는 Momo 한 마리만 선택 가능하다. 다중 캐릭터 단계가 열리면 이름과 생활 패턴으로 차이를 설명한다.

- Momo: 혼자서도 잘 놀지만 가끔 사용자를 찾아오는 호기심 많은 친구
- Luna: 아주 독립적이고 느긋하게 지내는 친구
- Poppy: 사용자와 자주 놀고 싶어 하는 활발한 친구

High, Medium, Low나 난이도라는 표현은 사용자에게 노출하지 않는다.

## Browser World

- Momo의 주 활동 영역은 viewport 아래쪽 약 120~220 CSS px다.
- 첫 단계의 고양이는 Normal 크기인 약 96 × 96 CSS px로 표시한다.
- 페이지 전체를 돌아다니지 않으며 콘텐츠를 오래 가리지 않는다.
- Small 0.80, Normal 1.00, Large 1.20 scale은 후속 사용자 옵션이다.
- 사용자가 개입하지 않아도 Momo가 쉬고, 걷고, 앉고, 주변을 보는 모습을 볼 수 있어야 한다.

## Quick Interaction

Momo를 클릭하면 메뉴보다 반응을 먼저 보여 준다.

1. 현재 애니메이션을 안전한 지점에서 멈춘다.
2. Momo가 사용자를 바라본다.
3. 짧은 반응 뒤 `쓰다듬기`, `놀아주기`, `집에 갈까?` Bubble을 보여 준다.
4. 선택하지 않은 Bubble은 3~4초 후 사라진다.

### Petting

`LOOK_USER → PET_REACTION → 눈 감기/꼬리 움직임/작은 하트 → IDLE` 순서로 읽혀야 한다. Fun과 Relationship 보상은 작고, 같은 행동을 연속 반복하면 보상이 빠르게 줄어든다.

### Lightweight Play

작은 Toy를 보여 주고 사용자가 좌우로 움직이면 Momo가 5~15초 동안 따라간 뒤 Happy 반응을 한다. 독립적인 미니게임이나 점수 체계는 만들지 않는다.

## Home Transition

Call Home과 Send Out은 제품의 대표 UX다.

Call Home:

1. 사용자가 `집에 갈까?`를 선택한다.
2. Momo가 사용자를 보고 짧게 응답한다.
3. 방향을 돌려 화면 가장자리까지 걷고 Browser World에서 사라진다.
4. Side Panel이 열리고 Home의 문이 열린다.
5. Momo가 들어와 Rug로 걸어간 뒤 앉는다.

Send Out:

1. 사용자가 Door를 눌러 `같이 나갈까?`에 동의한다.
2. Momo가 문으로 나간다.
3. Browser World에서 자연스럽게 다시 등장한다.

전환 중에는 같은 명령을 다시 받지 않는다. 두 공간에 Momo가 동시에 보이면 안 된다.

## Pet Home

Home 자체가 Dashboard다. 일반적인 앱 Navigation과 수치 패널은 최소화한다.

Home anchor는 Rug, Bed, Bowl, Window, Toy, Door다.

- Bowl: Momo가 다가가 먹고 Satiety를 회복한다.
- Bed: Momo가 다가가 몸을 말고 자며 Energy를 회복한다.
- Toy: 짧은 Play animation 뒤 Fun을 회복한다.
- Door: Browser World로 함께 나갈지 묻는다.

Home에서도 Momo는 anchor 사이를 이동하며 한 위치에 고정되지 않는다.

## Status Language

기본 UI는 Satiety, Energy, Fun 숫자 bar를 노출하지 않고 한 번에 자연어 상태 한 개를 보여 준다.

메시지 우선순위:

1. Special Event
2. Strong Need
3. Relationship Event
4. Current Behavior
5. Personality Ambient

예시 문구:

- Satiety가 낮음: “간식 생각이 조금 나는 것 같아요.”
- Energy가 매우 낮음: “눈이 자꾸 감기나 봐요.”
- Fun이 매우 낮음: “아까부터 장난감을 힐끔거리고 있어요.”
- 전체 상태가 좋음: “오늘은 아주 만족스러워 보여요.”

Energy와 Fun이 모두 낮다면 더 강한 Need인 Sleepy 메시지를 우선한다. 경고창이나 위기 표현은 사용하지 않는다.

## Lifestyle

Settings 대신 `어떻게 같이 지낼까요?`라는 생활 선택으로 표현한다.

- 같이 돌아다니기
- 집에서 쉬고 있기
- 오늘은 낮잠 자기
- 조용히 놀기 on/off
- 이 사이트에서는 쉬기
- 고급 설정

## Demo Scenario

첫 외부 데모는 20~30초 안에 다음을 보여 준다: 웹페이지 아래를 걷는 Momo, Cursor를 보는 순간, 클릭 반응, Call Home, 화면 밖으로 걸어가기, Side Panel의 문으로 들어오기, Bed에서 잠들기.

## Accessibility and Interference Rules

- Overlay가 키보드 focus order에 불필요하게 끼어들지 않는다.
- 실제 상호작용 요소에는 접근 가능한 이름과 focus 상태를 제공한다.
- Pet hit area 밖에서는 pointer event를 받지 않는다.
- motion preference가 reduce인 경우 이동과 transition을 단축하거나 정적인 대체 표현을 사용한다.
