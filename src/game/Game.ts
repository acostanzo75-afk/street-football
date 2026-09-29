import { BotBrain, type BotWorld } from '../ai/BotBrain';
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
import { resolveQuality } from '../render/quality';
import { HUD } from '../ui/HUD';
import { MobileControls } from '../ui/MobileControls';
import { BOT, DRIBBLE, MATCH, TOUCH_DISTANCE, type BotDifficulty } from './config';
import { createPlayerCommand, otherTeam, type PlayerCommand, type Score, type TeamId } from './types';

/** Home attacks the goal at -Z (yaw PI); away attacks +Z (yaw 0). */
const ATTACK_YAW: Record<TeamId, number> = { home: Math.PI, away: 0 };
const LOCAL_TEAM: TeamId = 'home';
/** Clamp for long frames (tab switches, GC pauses). */
const MAX_FRAME_DT = 0.1;

/**
 * One player on the pitch and everything that drives it. Humans and bots are
 * identical here except for where their PlayerCommand comes from.
 */
interface Athlete {
  team: TeamId;
  player: Player;
  controller: PlayerController;
  interaction: BallInteraction;
  command: PlayerCommand;
  /** Present for AI-controlled athletes. */
  brain: BotBrain | null;
}

/** `?bot=easy|normal|hard|off`, default normal. */
function resolveBot(): BotDifficulty | null {
  const value = new URLSearchParams(window.location.search).get('bot');
  if (value === 'off') return null;
  if (value === 'easy' || value === 'normal' || value === 'hard') return value;
  return 'normal';
}

/**
 * Composition root and main loop. Owns no gameplay rules itself: it wires
 * input/AI → simulation (fixed step) → match rules → presentation (per frame).
 */
export class Game implements MatchListener {
  private readonly layout: ArenaLayout;
  private readonly renderer: GameRenderer;
  private readonly arena: Arena;
  private readonly ball: Ball;
  private readonly athletes: Athlete[] = [];
  private readonly local: Athlete;
  private readonly cameraRig: ThirdPersonCamera;
  private readonly input: InputManager;
  private readonly match: MatchManager;
  private readonly hud: HUD;
  private readonly botWorld: BotWorld;
  /** Team that touched the ball most recently (own-goal detection). */
  private lastTouch: TeamId | null = null;
  private lastTime = 0;
  /** `?debug` in the URL logs frame time and draw calls once per second. */
  private readonly debug = new URLSearchParams(window.location.search).has('debug');
  private debugFrames = 0;
  private debugElapsed = 0;

  private constructor(
    private readonly physics: PhysicsWorld,
    container: HTMLElement,
  ) {
    this.layout = createArenaLayout();
    const quality = resolveQuality();
    this.renderer = new GameRenderer(container, quality);
    const scene = this.renderer.scene;
    const realShadows = quality.shadowMapSize > 0;

    this.arena = new Arena(this.layout, physics, this.renderer.maxAnisotropy, quality.decorDensity);
    scene.add(this.arena.group);

    this.ball = new Ball(physics, this.layout.ballSpawn, realShadows);
    scene.add(this.ball.view.root);

    this.local = this.addAthlete(LOCAL_TEAM, '10', realShadows, null);
    const difficulty = resolveBot();
    if (difficulty) {
      const brain = new BotBrain(BOT[difficulty], ATTACK_YAW[otherTeam(LOCAL_TEAM)]);
      this.addAthlete(otherTeam(LOCAL_TEAM), '7', realShadows, brain);
    }
    for (const athlete of this.athletes) scene.add(athlete.player.view.root);

    this.cameraRig = new ThirdPersonCamera(this.renderer.camera, ATTACK_YAW[LOCAL_TEAM]);

    const controls = new MobileControls(container);
    this.input = new InputManager(new KeyboardInput(), new TouchInput(controls));

    this.hud = new HUD(container);
    this.match = new MatchManager(this.layout, this);
    this.hud.setScore(this.match.getScore());

    const home = this.layout.goals.home;
    this.botWorld = {
      selfX: 0,
      selfZ: 0,
      selfFacing: 0,
      opponentX: 0,
      opponentZ: 0,
      ballX: 0,
      ballZ: 0,
      ballVX: 0,
      ballVZ: 0,
      selfHasBall: false,
      opponentHasBall: false,
      attackGoal: home,
      ownGoal: home,
      halfWidth: this.layout.halfWidth,
      halfLength: this.layout.halfLength,
    };
  }

  static async create(container: HTMLElement): Promise<Game> {
    const physics = await PhysicsWorld.create();
    return new Game(physics, container);
  }

  start(): void {
    this.lastTime = performance.now();
    this.cameraRig.playIntro();
    this.hud.showBanner('KICK OFF', `FIRST TO ${MATCH.winningScore} WINS`, 'neutral', 2.2);
    requestAnimationFrame(this.frame);
  }

  private addAthlete(team: TeamId, number: string, realShadows: boolean, brain: BotBrain | null): Athlete {
    const player = new Player(this.physics, team, this.layout.playerSpawn[team], ATTACK_YAW[team], { number, realShadows });
    const athlete: Athlete = {
      team,
      player,
      controller: new PlayerController(player),
      // Each team attacks the goal the other team defends.
      interaction: new BallInteraction(player, this.ball, this.layout.goals[otherTeam(team)]),
      command: createPlayerCommand(),
      brain,
    };
    this.athletes.push(athlete);
    return athlete;
  }

