import { Arena } from '../arena/Arena';
import { createArenaLayout, type ArenaLayout } from '../arena/ArenaLayout';
import { Ball } from '../ball/Ball';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import { InputManager } from '../input/InputManager';
import { KeyboardInput } from '../input/KeyboardInput';
import { TouchInput } from '../input/TouchInput';
import { MatchManager, type GoalEvent, type MatchEndEvent, type MatchListener } from '../match/MatchManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { BallInteraction } from '../player/BallInteraction';
import { Player } from '../player/Player';
import { PlayerController } from '../player/PlayerController';
import { GameRenderer } from '../render/GameRenderer';
import { HUD } from '../ui/HUD';
import { MobileControls } from '../ui/MobileControls';
import { MATCH } from './config';
import { createPlayerCommand, type Score, type TeamId } from './types';

/** Home attacks the goal at -Z: yaw PI. */
const ATTACK_YAW: Record<TeamId, number> = { home: Math.PI, away: 0 };
const LOCAL_TEAM: TeamId = 'home';
/** Clamp for long frames (tab switches, GC pauses). */
const MAX_FRAME_DT = 0.1;

/**
 * Composition root and main loop. Owns no gameplay rules itself: it wires
 * input → simulation (fixed step) → match rules → presentation (per frame).
 */
export class Game implements MatchListener {
  private readonly layout: ArenaLayout;
  private readonly renderer: GameRenderer;
  private readonly player: Player;
  private readonly ball: Ball;
  private readonly controller: PlayerController;
  private readonly ballInteraction: BallInteraction;
  private readonly cameraRig: ThirdPersonCamera;
  private readonly input: InputManager;
  private readonly match: MatchManager;
  private readonly hud: HUD;
  private readonly command = createPlayerCommand();
  private lastTime = 0;

  private constructor(
    private readonly physics: PhysicsWorld,
    container: HTMLElement,
  ) {
    this.layout = createArenaLayout();
    this.renderer = new GameRenderer(container);
    const scene = this.renderer.scene;

    const arena = new Arena(this.layout, physics, this.renderer.maxAnisotropy);
    scene.add(arena.group);

    this.ball = new Ball(physics, this.layout.ballSpawn);
    scene.add(this.ball.mesh, this.ball.shadow);

    this.player = new Player(physics, LOCAL_TEAM, this.layout.playerSpawn[LOCAL_TEAM], ATTACK_YAW[LOCAL_TEAM]);
    scene.add(this.player.view.root);

    this.controller = new PlayerController(this.player);
    // Home defends +Z, so it attacks the goal defended by away.
    this.ballInteraction = new BallInteraction(this.player, this.ball, this.layout.goals.away);

    this.cameraRig = new ThirdPersonCamera(this.renderer.camera, ATTACK_YAW[LOCAL_TEAM]);

    const controls = new MobileControls(container);
    this.input = new InputManager(new KeyboardInput(), new TouchInput(controls));

    this.hud = new HUD(container);
    this.match = new MatchManager(this.layout, this, LOCAL_TEAM);
    this.hud.setScore(this.match.getScore());
  }

  static async create(container: HTMLElement): Promise<Game> {
    const physics = await PhysicsWorld.create();
    return new Game(physics, container);
  }

  start(): void {
    this.lastTime = performance.now();
    requestAnimationFrame(this.frame);
  }

  // --- MatchListener -------------------------------------------------------

  onGoal(event: GoalEvent): void {
    const text = event.againstLocalTeam ? 'OWN GOAL' : 'GOAL!';
    this.hud.showMessage(text, event.scoringTeam, MATCH.goalResetDelay);
  }

  onMatchEnd(event: MatchEndEvent): void {
    const text = event.winner === null ? 'DRAW' : event.winner === LOCAL_TEAM ? 'YOU WIN' : 'YOU LOSE';
    this.hud.showMessage(text, event.winner ?? 'neutral', MATCH.matchEndDelay);
  }

  onResetPositions(): void {
    this.player.resetTo(this.layout.playerSpawn[LOCAL_TEAM], ATTACK_YAW[LOCAL_TEAM]);
    this.ball.resetTo(this.layout.ballSpawn);
    this.ballInteraction.reset();
    this.cameraRig.snap();
  }

  onScoreChanged(score: Readonly<Score>): void {
    this.hud.setScore(score);
  }

  // --- Loop ----------------------------------------------------------------

  private readonly frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const frameDt = Math.min((now - this.lastTime) / 1000, MAX_FRAME_DT);
    this.lastTime = now;

    // Sample once per frame. A shoot press stays pending until a fixed step consumes it,
    // so it isn't lost on high-refresh frames that run zero physics steps.
    this.input.sample(this.cameraRig.getYaw(), this.command);

    const alpha = this.physics.advance(frameDt, this.stepBefore, this.stepAfter);

    this.player.render(alpha, frameDt);
    this.ball.render(alpha);
    this.cameraRig.update(frameDt, this.player.view.root.position, this.ball.mesh.position);
    this.hud.setClock(this.match.getRemainingTime());
    this.hud.update(frameDt);
    this.renderer.render();
  };

  private readonly stepBefore = (dt: number): void => {
    this.player.snapshot();
    this.ball.snapshot();

    this.controller.fixedUpdate(this.command, dt);
    if (this.ballInteraction.fixedUpdate(this.command.shoot, dt)) this.player.view.playKick();
    this.command.shoot = false;
  };

  private readonly stepAfter = (dt: number): void => {
    this.player.syncFromBody();
    this.ball.syncFromBody();
    this.match.fixedUpdate(dt, this.ball.position);
  };
}
