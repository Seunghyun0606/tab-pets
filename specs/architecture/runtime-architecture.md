# Runtime Architecture

Status: Baseline

## System Boundaries

Tab Pets는 Pet Brain, Browser World, Pet Home, Persistence 네 경계로 나눈다.

- Pet Brain: 상태 갱신과 행동 결정의 domain logic
- Browser World: Content Script에서 펫을 렌더링하고 명시적 사용자 입력을 수집
- Pet Home: Side Panel에서 같은 펫을 Home 맥락으로 렌더링하고 돌봄 입력을 수집
- Persistence: 유일한 persistent PetState를 저장하고 schema migration을 담당

Browser World와 Pet Home은 별도 Pet entity를 만들지 않는다.

## Chrome Runtime

- Chrome Manifest V3 Extension을 사용한다.
- Service Worker는 runtime message와 저장소 접근을 조정한다.
- Browser World는 Content Script가 만든 Shadow DOM root 안에 렌더링한다.
- Pet Home은 Chrome Side Panel을 사용한다.
- 장기 상태는 `chrome.storage.local`에 저장한다.

구체적인 bundler와 package manager는 TASK-001에서 최소 구성으로 선택하고 repository command로 고정한다. 선택은 아래 runtime 계약을 바꾸지 않아야 한다.

## Source of Truth

Persistent source of truth는 schema version이 있는 단일 PetState다. 각 Content Script나 Side Panel은 독립적인 장기 사본을 소유하지 않는다.

```ts
interface PetState {
  schemaVersion: number;
  identity: {
    id: string;
    name: string;
    species: Species;
    personality: Personality;
    careTempo: CareTempo;
  };
  presence: {
    mode: PresenceMode;
  };
  needs: {
    satiety: number;
    energy: number;
    fun: number;
  };
  relationship: {
    xp: number;
    stage: RelationshipStage;
  };
  behavior: {
    current: BehaviorId;
    startedAt: number;
    recent: BehaviorId[];
  };
  position: {
    normalizedX: number;
    direction: 'LEFT' | 'RIGHT';
  };
  timestamps: {
    lastStateUpdateAt: number;
    lastInteractionAt: number;
    lastFeedAt?: number;
    lastPlayAt?: number;
  };
}
```

첫 저장 형식은 `schemaVersion: 1`이다. Repository는 없는 상태의 default 생성, 유효성 검사, atomic update, 향후 v1→v2 migration 진입점을 제공한다.

Pixel x를 저장하지 않는다. `normalizedX`는 0.0~1.0으로 clamp하고 현재 viewport에서 pixel position으로 변환한다.

## Message Contract

Content Script, Side Panel, Service Worker 사이의 메시지는 한 모듈의 discriminated union으로 정의한다. type 문자열을 여러 파일에 직접 작성하지 않는다.

초기 message family:

```ts
type PetMessage =
  | { type: 'PET_STATE_REQUEST' }
  | { type: 'PET_INTERACTION'; action: 'PET' | 'PLAY' }
  | { type: 'CALL_HOME' }
  | { type: 'SEND_OUT' }
  | { type: 'PET_STATE_UPDATED'; state: PetState };
```

새 message는 payload와 응답/오류 동작을 같은 union에 추가한다.

## Browser Renderer Boundary

Content Script의 책임:

- Shadow DOM Pet root 생성과 제거
- Pet와 animation frame 렌더링
- CSS transform 기반 position movement
- 실제 Pet hit area의 명시적 interaction 수집
- 낮은 빈도의 cursor observation

Content Script가 하지 않는 일:

- Needs와 Relationship 계산
- Behavior business rule 소유
- 장기 상태의 독립 저장
- 매 animation frame마다 host DOM layout 조회
- 웹 DOM과의 물리 충돌 계산

Overlay container는 host page와 CSS를 격리한다. 기본 container는 pointer events를 통과시키고 실제 interaction element만 pointer events를 받는다. viewport resize 시 normalized position으로 재배치하고 pet bounds를 화면 안에 clamp한다.

## Movement Runtime

Movement는 Pet World 내부 좌표를 사용한다.

```ts
interface PetPosition {
  x: number;
  groundY: number;
  direction: 'LEFT' | 'RIGHT';
}
```

Target 선택 후 Walk animation과 `translate3d()`를 시작하고 도착 시 다음 behavior로 넘긴다. Curious Cat 초기 속도는 35~45 px/sec이며 행동마다 ±10~15% 변주를 줄 수 있다. Sprite frame rate와 CSS position movement는 분리한다.

## Suggested Module Boundaries

```text
src/
├─ background/       service worker
├─ pet/model/        persistent and domain types
├─ pet/behavior/     definitions, selector, weights
├─ pet/state/        store facade
├─ browser/          content script, pet layer, cursor observer
├─ home/             Side Panel application and room
├─ messaging/        discriminated messages and bus
├─ storage/          schema, repository, migrations
├─ assets/           runtime asset imports
└─ shared/           dependency-light shared utilities
```

폴더 이름은 build tool 제약에 맞게 조정할 수 있지만 책임 방향은 유지한다.

## Verification Strategy

Unit tests:

- storage default, validation, migration seam, update serialization
- normalized position conversion and bounds
- pure Pet Brain behavior with seeded RNG
- elapsed-time calculation for offline and long inactivity

Extension smoke test는 Playwright persistent browser context를 우선 사용한다.

1. Extension load
2. local test page open
3. Pet root exists and is visible
4. Pet click exposes interaction
5. Call Home
6. presence converges to HOME

M0에서는 shell, state round-trip, static overlay까지만 자동화한다. 애니메이션의 자연스러움은 자동 판정하지 않고 제품 spec의 Human Visual QA로 넘긴다.

지원 사이트 매트릭스의 초기 10곳은 Google Search, GitHub, YouTube, Reddit, Notion public page, Wikipedia와 구조가 다른 일반 사이트 네 곳으로 구성한다. 인증, 결제, 민감 데이터 입력은 QA에 사용하지 않는다.
