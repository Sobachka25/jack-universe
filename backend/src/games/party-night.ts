import { GameId } from './activity';
import { gameCard } from './catalog';
import { GameInput, PartyRound, RoundPlayer } from './party-round';
import { loadQuizQuestions, QuizQuestion } from './questions';
import {
  PointGain,
  ScoreSeat,
  ShowFail,
  ShowSnapshot,
  ShowStage,
} from './show';
import { RoomError } from '../rooms/room.model';
import { voiceDurationMs } from '../audio-duration';
import { voiceLines } from '../voice-lines';

export const NIGHT_ROUNDS = 6;
export const TRIVIA_STAKE = 1000;
export const SURVIVAL_STAKE = 500;
export const EXIT_AT = 10;
export const MAX_START_LANE = EXIT_AT - 4;

const TRIVIA_MS = 20_000;
const BEAT_MS = 6_000;
const BRIEF_MS = 15_000;
const COUNTDOWN_MS = 3_000;
const READ_PAD_MS = 500;
export const GHOSTS_LINE = 'other_ghosts_can_still_win.mp3';
export const FINAL_INTRO = 'final_intro.mp3';
export const QUIZ_INTRO = 'joker_intro.mp3';
const REVEAL_GAP_MS = 300;
const REVEAL_WAIT = 'Итак, правильный ответ…';
const PUNISHMENTS: GameId[] = [
  'server-balance',
  'friday-release',
  'night-pager',
  'red-button',
  'alert-repeat',
];

export interface NightOptions {
  random?: () => number;
  bank?: QuizQuestion[];
  now?: number;
  triviaMs?: number;
  beatMs?: number;
  briefMs?: number;
  countdownMs?: number;
  punishments?: GameId[];
  /** ms a voice file lasts; defaults to reading mp3 under frontend/public/voice */
  voiceMs?: (folder: string, file: string) => number;
  /** answer lines to pick from; defaults to frontend/public/voice/answer */
  answerLines?: string[];
}

type NightStatus =
  | 'intro'
  | 'trivia'
  | 'trivia-result'
  | 'briefing'
  | 'countdown'
  | 'punishment'
  | 'punishment-result'
  | 'finale'
  | 'finale-step'
  | 'done';

interface Seat {
  id: string;
  name: string;
  score: number;
  ghost: boolean;
  lane: number;
}

export class PartyNight {
  private readonly random: () => number;
  private readonly triviaMs: number;
  private readonly beatMs: number;
  private readonly briefMs: number;
  private readonly countdownMs: number;
  private readonly punishments: GameId[];
  private readonly deck: QuestionDeck;
  private readonly order: Seat[];
  private status: NightStatus = 'trivia';
  private round = 1;
  private readonly roundCount = NIGHT_ROUNDS;
  private line = { id: 'night.trivia', text: '' };
  private prompt = '';
  private audio: string | null = null;
  private options: string[] = [];
  private correctIndex = 0;
  private correctText = '';
  private correctReveal: string | null = null;
  private picks = new Map<string, number>();
  private awaiting = new Set<string>();
  private gained: PointGain[] = [];
  private failed: ShowFail[] = [];
  private endsAt = 0;
  private pendingGame: GameId | null = null;
  private briefTitle = '';
  private lastGame: GameId | null = null;
  private minigame: PartyRound | null = null;
  private winner: Seat | null = null;
  private finale = false;
  private readUntil: number | null = null;
  private ghostsAnnounced = false;
  private intro: string | null = null;
  private answerLine: string | null = null;
  private briefAudio: string | null = null;
  private revealAt = 0;
  private revealPending = false;
  private readonly answerLines: string[];
  private announce = false;
  private readonly voiceMs: (folder: string, file: string) => number;
  private pauseAccum = 0;
  private pauseStarted: number | null = null;

