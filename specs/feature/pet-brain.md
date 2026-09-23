# Pet Brain Domain Rules

Status: Baseline

## Responsibility

Pet Brain은 한 펫의 Needs, Presence, Behavior, Personality, Relationship을 갱신하고 다음 행동을 결정한다. Browser World와 Pet Home은 이 결과를 표현할 뿐 장기 상태나 비즈니스 규칙을 따로 소유하지 않는다.

## Presence

```ts
type PresenceMode =
  | 'ROAMING'
  | 'HOME'
  | 'SLEEPING'
  | 'PAUSED'
  | 'GOING_HOME'
  | 'GOING_OUT';
```

Stable state는 ROAMING, HOME, SLEEPING, PAUSED이고 transition state는 GOING_HOME, GOING_OUT이다. GOING_HOME 중 CALL_HOME처럼 현재 transition과 중복되는 명령은 무시한다.

## Behavior Catalog

First Playable browser behavior:

- Autonomous: IDLE, LOOK, WALK, SIT, SLEEP, GROOM
- Interaction: LOOK_USER, PET_REACTION, PLAY, HAPPY
- Transition: GO_HOME, COME_OUT

YAWN과 추가 행동은 기본 흐름이 안정된 뒤 넣을 수 있다. Home behavior는 required anchor를 선언한다. 예를 들어 WINDOW_WATCH는 WINDOW에서만 시작하며 `walkTo(WINDOW) → sit → window_watch` sequence를 사용한다.

## Behavior Selection

선택은 두 단계로 수행한다.

1. Presence, Need, cooldown, required anchor, Relationship 조건으로 candidate를 거른다.
2. candidate의 최종 weight로 하나를 선택한다.

```text
Final Weight =
Base Weight
× Personality Modifier
× Need Modifier
× Context Modifier
× Recent History Modifier
× Random Modifier
```

최근 행동 세 개를 저장한다. 같은 행동이 최근 한 번 있으면 기본 recent modifier는 0.50, 두 번 있으면 0.20으로 낮춘다. 같은 행동이 세 번 연속 나오는 경우는 정상 경로에서 사실상 발생하지 않아야 한다.

Random source는 호출자가 주입한다. Production은 비결정적 RNG를 사용할 수 있지만 test는 seeded RNG로 동일 상태와 입력을 재현해야 한다.

## Behavior Timing

기본 범위는 configuration으로 관리한다.

- IDLE: 3~12초
- SIT: 8~30초
- WINDOW_WATCH: 15~60초
- SLEEP: 30초~수분

펫은 계속 움직이지 않는다. 느긋한 성격은 특정 행동의 속도만 늦추는 것이 아니라 아무것도 하지 않는 시간을 늘린다.

## Needs

Needs는 Satiety, Energy, Fun 세 값이며 각각 0~100으로 clamp한다. 0은 위급 상황이나 실패를 의미하지 않는다.

Zones:

- SATISFIED: 70~100
- NORMAL: 40~69
- LOW: 20~39
- VERY_LOW: 0~19

LOW부터 관련 행동의 weight와 상태 문구에 영향을 준다. VERY_LOW도 경고창이나 처벌을 발생시키지 않는다.

초기 tuning baseline은 Browser Active Hour 기준 Satiety -3/h, Fun -4/h, awake Energy -5/h다. Sleeping 중 Energy는 시간당 10~15 상당을 회복한다. 이 값은 플레이테스트용 configuration이며 제품 방향 결정이 아니다.

연속 timer loop로 감소시키지 않는다. `lastStateUpdateAt` 이후 경과 시간과 관측된 active time으로 다음 상태를 계산하고, 장시간 inactivity와 브라우저 종료를 안전하게 처리한다.

## Care Tempo

```ts
type CareTempo = 'HIGH' | 'MEDIUM' | 'LOW';
```

Care Tempo는 Needs 감소를 극단적으로 바꾸지 않는다. 사용자를 찾는 Attention Behavior의 빈도에 주로 영향을 준다.

- HIGH: 2~4 active hour 간격을 목표로 Approach/Look/Bring Toy weight를 높인다.
- MEDIUM: 6~10 active hour 간격의 기준 behavior weight를 사용한다.
- LOW: 18~24 active hour 간격을 목표로 Attention weight를 낮추고 Solo Play/Sleep weight를 높인다.

이는 notification schedule이 아니다. HIGH는 “상태가 빨리 나빠지는 펫”이 아니라 “사용자를 더 자주 찾는 펫”이어야 한다.

초기 modifier baseline:

| Behavior | HIGH | MEDIUM | LOW |
| --- | ---: | ---: | ---: |
| APPROACH_USER | 2.0 | 1.0 | 0.4 |
| LOOK_USER | 1.7 | 1.0 | 0.6 |
| BRING_TOY | 2.0 | 1.0 | baseline |
| SOLO_PLAY | baseline | 1.0 | 1.6 |
| SLEEP | baseline | 1.0 | 1.4 |

## Personality

Prototype type는 CURIOUS, LAZY, ENERGETIC지만 First Playable의 Momo는 CURIOUS만 사용한다. Weight 값은 코드에 흩어 쓰지 않고 configuration으로 둔다.

초기 baseline:

| Behavior | Curious | Lazy | Energetic |
| --- | ---: | ---: | ---: |
| Walk | 1.4 | 0.7 | 1.5 |
| Sleep | 0.8 | 1.8 | 0.6 |
| Look | 1.7 | 0.8 | 1.2 |
| Play | 1.2 | 0.6 | 1.8 |
| Groom | 1.0 | 1.4 | 0.8 |
| Approach | 1.1 | 0.7 | 1.5 |
| Rare Event | 1.3 | 0.8 | 1.4 |

INDEPENDENT, CLINGY, CALM, SHY, MISCHIEVOUS는 검증 이후 후보이며 현재 domain type에 선반영하지 않는다.

## Relationship

Relationship은 XP와 NEW_FRIEND, FAMILIAR, CLOSE, BEST_FRIEND stage로 구성하고 감소하지 않는다. 반복 petting의 XP와 Fun 보상은 빠르게 감소한다.

진행은 Level Up 화면보다 새로운 행동 발견으로 표현한다.

- NEW_FRIEND: 기본 behavior
- FAMILIAR: Cursor Follow, 사용자 근처 Sleep
- CLOSE: Special Greeting, Bring Toy, 더 잦은 Follow
- BEST_FRIEND: Unique Idle, Rare Greeting, Unique Home Sleep

MVP UI에는 XP progress bar를 노출하지 않는다.

## Rare Events

Rare event는 일반 behavior pool과 분리한다. 후보는 ZOOMIES, CURSOR_AMBUSH, EDGE_PEEK, DREAM_RUNNING, TAIL_CHASE, SUDDEN_STRETCH다.

매 behavior transition마다 roll하지 않는다. 10~30 active minute 간격에 eligibility를 확인하고, 그중 10~20% 정도만 실제 rare behavior를 선택하는 값을 초기 tuning baseline으로 사용한다. 정확한 확률은 사용자에게 노출하지 않는다.

## Domain API Shape

Pet Brain은 가능한 한 pure function으로 유지한다.

```ts
interface PetBrain {
  update(state: PetState, now: number): PetState;
  chooseBehavior(
    state: PetState,
    context: BehaviorContext,
    rng: RandomSource,
  ): BehaviorDecision;
  interact(state: PetState, interaction: PetInteraction): PetState;
}
```

구체적인 persistent schema와 process 간 메시지는 Runtime Architecture spec에서 정의한다.
