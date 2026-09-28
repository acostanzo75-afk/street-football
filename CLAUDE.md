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
    Arena.ts              static colliders (buildArenaColliders) + composes the views
    pitchTexture.ts       procedural canvas textures (pitch, rooftop, fence, net, signage, windows)
    view/RooftopView.ts   pitch plane, rooftop slab, parapet, floodlights, rooftop props
    view/CageView.ts      kick boards + signage, rails, posts, chain-link fence, goal banners
    view/GoalView.ts      goal frame, team base bars, net
  player/
    Player.ts             physics body + sim state (position, velocity, facing)
    PlayerView.ts         stylised procedural footballer + idle/run/dribble/kick animation
    PlayerController.ts   PlayerCommand → acceleration, turning
    BallInteraction.ts    dribble assistance + shooting (cooldown, buffer, goal assist)
  ball/
    Ball.ts               ball body + interpolated render state
    BallView.ts           stylised ball, occlusion silhouette, shadow, ground marker
  camera/ThirdPersonCamera.ts  automatic follow camera
  input/
    KeyboardInput.ts      WASD/arrows + Space
    TouchInput.ts         pointer-event joystick + SHOOT (multitouch via pointerId)
    InputManager.ts       merges sources, camera-relative → world-space PlayerCommand
  match/MatchManager.ts   score, goal detection, phases, clock, resets (no rendering)
  render/
    theme.ts              THE palette: every scene/UI colour comes from here
    materials.ts          shared toon ramp, rim-light toon materials, outline hulls
    GameRenderer.ts       WebGLRenderer, scene, lights, fog, resize, DPR cap
    Backdrop.ts           gradient sky dome + instanced skyline rings
    blobShadow.ts         cheap fake contact shadows
  ui/
    HUD.ts                broadcast scoreboard + clock, animated centre banner (DOM)
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
| Colours | `render/theme.ts` (+ CSS vars in `style.css`) | be hard-coded in views |

### Frame / tick flow

1. `InputManager.sample(cameraYaw)` → world-space `PlayerCommand` (once per frame).
2. `PhysicsWorld.advance()` runs N fixed steps (1/60 s):
   snapshot previous state → `PlayerController` → `BallInteraction` → `world.step()` →
   read back body state → `MatchManager.fixedUpdate()`.
3. Render: entities interpolate between previous and current step with `alpha`,
   camera follows the interpolated positions, HUD updates, draw.

Simulation never depends on display frame rate. Rendering never writes simulation state.

## Art direction

Stylised, playful, premium arcade — never a physics demo, never realistic.

- Setting: golden-hour rooftop street cage. Layers: pitch (foreground) → boards,
  fence, goals, floodlights, rooftop props (midground) → skyline + sky (background).
- Palette discipline (`render/theme.ts`): structure is desaturated navy/slate/mauve;
  saturated colour is reserved for gameplay (team blue/coral, yellow accent, ball).
  CSS mirrors the key colours as custom properties — keep them in sync.
- Characters and ball: `toon()` materials with the shared 3-step ramp and rim light,
  plus `outlinedMesh()` hulls for strong silhouettes. Oversized head/boots.
- Environment surfaces use Lambert + procedural canvas textures; no image assets.
- Typography: Barlow Condensed (self-hosted via @fontsource), italic heavy weights.
- Before calling visual work done, screenshot a phone-landscape viewport
  (e.g. 844×390) and critique it. A passing build is not a visual acceptance test.

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
- No shadow maps (blob shadows instead), no post-processing, toon/Lambert/Basic
  materials only, two lights, one textured plane for all pitch markings.
- Budget: ~100–110 draw calls and ~14k triangles per frame (check with `?debug`).
  Use InstancedMesh / `mergeGeometries` for repeated props; merge parts that share
  a material. The player is the biggest consumer (~40 calls incl. outlines).
- Fence uses alphaTest (no transparency sorting) and dithers out near the camera.
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
# append ?debug to the URL to log fps / draw calls / triangles once per second
```