  private constructor(players: RoundPlayer[], options: NightOptions) {
    this.random = options.random ?? Math.random;
    this.triviaMs = options.triviaMs ?? TRIVIA_MS;
    this.beatMs = options.beatMs ?? BEAT_MS;
    this.briefMs = options.briefMs ?? BRIEF_MS;
    this.countdownMs = options.countdownMs ?? COUNTDOWN_MS;
    this.punishments = options.punishments ?? PUNISHMENTS;
    this.voiceMs = options.voiceMs ?? voiceDurationMs;
    this.answerLines = options.answerLines ?? voiceLines().answer;
    if (this.punishments.length === 0) {
      throw new RoomError('Нет мини-игр');
    }
    this.deck = new QuestionDeck(
      options.bank ?? loadQuizQuestions(),
      this.random,
    );
    this.order = players.map((player) => ({
      id: player.id,
      name: player.name,
      score: 0,
      ghost: false,
      lane: 0,
    }));
  }

  static begin(players: RoundPlayer[], options: NightOptions = {}): PartyNight {
    if (players.length < 2) {
      throw new RoomError('Нужны хотя бы двое с телефонов');
    }
    const night = new PartyNight(players, options);
    night.beginIntro(options.now ?? Date.now());
    return night;
  }

  togglePause(now: number): boolean {
    if (this.pauseStarted !== null) {
      this.pauseAccum += now - this.pauseStarted;
      this.pauseStarted = null;
      return false;
    }
    this.pauseStarted = now;
    return true;
  }

  ghostIds(): string[] {
    return this.order.filter((seat) => seat.ghost).map((seat) => seat.id);
  }

  input(playerId: string, input: GameInput, wallNow: number): boolean {
    if (this.pauseStarted !== null) {
      throw new RoomError('Пауза. Николай ждёт.');
    }
    const now = this.logical(wallNow);
    const seat = this.order.find((item) => item.id === playerId);
    if (!seat) throw new RoomError('Тебя нет в этом вечере');
    if (this.status === 'punishment' && this.minigame) {
      if (!this.awaiting.has(seat.id) && !seat.ghost) {
        throw new RoomError('Этот раунд не твой');
      }
      const changed = this.minigame.input(playerId, input, now);
      if (this.minigame.snapshot(now).status === 'result') {
        this.finishPunishment(now);
      }
      return changed;
    }
    if (this.status !== 'trivia' && this.status !== 'finale') {
      throw new RoomError(
        this.status === 'briefing'
          ? 'Николай ещё объясняет'
          : this.status === 'countdown'
            ? 'Секунду. Сейчас начнётся.'
            : 'Подожди итог',
      );
    }
    if (input.hauntTargetId) {
      throw new RoomError('Подкладывают только на наказании');
    }
    const choice = input.choice;
    if (
      !Number.isInteger(choice) ||
      choice === undefined ||
      choice < 0 ||
      choice >= this.options.length
    ) {
      throw new RoomError('Такого ответа нет');
    }
    if (this.picks.has(playerId)) return false;
    this.picks.set(playerId, choice);
    if (this.everyoneAnswered()) this.grade(now);
    return true;
  }

  tick(wallNow: number): boolean {
    if (this.pauseStarted !== null) return false;
    return this.advance(this.logical(wallNow));
  }

  snapshot(wallNow: number, viewerId: string | null = null): ShowSnapshot {
    const now = this.logical(wallNow);
    return {
      paused: this.pauseStarted !== null,
      round: this.round,
      roundCount: this.roundCount,
      stake: TRIVIA_STAKE,
      line: this.hidden(now) ? { id: this.line.id, text: REVEAL_WAIT } : this.line,
      seats: this.order.map((seat) => ({
        playerId: seat.id,
        name: seat.name,
        score: seat.score,
        ghost: seat.ghost,
        lane: seat.lane,
        role: this.roleOf(seat),
      })),
      stage: this.stage(now, viewerId),
    };
  }

  private hidden(now: number): boolean {
    return (
      (this.status === 'trivia-result' || this.status === 'finale-step') &&
      now < this.revealAt
    );
  }

