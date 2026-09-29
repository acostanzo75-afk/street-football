# Street Football (prototype)

A fast, arcade, mobile-first browser street-football game. You control one player
in a small walled arena with a third-person camera. The long-term goal is 1v1 online
multiplayer that you join from a shared link. This repo is at the first milestone:
a local, single-player playable prototype.

## Current milestone — 2: stylised PBR (step 1 of the quality upgrade)

The look moved to stylised PBR, using INKWAVE as the quality bar:
- soft sky lighting from an environment map baked from the procedural sky
- real-time sun shadows
- bloom and colour grading on High
- a denser city: lit windows, clouds, birds, festoon lights, a neon sign, graffiti and street props
- a far more expressive character

Quality presets Low, Medium and High are picked automatically; force one with `?quality=`.

### Milestone 1.5 — visual reset

The game is presented as a stylised golden-hour rooftop street cage:
- procedural toon-shaded footballer with outlines and idle, run, dribble and kick animation
- stylised ball
- textured turf pitch
- cage with signage boards, fencing and floodlights
- skyline backdrop
- broadcast-style HUD
- animated goal banners
- splash screen and a kickoff camera sweep

Everything is generated from code (no image assets). The colour palette is in `src/render/theme.ts`.

### Milestone 1 — local prototype

- One controllable footballer with accelerating, arcade-style movement
- Physical football (Rapier) with light dribbling assistance, never glued to the player
- Shooting with range check, cooldown, input buffering and a slight bend toward goal
- Compact street arena: boards, invisible cage walls/ceiling, two team-coloured goals
- Goal detection, GOAL message, kickoff reset, first to 3 / 3-minute clock, then score reset
- Automatic third-person camera (no manual camera control)
- Mobile touch controls (floating joystick + SHOOT, multitouch) and desktop keyboard
- "Rotate your phone" overlay in portrait on touch devices

## Tech stack

TypeScript (strict) · Vite · Three.js · Rapier (`@dimforge/rapier3d-compat`) · plain DOM/CSS for UI ·
Barlow Condensed font (self-hosted via `@fontsource`).

## Setup

Requires Node.js 20.19+ (or 22+).

```bash
npm install
npm run dev      # open the printed URL; the Network URL works on a phone on the same Wi-Fi
```

Build for production:

```bash
npm run build    # runs tsc --noEmit, then vite build into dist/
npm run preview  # serve the production build
```

The build uses a relative base path, so `dist/` can be served from any sub-folder.

Add `?bot=easy|normal|hard|off` to pick the opponent's difficulty (normal by default). Add `?debug` to the URL to log fps, draw calls and triangles once per second. Add `?quality=low|medium|high` to force a render preset.

## Controls

| Action | Phone (landscape) | Desktop |
| --- | --- | --- |
| Move | Left half: floating joystick (appears under your thumb) | WASD / Arrow keys |
| Shoot | Right: SHOOT button | Space |

Movement is relative to the camera. The camera looks toward the goal you attack (red) and turns a little toward the ball.

## Architecture

```
src/
  main.ts              bootstrap
  game/                Game (composition root + loop), config (all tuning), types, math
  physics/             PhysicsWorld: Rapier init + fixed timestep
  arena/               ArenaLayout (pure data), Arena (colliders + visuals), textures
  player/              Player (body/state), PlayerView (model), PlayerController, BallInteraction
  ball/                Ball
  camera/              ThirdPersonCamera
  input/               KeyboardInput, TouchInput, InputManager
  match/               MatchManager (score, goals, phases, clock)
  render/              GameRenderer, blob shadows
  ui/                  HUD, MobileControls
```

Main ideas:

- **Fixed-timestep simulation** (60 Hz) with interpolated rendering. Physics never depends on display refresh rate.
- **Simulation and presentation are separate.** Input becomes a world-space `PlayerCommand`. The controller, ball interaction and match rules only consume commands and state. They never touch the DOM or the camera.
- **Match rules are engine-free.** `MatchManager` works on plain data (`ArenaLayout`, ball position) and reports through a `MatchListener`, so it can move to a server later.
- **All tuning is in `src/game/config.ts`.** That covers speed, acceleration, deceleration, control radius, dribble strength, max controlled-ball speed, shot speed and lift, cooldown and camera behaviour.

See `CLAUDE.md` for responsibilities, conventions and multiplayer constraints.

## Known limitations

- Offline only: you play against a bot; there's no networking and no goalkeeper.
- Fixed shot power. `BallInteraction` already takes a 0..1 power value, so a charge mechanic can be added later.
- There is no rolling resistance model. Linear and angular damping approximate it.
- If the player pins the ball against a wall or the net, Rapier can squeeze the ball out, because the player's body dominates the ball.
- The JS bundle is about 1.8 MB gzipped, mostly Rapier's WASM, which the compat package embeds as base64. The game chunk loads lazily behind a loading screen.
- No audio, no pause menu, no fullscreen request.
- There are no automated tests yet. Headless Chromium was used for manual verification.
- The skyline is built from simple instanced blocks. It works as a silhouette but is the least polished layer.
- The character has no facial animation, and all players share one body shape.

## Roadmap

1. ✅ Local prototype (this milestone)
2. Feel pass on real phones: tune `config.ts`, camera framing, haptics, sound
3. Second player entity (local, driven by a scripted/echo input) to validate 1v1 flow
4. WebSocket server: authoritative ball, goals, score, clock; clients send `PlayerCommand`
5. Remote player interpolation, local player prediction and reconciliation
6. Rooms joinable by shared URL, kickoff/ready flow, rematch
7. Variable shot power, a second action (pass or skill move), visual polish
