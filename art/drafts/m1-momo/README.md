# M1 Momo Browser animation concepts

Status: draft only, generated 2026-10-05. These six transparent RGBA PNG contact sheets are **not** runtime sprites and are not referenced by the extension. The existing `idle-placeholder.webp` and its manifest remain unchanged.

## Reference and generation

- Built-in `image_gen` mode, one generation per behavior.
- Identity reference: `src/assets/pets/momo/browser/idle-placeholder.webp`.
- The generated `idle-concept.png` was an additional style/proportion reference for the other five sheets.
- Each sheet is 1254 × 1254 RGBA, visually arranged as a 2 × 2 four-pose study. Prompts requested a genuine transparent background, matching character markings/camera/scale, and no text, props or scenery.

| Behavior | Intended sequence | Review note |
| --- | --- | --- |
| Idle | calm seat → breath → blink → neutral | Identity is close to the placeholder; subtle timing remains conceptual. |
| Walk | in-place alternating step cycle | Paws and body baseline vary; not a clean loop. |
| Sit | standing crouch → lower → settle → blink | Pose change reads clearly; anchor alignment still needs correction. |
| Look | gaze forward → right → up → return | Direction changes read, but head/eye positions vary between poses. |
| Sleep | curled rest → breath → ear twitch → rest | Similar frames; breathing motion needs a deliberate timing pass. |
| Groom | seated → lick paw → cheek rub → neutral | Action reads clearly; check paw anatomy during frame cleanup. |

All sheets show some red/yellow edge fringing and/or stray alpha pixels. Some character bounds reach the cell edges. Do not split and ship them as-is. A reproducible matte/placement pass and provisional WebP frames now live in `art/exports/m1-momo/`; those candidates still require in-motion Chrome visual QA before they can satisfy the M1 animation entry condition.

## Prompt set

Shared instructions across all six calls: “Use case: stylized-concept. Asset type: Tab Pets M1 Browser animation draft contact sheet. Image 1 is the original Momo identity reference: a small orange-and-cream fluffy cat with amber eyes, white muzzle/chest/paws, and a curled fluffy tail. Create a clean 2 × 2 contact sheet with four sequential frames of the same cat in equal square cells, consistent painterly semi-realistic sprite style, full-body scale, camera, lighting, and foot baseline. Genuine transparent background; no scenery, props, borders, labels, text, watermark, or extra animals. Draft concept sheet, not a runtime atlas.” For Walk, Sit, Look, Sleep, and Groom, Image 2 was the generated Idle sheet as an additional style/proportion reference.

- Idle: calm seated pose, tiny breathing rise, slow blink, return to neutral; maintain three-quarter camera.
- Walk: three-quarter side view facing right, alternating front/rear paws in a subtle in-place walking cycle; horizontal movement will come from CSS.
- Sit: settled standing crouch, bend hind legs, lower body, settle tail, gentle blink.
- Look: body seated in place; gaze forward, eyes right, slight head tilt upward, gaze returns; body and paws unchanged.
- Sleep: curled lying-down pose, closed eyes, tiny rhythmic breathing, gentle ear twitch, return to rest; no bed or Z symbols.
- Groom: seated, lift one front paw, lick once, rub cheek, lower paw; no extra limbs.
