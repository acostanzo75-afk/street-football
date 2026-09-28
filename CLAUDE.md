# CLAUDE.md — Street Football

Guidance for future Claude Code sessions working in `street-football/`.

## Product vision

A fast, arcade, **mobile-first** browser street-football game. Not a FIFA simulation.

End goal: 1v1 online multiplayer, one human per footballer, third-person camera behind
your player, small walled street arena, landscape phones, ~3-minute matches or first
to 3 goals, no goalkeepers, no bots, join via shared URL. Networking will use WebSockets
with a **server-authoritative** ball, goals, score, clock and match state.

Current milestone (1): local single-player prototype — movement, camera, ball,
dribbling assist, shooting, goals, score, resets. **No networking yet.**

## Ground rules

- **Do not make large architectural changes without explaining why.**
- **Prefer small, testable, incremental changes over broad rewrites.**
- Feel over realism: responsiveness beats physical accuracy.
- Mobile first: every feature must work with two thumbs in landscape.
- Keep dependencies minimal (three, @dimforge/rapier3d-compat, vite, typescript). No React.
- `npm run build` (which runs `tsc --noEmit`) must pass before committing.

## Architecture

```
src/
  main.ts                 bootstrap: browser-gesture blocking, touch detection, lazy-loads Game
  style.css               HUD, controls, overlays (plain CSS)
  game/
    Game.ts               composition root + main loop; implements MatchListener
    config.ts             ALL tuning constants (movement, ball, dribble, shoot, camera, match)
    types.ts              TeamId, Score, PlayerCommand
    math.ts               allocation-free angle/damping helpers
  physics/PhysicsWorld.ts Rapier init (async WASM) + fixed-timestep accumulator
  arena/
    ArenaLayout.ts        PURE DATA: dimensions, goal trigger boxes, spawn points
    Arena.ts              static colliders (buildArenaColliders) + arena visuals
    pitchTexture.ts       pitch markings / net drawn once into canvas textures
  player/
    Player.ts             physics body + sim state (position, velocity, facing)
    PlayerView.ts         primitive-built footballer model + run/kick animation
    PlayerController.ts   PlayerCommand → acceleration, turning
    BallInteraction.ts    dribble assistance + shooting (cooldown, buffer, goal assist)
  ball/Ball.ts            ball body + visual (+ see-through silhouette)
  camera/ThirdPersonCamera.ts  automatic follow camera
  input/
    KeyboardInput.ts      WASD/arrows + Space
    TouchInput.ts         pointer-event joystick + SHOOT (multitouch via pointerId)
    InputManager.ts       merges sources, camera-relative → world-space PlayerCommand
  match/MatchManager.ts   score, goal detection, phases, clock, resets (no rendering)
  render/
    GameRenderer.ts       WebGLRenderer, scene, lights, resize, DPR cap
    blobShadow.ts         cheap fake contact shadows
  ui/
    HUD.ts                score, clock, centre message (DOM)
    MobileControls.ts     joystick + SHOOT DOM/visual state
```

### Responsibilities & boundaries

| Concern | Owner | Must not |
| --- | --- | --- |
| Tuning numbers | `config.ts` | be duplicated as magic numbers elsewhere |
| Rules (score, goals, phases, clock) | `MatchManager` | touch DOM, Three.js or Rapier |
| Arena geometry facts | `ArenaLayout` | import Three.js or Rapier |
| Player motion | `PlayerController` | read input devices or the camera |
| Ball handling | `BallInteraction` | attach the ball rigidly |
| Input devices | `input/*` | touch simulation state |
| Camera | `ThirdPersonCamera` | affect simulation |
| Presentation | `*View`, `HUD`, `MobileControls`, `render/*` | own gameplay state |

### Frame / tick flow

1. `InputManager.sample(cameraYaw)` → world-space `PlayerCommand` (once per frame).
2. `PhysicsWorld.advance()` runs N fixed steps (1/60 s):
   snapshot previous state → `PlayerController` → `BallInteraction` → `world.step()` →
   read back body state → `MatchManager.fixedUpdate()`.
3. Render: entities interpolate between previous and current step with `alpha`,
   camera follows the interpolated positions, HUD updates, draw.

Simulation never depends on display frame rate. Rendering never writes simulation state.

## Multiplayer direction (design constraints to preserve)

- `PlayerCommand` (world-space move + shoot edge) is the future client→server message.
  Keep it small and free of camera/render concepts.
- `PlayerController` and `BallInteraction` are deterministic functions of
  (state, command, dt) — keep them that way so they can run on the server and for
  client-side prediction.
- `MatchManager` + `ArenaLayout` + `buildArenaColliders` are the server-authoritative
  core. They must stay free of DOM/Three.js dependencies.
- `MatchListener` is the seam where server events will later drive HUD/resets.
- Remote players will need interpolated rendering; `Player.render(alpha)` already
  separates simulated from rendered state.
- `TeamId`, spawn points and goals are defined for both `home` and `away` already.

## Coding conventions

- Strict TypeScript (see `tsconfig.json`); no `any`, explicit interfaces for shared data.
- Small focused modules; no premature abstraction (no ECS, no generic event bus).
- Comment the *why* of non-obvious decisions, not the *what*.
- No dead code, no TODO placeholders for required functionality.
- World axes: +Y up, pitch length on Z, home attacks −Z. Yaw 0 faces +Z.

## Mobile & performance priorities

- Target 60 FPS on modern phones. Pixel ratio capped at 2 (`RENDER.maxPixelRatio`).
- No shadow maps (blob shadows instead), no post-processing, Lambert materials,
  two lights, one textured plane for all pitch markings.
- Avoid allocations in the loop: reuse vectors, scratch objects, and the command object.
  (Rapier's `translation()`/`linvel()` return small objects — acceptable, don't add more.)
- HUD writes to the DOM only when values change.
- Touch: pointer events, `touch-action: none`, per-control pointer capture, large
  targets sized with `vh`-based `clamp()`, safe-area insets respected.
- Portrait on touch devices shows a rotate overlay; desktop is never blocked.

## Commands

```
npm install
npm run dev        # vite dev server (also exposed on LAN for phone testing)
npm run build      # typecheck + production build
npm run typecheck
```
