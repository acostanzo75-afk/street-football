import { BALL, MATCH } from '../game/config';
import { otherTeam, type Score, type TeamId } from '../game/types';
import { isInsideBox, type ArenaLayout } from '../arena/ArenaLayout';

export type MatchPhase = 'playing' | 'goalScored' | 'ended';

export interface GoalEvent {
  scoringTeam: TeamId;
  /** The last player to touch the ball was on the team that conceded. */
  ownGoal: boolean;
  score: Readonly<Score>;
}

export interface MatchEndEvent {
  winner: TeamId | null;
  score: Readonly<Score>;
}

/**
 * Receives match outcomes. The Game wires this to HUD and entity resets;
 * later a network layer can implement the same interface from server messages.
 */
export interface MatchListener {
  onGoal(event: GoalEvent): void;
  onMatchEnd(event: MatchEndEvent): void;
  /** Place players and ball at kickoff positions. */
  onResetPositions(): void;
  onScoreChanged(score: Readonly<Score>): void;
}

interface BallState {
  x: number;
  y: number;
  z: number;
}

/**
 * Owns match rules: score, goal detection, phase transitions, clock.
 * No rendering, no DOM, no physics engine — just data in, events out.
 * This is the piece that will move to the authoritative server.
 */
export class MatchManager {
  private readonly score: Score = { home: 0, away: 0 };
  private phase: MatchPhase = 'playing';
  private phaseTimer = 0;
  private elapsed = 0;

  constructor(
    private readonly layout: ArenaLayout,
    private readonly listener: MatchListener,
  ) {}

  getPhase(): MatchPhase {
    return this.phase;
  }

  getScore(): Readonly<Score> {
    return this.score;
  }

  /** Seconds left on the match clock. */
  getRemainingTime(): number {
    return Math.max(0, MATCH.durationSeconds - this.elapsed);
  }

  /** `lastTouch` is the team that touched the ball most recently (for own goals). */
  fixedUpdate(dt: number, ball: BallState, lastTouch: TeamId | null): void {
    // Safety net: never let a physics glitch lose the ball forever.
    if (ball.y < BALL.lostBelowY) {
      this.listener.onResetPositions();
      return;
    }

    switch (this.phase) {
      case 'playing':
        this.elapsed += dt;
        this.detectGoal(ball, lastTouch);
        if (this.phase === 'playing' && this.getRemainingTime() === 0) this.endMatch();
        break;
      case 'goalScored':
        this.phaseTimer -= dt;
        if (this.phaseTimer <= 0) {
          if (this.winner() !== null) {
            this.endMatch();
          } else {
            this.phase = 'playing';
            this.listener.onResetPositions();
          }
        }
        break;
      case 'ended':
        this.phaseTimer -= dt;
        if (this.phaseTimer <= 0) this.restart();
        break;
    }
  }

  /** Starts a brand-new match: score and clock back to zero. */
  restart(): void {
    this.score.home = 0;
    this.score.away = 0;
    this.elapsed = 0;
    this.phase = 'playing';
    this.phaseTimer = 0;
    this.listener.onScoreChanged(this.score);
    this.listener.onResetPositions();
  }

  private detectGoal(ball: BallState, lastTouch: TeamId | null): void {
    for (const goal of [this.layout.goals.home, this.layout.goals.away]) {
      if (!isInsideBox(goal.trigger, ball.x, ball.y, ball.z)) continue;
      const scoringTeam = otherTeam(goal.defendedBy);
      this.score[scoringTeam] += 1;
      // Leaving the 'playing' phase is what prevents the same goal counting twice.
      this.phase = 'goalScored';
      this.phaseTimer = MATCH.goalResetDelay;
      this.listener.onScoreChanged(this.score);
      this.listener.onGoal({ scoringTeam, ownGoal: lastTouch === goal.defendedBy, score: this.score });
      return;
    }
  }

  private winner(): TeamId | null {
    if (this.score.home >= MATCH.winningScore) return 'home';
    if (this.score.away >= MATCH.winningScore) return 'away';
    return null;
  }

  private endMatch(): void {
    this.phase = 'ended';
    this.phaseTimer = MATCH.matchEndDelay;
    let winner = this.winner();
    if (winner === null && this.score.home !== this.score.away) {
      winner = this.score.home > this.score.away ? 'home' : 'away';
    }
    this.listener.onMatchEnd({ winner, score: this.score });
  }
}