  private logical(now: number): number {
    if (this.pauseStarted !== null) return this.pauseStarted - this.pauseAccum;
    return now - this.pauseAccum;
  }

  private advance(now: number): boolean {
    if (this.status === 'intro') {
      if (now < this.endsAt) return false;
      this.beginCycle(now);
      return true;
    }
    if (this.revealPending && now >= this.revealAt) {
      this.revealPending = false;
      if (now < this.endsAt) return true;
    }
    if (this.status === 'trivia' || this.status === 'finale') {
      if (now < this.endsAt) return false;
      this.grade(now);
      return true;
    }
    if (this.status === 'briefing') {
      if (now < this.endsAt) return false;
      this.beginCountdown(now);
      return true;
    }
    if (this.status === 'countdown') {
      if (now < this.endsAt) return false;
      this.startPunishment(now);
      return true;
    }
    if (this.status === 'punishment' && this.minigame) {
      const changed = this.minigame.tick(now);
      if (this.minigame.snapshot(now).status === 'result') {
        this.finishPunishment(now);
        return true;
      }
      return changed;
    }
    if (
      this.status === 'trivia-result' ||
      this.status === 'punishment-result' ||
      this.status === 'finale-step'
    ) {
      if (now < this.endsAt) return false;
      this.afterBeat(now);
      return true;
    }
    return false;
  }

  private beginIntro(now: number): void {
    const ms = this.voiceMs('intro', QUIZ_INTRO);
    if (ms <= 0) {
      this.beginCycle(now);
      return;
    }
    this.status = 'intro';
    this.endsAt = now + ms + READ_PAD_MS;
    this.line = { id: 'night.intro', text: '' };
  }

  /** picks the host's answer line and holds the reveal until it has been said */
  private holdReveal(now: number): void {
    const pool = this.answerLines;
    const pick = pool.length > 0 ? pool[Math.floor(this.random() * pool.length)] ?? null : null;
    const ms = pick ? this.voiceMs('answer', pick) : 0;
    this.answerLine = ms > 0 ? pick : null;
    this.revealAt = ms > 0 ? now + ms + REVEAL_GAP_MS : now;
    this.revealPending = ms > 0;
    this.endsAt = this.revealAt + this.beatMs;
  }

  private beginCycle(now: number): void {
    const living = this.order.filter((seat) => !seat.ghost);
    if (this.round > this.roundCount || living.length <= 1) {
      this.beginFinale(now);
      return;
    }
    this.deal('trivia', now);
  }

  private beginFinale(now: number): void {
    this.finale = true;
    for (const seat of this.order) {
      seat.lane = Math.min(
        MAX_START_LANE,
        Math.floor(seat.score / SURVIVAL_STAKE),
      );
    }
    this.crownLeader();
    this.deal('finale', now, FINAL_INTRO);
  }

  private afterBeat(now: number): void {
    if (this.status === 'finale-step') {
      if (this.winner) {
        this.status = 'done';
        this.line = {
          id: 'night.done',
          text: `${this.winner.name} доходит до выхода.`,
        };
        return;
      }
      this.deal('finale', now);
      return;
    }
    if (this.status === 'trivia-result' && this.awaiting.size > 0) {
      this.beginBriefing(now);
      return;
    }
    this.awaiting.clear();
    this.round += 1;
    this.beginCycle(now);
  }

  private beginBriefing(now: number): void {
    const gameId = this.pickGame();
    const card = gameCard(gameId);
    if (!card) throw new RoomError('Такой мини-игры нет');
    this.pendingGame = gameId;
    this.briefTitle = card.title;
    this.status = 'briefing';
    // host voice-over for the minigame (frontend/public/voice/briefing/<gameId>.mp3), if recorded
    const file = `${gameId}.mp3`;
    const voiceMs = this.voiceMs('briefing', file);
    this.briefAudio = voiceMs > 0 ? file : null;
    this.endsAt = now + Math.max(this.briefMs, voiceMs > 0 ? voiceMs + READ_PAD_MS : 0);
    this.line = { id: 'night.briefing', text: card.briefing };
  }