  // --- MatchListener -------------------------------------------------------

  onGoal(event: GoalEvent): void {
    const { home, away } = event.score;
    const title = event.ownGoal ? 'OWN GOAL' : event.scoringTeam === LOCAL_TEAM ? 'GOAL!' : 'THEY SCORE';
    this.hud.showBanner(title, `${home} — ${away}`, event.scoringTeam, MATCH.goalResetDelay);
  }

  onMatchEnd(event: MatchEndEvent): void {
    const title = event.winner === null ? 'DRAW' : event.winner === LOCAL_TEAM ? 'YOU WIN' : 'YOU LOSE';
    const { home, away } = event.score;
    this.hud.showBanner(title, `FULL TIME  ${home} — ${away}`, event.winner ?? 'neutral', MATCH.matchEndDelay);
  }

  onResetPositions(): void {
    for (const athlete of this.athletes) {
      athlete.player.resetTo(this.layout.playerSpawn[athlete.team], ATTACK_YAW[athlete.team]);
      athlete.interaction.reset();
      athlete.brain?.reset(ATTACK_YAW[athlete.team]);
    }
    this.ball.resetTo(this.layout.ballSpawn);
    this.lastTouch = null;
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
    this.input.sample(this.cameraRig.getYaw(), this.local.command);

    const alpha = this.physics.advance(frameDt, this.stepBefore, this.stepAfter);

    for (const athlete of this.athletes) athlete.player.render(alpha, frameDt, athlete.interaction.isControlling());
    this.ball.render(alpha);
    this.cameraRig.update(frameDt, this.local.player.view.root.position, this.ball.renderPosition);
    this.hud.setClock(this.match.getRemainingTime());
    this.hud.update(frameDt);
    this.arena.update(frameDt);
    this.renderer.render(frameDt);
    if (this.debug) this.logStats(frameDt);
  };

  private logStats(frameDt: number): void {
    this.debugFrames++;
    this.debugElapsed += frameDt;
    if (this.debugElapsed < 1) return;
    const info = this.renderer.renderer.info.render;
    console.info(
      `[stats] ${this.renderer.quality.level} · ${(this.debugFrames / this.debugElapsed).toFixed(0)} fps · ${info.calls} draw calls · ${info.triangles} tris`,
    );
    this.debugFrames = 0;
    this.debugElapsed = 0;
  }

  private readonly stepBefore = (dt: number): void => {
    this.ball.snapshot();
    const controller = this.possessionHolder();
    for (const athlete of this.athletes) {
      athlete.player.snapshot();
      if (athlete.brain) athlete.brain.update(dt, this.describeWorldFor(athlete), athlete.command);
      athlete.controller.fixedUpdate(athlete.command, dt);
      const shot = athlete.interaction.fixedUpdate(athlete.command.shoot, dt, athlete === controller);
      if (shot) {
        athlete.player.view.playKick();
        this.lastTouch = athlete.team;
      }
      if (athlete.interaction.isControlling()) this.lastTouch = athlete.team;
      athlete.command.shoot = false;
    }
  };

  private readonly stepAfter = (dt: number): void => {
    for (const athlete of this.athletes) athlete.player.syncFromBody();
    this.ball.syncFromBody();
    this.trackTouches();
    this.match.fixedUpdate(dt, this.ball.position, this.lastTouch);
  };

  /**
   * Possession arbitration: of the players within dribble range, the closest
   * one gets assistance. Ties can't tug-of-war; stealing means getting closer.
   */
  private possessionHolder(): Athlete | null {
    let best: Athlete | null = null;
    let bestDist: number = DRIBBLE.controlRadius;
    for (const athlete of this.athletes) {
      const d = Math.hypot(this.ball.position.x - athlete.player.position.x, this.ball.position.z - athlete.player.position.z);
      if (d < bestDist) {
        bestDist = d;
        best = athlete;
      }
    }
    return best;
  }

  /** Physical contact also counts as a touch (for own-goal attribution). */
  private trackTouches(): void {
    if (this.ball.position.y > 1.3) return;
    for (const athlete of this.athletes) {
      const d = Math.hypot(this.ball.position.x - athlete.player.position.x, this.ball.position.z - athlete.player.position.z);
      if (d < TOUCH_DISTANCE) this.lastTouch = athlete.team;
    }
  }

  /** Fills the reusable BotWorld snapshot for one AI athlete (no allocation). */
  private describeWorldFor(self: Athlete): BotWorld {
    const w = this.botWorld;
    let opponent = self;
    for (const athlete of this.athletes) if (athlete !== self) opponent = athlete;
    w.selfX = self.player.position.x;
    w.selfZ = self.player.position.z;
    w.selfFacing = self.player.facing;
    w.opponentX = opponent.player.position.x;
    w.opponentZ = opponent.player.position.z;
    w.ballX = this.ball.position.x;
    w.ballZ = this.ball.position.z;
    w.ballVX = this.ball.velocity.x;
    w.ballVZ = this.ball.velocity.z;
    w.selfHasBall = self.interaction.isControlling();
    w.opponentHasBall = opponent !== self && opponent.interaction.isControlling();
    w.attackGoal = this.layout.goals[otherTeam(self.team)];
    w.ownGoal = this.layout.goals[self.team];
    return w;
  }
}