  private beginCountdown(now: number): void {
    this.status = 'countdown';
    this.endsAt = now + this.countdownMs;
    this.line = { id: 'night.countdown', text: 'Три. Две. Одна.' };
  }

  private startPunishment(now: number): void {
    const gameId = this.pendingGame;
    if (!gameId) throw new RoomError('Такой мини-игры нет');
    const players = this.order.filter((seat) => this.awaiting.has(seat.id));
    const ghosts = this.order.filter((seat) => seat.ghost);
    const round = PartyRound.briefing(gameId, this.random);
    round.keepEveryoneWhoLived();
    round.start(now, asPlayers(players), asPlayers(ghosts));
    this.minigame = round;
    this.status = 'punishment';
    this.line = round.snapshot(now).line;
  }

  private finishPunishment(now: number): void {
    const sent = new Set(this.minigame?.takeSentIds() ?? []);
    const gained: PointGain[] = [];
    const failed: ShowFail[] = [];
    for (const seat of this.order) {
      if (!this.awaiting.has(seat.id)) continue;
      if (sent.has(seat.id)) {
        seat.ghost = true;
        failed.push({ playerId: seat.id, name: seat.name });
      } else {
        seat.score += SURVIVAL_STAKE;
        gained.push({
          playerId: seat.id,
          name: seat.name,
          points: SURVIVAL_STAKE,
        });
      }
    }
    this.awaiting.clear();
    this.gained = gained;
    this.failed = failed;
    this.correctReveal = null;
    this.minigame = null;
    this.status = 'punishment-result';
    this.answerLine = null;
    this.revealPending = false;
    this.announce = failed.length > 0 && !this.ghostsAnnounced;
    if (this.announce) this.ghostsAnnounced = true;
    const lineMs = this.announce ? this.voiceMs('other', GHOSTS_LINE) + READ_PAD_MS : 0;
    this.endsAt = now + Math.max(this.beatMs, lineMs);
    this.line = {
      id: 'night.punishment-result',
      text: punishmentResult(gained, failed),
    };
  }

  private deal(
    kind: 'trivia' | 'finale',
    now: number,
    intro: string | null = null,
  ): void {
    const question = this.deck.draw();
    const options = [question.correct, ...question.wrong];
    for (let cursor = options.length - 1; cursor > 0; cursor -= 1) {
      const swap = Math.floor(this.random() * (cursor + 1));
      const left = options[cursor];
      const right = options[swap];
      if (left === undefined || right === undefined) continue;
      options[cursor] = right;
      options[swap] = left;
    }
    this.prompt = question.prompt;
    this.audio = question.audio ?? null;
    this.options = options;
    this.correctIndex = Math.max(0, options.indexOf(question.correct));
    this.correctText = question.correct;
    this.picks = new Map();
    this.gained = [];
    this.failed = [];
    this.correctReveal = null;
    this.minigame = null;
    this.status = kind;
    const introMs = intro ? this.voiceMs('other', intro) : 0;
    this.intro = introMs > 0 ? intro : null;
    const readMs =
      introMs + (this.audio ? this.voiceMs('questions', this.audio) : 0);
    this.readUntil = readMs > 0 ? now + readMs + READ_PAD_MS : null;
    this.endsAt = (this.readUntil ?? now) + this.triviaMs;
    this.line = {
      id: kind === 'trivia' ? 'night.trivia' : 'night.finale',
      text: question.prompt,
    };
  }

  private grade(now: number): void {
    if (this.status === 'finale') this.gradeFinale(now);
    else this.gradeTrivia(now);
  }

  private gradeTrivia(now: number): void {
    const gained: PointGain[] = [];
    const failed: ShowFail[] = [];
    this.awaiting = new Set();
    for (const seat of this.order) {
      if (this.picks.get(seat.id) === this.correctIndex) {
        seat.score += TRIVIA_STAKE;
        gained.push({
          playerId: seat.id,
          name: seat.name,
          points: TRIVIA_STAKE,
        });
        continue;
      }
      if (seat.ghost) continue;
      this.awaiting.add(seat.id);
      failed.push({ playerId: seat.id, name: seat.name });
    }
    this.gained = gained;
    this.failed = failed;
    this.correctReveal = this.correctText;
    this.status = 'trivia-result';
    this.holdReveal(now);
    this.line = {
      id: 'night.trivia-result',
      text: triviaResult(gained, failed, this.correctText),
    };
  }

  private gradeFinale(now: number): void {
    const leaderId = this.leader()?.id;
    const gained: PointGain[] = [];
    const failed: ShowFail[] = [];
    const moved: Seat[] = [];
    for (const seat of this.order) {
      if (this.picks.get(seat.id) === this.correctIndex) {
        seat.lane += 1;
        moved.push(seat);
      } else {
        failed.push({ playerId: seat.id, name: seat.name });
      }
    }
    moved.sort((left, right) => {
      if (left.id === leaderId) return -1;
      if (right.id === leaderId) return 1;
      return 0;
    });
    for (const seat of moved) {
      gained.push({ playerId: seat.id, name: seat.name, points: 1 });
    }
    this.gained = gained;
    this.failed = failed;
    this.correctReveal = this.correctText;
    this.crownLeader();
    const leader = this.leader();
    if (leader && leader.lane >= EXIT_AT) this.winner = leader;
    this.status = 'finale-step';
    this.holdReveal(now);
    const names = gained.map((item) => item.name).join(', ');
    this.line = {
      id: 'night.finale-step',
      text: names
        ? `Верный ответ: ${this.correctText}. Вперёд: ${names}.`
        : `Верный ответ: ${this.correctText}. Никто не сдвинулся.`,
    };
  }

  private leader(): Seat | undefined {
    return [...this.order].sort(compareLead)[0];
  }

  private crownLeader(): void {
    const leader = this.leader();
    if (!leader) return;
    for (const seat of this.order) seat.ghost = seat.id !== leader.id;
  }

  private everyoneAnswered(): boolean {
    return this.order.every((seat) => this.picks.has(seat.id));
  }

  private pickGame(): GameId {
    const fresh = this.punishments.filter((id) => id !== this.lastGame);
    const pool = fresh.length > 0 ? fresh : this.punishments;
    const id = pool[Math.floor(this.random() * pool.length)] ?? pool[0];
    if (!id) throw new RoomError('Нет мини-игр');
    this.lastGame = id;
    return id;
  }

  private roleOf(seat: Seat): ScoreSeat['role'] {
    if (seat.ghost) return 'ghost';
    if (this.awaiting.has(seat.id)) return 'awaiting';
    const punishing =
      this.status === 'briefing' ||
      this.status === 'countdown' ||
      this.status === 'punishment' ||
      this.status === 'punishment-result';
    if (punishing) return 'safe';
    return 'living';
  }

  private stage(now: number, viewerId: string | null): ShowStage {
    if (this.status === 'intro') {
      return {
        kind: 'intro',
        audio: QUIZ_INTRO,
        serverNow: now,
        endsAt: this.endsAt,
      };
    }
    if (this.status === 'trivia' || this.status === 'finale') {
      return {
        kind: this.status,
        prompt: this.prompt,
        audio: this.audio,
        readUntil: this.readUntil,
        intro: this.intro,
        options: this.options,
        locked: [...this.picks.keys()],
        serverNow: now,
        endsAt: this.endsAt,
        exitAt: this.status === 'finale' ? EXIT_AT : null,
      };
    }
    if (this.status === 'briefing') {
      return {
        kind: 'briefing',
        title: this.briefTitle,
        audio: this.briefAudio,
        text: this.line.text,
        serverNow: now,
        endsAt: this.endsAt,
      };
    }
    if (this.status === 'countdown') {
      return {
        kind: 'countdown',
        title: this.briefTitle,
        serverNow: now,
        endsAt: this.endsAt,
      };
    }
    if (this.status === 'punishment' && this.minigame) {
      return {
        kind: 'punishment',
        activity: this.minigame.snapshot(now, viewerId),
      };
    }
    if (this.status === 'done' && this.winner) {
      return {
        kind: 'done',
        winnerId: this.winner.id,
        winnerName: this.winner.name,
        exitAt: EXIT_AT,
      };
    }
    return {
      kind:
        this.status === 'finale-step'
          ? 'finale-step'
          : this.status === 'punishment-result'
            ? 'punishment-result'
            : 'trivia-result',
      correct: this.hidden(now) ? null : this.correctReveal,
      options: this.status === 'punishment-result' ? [] : this.options,
      gained: this.hidden(now) ? [] : this.gained,
      failed: this.hidden(now) ? [] : this.failed,
      answerLine: this.status === 'punishment-result' ? null : this.answerLine,
      revealed: !this.hidden(now),
      exitAt: this.status === 'finale-step' ? EXIT_AT : null,
      announce: this.status === 'punishment-result' && this.announce,
    };
  }
}

class QuestionDeck {
  private pending: QuizQuestion[] = [];

  constructor(
    private readonly bank: QuizQuestion[],
    private readonly random: () => number,
  ) {
    if (bank.length === 0) throw new RoomError('В файле нет вопросов');
  }

  draw(): QuizQuestion {
    if (this.pending.length === 0) {
      this.pending = this.bank.slice();
      for (let index = this.pending.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(this.random() * (index + 1));
        const left = this.pending[index];
        const right = this.pending[swap];
        if (left === undefined || right === undefined) continue;
        this.pending[index] = right;
        this.pending[swap] = left;
      }
    }
    const next = this.pending.pop();
    if (!next) throw new RoomError('В файле нет вопросов');
    return next;
  }
}

function compareLead(left: Seat, right: Seat): number {
  if (right.lane !== left.lane) return right.lane - left.lane;
  if (right.score !== left.score) return right.score - left.score;
  return left.name.localeCompare(right.name, 'ru');
}

function asPlayers(seats: Seat[]): RoundPlayer[] {
  return seats.map((seat) => ({ id: seat.id, name: seat.name }));
}

function triviaResult(
  gained: PointGain[],
  failed: ShowFail[],
  answer: string,
): string {
  const tail = `Верный ответ: ${answer}.`;
  if (failed.length === 0) {
    return `Все в штате ответили верно. Ставка ${TRIVIA_STAKE} каждому. ${tail}`;
  }
  if (gained.length === 0) {
    return `Мимо все. Наказание на всю смену. ${tail}`;
  }
  const right = gained.map((item) => item.name).join(', ');
  const wrong = failed.map((item) => item.name).join(', ');
  return `Верно: ${right}. Ставка ${TRIVIA_STAKE}. На наказание: ${wrong}. ${tail}`;
}

function punishmentResult(gained: PointGain[], failed: ShowFail[]): string {
  if (failed.length === 0) {
    return `Наказание пережили все. По ${SURVIVAL_STAKE} очков, и остаются в штате.`;
  }
  const dead = failed.map((item) => item.name).join(', ');
  if (gained.length === 0) {
    return `Наказание никого не отпустило. На hh ${dead}.`;
  }
  const lived = gained.map((item) => item.name).join(', ');
  const takes = gained.length === 1 ? 'забирает' : 'забирают';
  const stays = gained.length === 1 ? 'остаётся' : 'остаются';
  return `${dead} на hh. ${lived} ${takes} ${SURVIVAL_STAKE} и ${stays}.`;
}
