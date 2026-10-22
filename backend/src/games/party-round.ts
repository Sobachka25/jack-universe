import {
  ActivitySnapshot,
  GameId,
  HauntKind,
  HauntView,
  HostLine,
  RackView,
  SentPlayer,
} from './activity';
import { gameCard } from './catalog';
import { RoomError } from '../rooms/room.model';

const BALANCE_MS = 15_000;
const CHOICE_MS = 12_000;
const FRIDAY_PERIOD_MS = 2_200;
const GREEN_CENTER = 0.5;
const GREEN_HALF = 0.1;
const NARROW_HALF = GREEN_HALF / 2;
const BAND_HALF = 9;
const WIDE_BAND = 16;
const HEAVY_WEIGHT = 1.8;
const ALERT_REVEAL_MS = 4_000;
const FAIL_ANGLE = 46;
const SCORE_ANGLE = 22;
const SCORE_PER_SEC = 10;
const WIND_FORCE = 70;
const INPUT_FORCE = 92;
const GRAVITY = 48;
const WIND_STEP_MS = 3_000;
const WIND_STEPS = BALANCE_MS / WIND_STEP_MS;
const WIND_LEVELS = [0.7, 0.85, 1];
const ALERT_ICONS = ['CPU', 'Диск', 'Очередь', '500', 'Сертификат'];
const RED_OPTIONS = [
  'Откатить',
  'Открыть логи',
  'Написать заказчику',
  'Выкатить ещё раз',
];

export interface RoundPlayer {
  id: string;
  name: string;
}

export interface GameInput {
  hold?: 'left' | 'right' | 'none';
  choice?: number;
  sequence?: string[];
  hauntTargetId?: string;
}

interface Rack {
  playerId: string;
  name: string;
  angle: number;
  velocity: number;
  score: number;
  alive: boolean;
  hold: -1 | 0 | 1;
  fellAt: number | null;
  weight: number;
}

interface TimedAnswer {
  value: number;
  at: number;
}

export class PartyRound {
  private phase: 'briefing' | 'play' | 'result' = 'briefing';
  private line: HostLine;
  private players: RoundPlayer[] = [];
  private startedAt = 0;
  private endsAt = 0;
  private lastTick = 0;
  private pendingSent: SentPlayer[] = [];
  private sentToHh: SentPlayer[] = [];

  private racks = new Map<string, Rack>();
  private winds: number[] = [];
  private ghosts: RoundPlayer[] = [];
  private haunts: HauntView[] = [];
  private narrow = new Set<string>();
  private wide = new Set<string>();
  private seals = new Map<string, number>();
  private lies = new Map<string, string[]>();
  private taps = new Map<string, number>();
  private picks = new Map<string, TimedAnswer>();
  private sequences = new Map<string, { icons: string[]; at: number }>();
  private bandCenter = 50;
  private deadly = 0;
  private shown: string[] = [];
  private revealUntil = 0;
  private sequenceHidden = false;

  private constructor(
    readonly gameId: Exclude<GameId, 'code-review'>,
    readonly title: string,
    private readonly blurb: string,
    briefing: string,
    private readonly random: () => number,
  ) {
    this.line = { id: `${gameId}.briefing`, text: briefing };
  }

  static briefing(
    gameId: string,
    random: () => number = Math.random,
  ): PartyRound {
    const card = gameCard(gameId);
    if (!card) throw new RoomError('Такой мини-игры нет');
    if (!card.ready || card.id === 'code-review') {
      throw new RoomError('Вопросы для этого раунда ещё готовятся');
    }
    return new PartyRound(
      card.id,
      card.title,
      card.blurb,
      card.briefing,
      random,
    );
  }

  start(now: number, players: RoundPlayer[], ghosts: RoundPlayer[] = []): void {
    if (this.phase !== 'briefing') {
      throw new RoomError('Раунд уже запущен');
    }
    if (players.length === 0) {
      throw new RoomError(
        ghosts.length > 0
          ? 'В штате уже никого нет'
          : 'С телефона пока никто не зашёл',
      );
    }
    this.players = players;
    this.ghosts = ghosts;
    this.phase = 'play';
    this.startedAt = now;
    this.lastTick = now;
    this.endsAt =
      now + (this.gameId === 'server-balance' ? BALANCE_MS : CHOICE_MS);
    this.line = {
      id: `${this.gameId}.play`,
      text: this.blurb,
    };
    if (this.gameId === 'server-balance') {
      this.winds = rollWinds(this.random);
      for (const player of players) {
        this.racks.set(player.id, {
          playerId: player.id,
          name: player.name,
          angle: 0,
          velocity: 0,
          score: 0,
          alive: true,
          hold: 0,
          fellAt: null,
          weight: 1,
        });
      }
    }
    if (this.gameId === 'night-pager') {
      this.bandCenter = 20 + Math.floor(this.random() * 61);
    }
    if (this.gameId === 'red-button') {
      this.deadly = Math.floor(this.random() * RED_OPTIONS.length);
    }
    if (this.gameId === 'alert-repeat') {
      this.shown = Array.from({ length: 4 }, () => {
        const index = Math.floor(this.random() * ALERT_ICONS.length);
        return ALERT_ICONS[index] ?? ALERT_ICONS[0];
      });
      this.revealUntil = now + ALERT_REVEAL_MS;
      this.endsAt = this.revealUntil + CHOICE_MS;
    }
  }

  input(playerId: string, input: GameInput, now: number): boolean {
    if (this.phase !== 'play') throw new RoomError('Раунд ещё не идёт');
    const ghost = this.ghosts.find((player) => player.id === playerId);
    if (ghost) {
      this.curse(ghost, input.hauntTargetId, now);
      return true;
    }
    if (!this.players.some((player) => player.id === playerId)) return false;
    if (input.hauntTargetId) {
      throw new RoomError('Подкладывают только с hh');
    }
    if (this.gameId === 'server-balance') {
      const rack = this.racks.get(playerId);
      if (!rack?.alive) return false;
      if (
        input.hold !== 'left' &&
        input.hold !== 'right' &&
        input.hold !== 'none'
      ) {
        throw new RoomError('Нужно жать влево или вправо');
      }
      rack.hold = input.hold === 'left' ? -1 : input.hold === 'right' ? 1 : 0;
      return true;
    }
    if (now >= this.endsAt) return false;
    if (this.gameId === 'friday-release') {
      if (this.taps.has(playerId)) return false;
      const elapsed = now - this.startedAt;
      const position = (elapsed % FRIDAY_PERIOD_MS) / FRIDAY_PERIOD_MS;
      this.taps.set(playerId, position);
      return true;
    }
    if (this.gameId === 'night-pager') {
      if (this.picks.has(playerId)) return false;
      const choice = input.choice;
      if (
        !Number.isInteger(choice) ||
        choice === undefined ||
        choice < 0 ||
        choice > 100
      ) {
        throw new RoomError('Минута от 0 до 100');
      }
      this.picks.set(playerId, { value: choice, at: now });
      return true;
    }
    if (this.gameId === 'red-button') {
      if (this.picks.has(playerId)) return false;
      const choice = input.choice;
      if (
        !Number.isInteger(choice) ||
        choice === undefined ||
        choice < 0 ||
        choice >= RED_OPTIONS.length
      ) {
        throw new RoomError('Такого действия нет');
      }
      if (this.seals.get(playerId) === choice) {
        throw new RoomError('Эту кнопку заклеили');
      }
      this.picks.set(playerId, { value: choice, at: now });
      return true;
    }
    if (this.sequences.has(playerId)) return false;
    if (now < this.revealUntil) throw new RoomError('Алерты ещё на экране');
    const sequence = input.sequence;
    if (!sameSequenceShape(sequence)) {
      throw new RoomError('Нужно повторить четыре алерта');
    }
    this.sequences.set(playerId, { icons: sequence, at: now });
    return true;
  }

  tick(now: number): boolean {
    if (this.phase !== 'play') return false;
    if (this.gameId === 'server-balance') {
      this.stepBalance(now);
      if (now >= this.endsAt) this.finishBalance();
      return true;
    }
    if (
      this.gameId === 'alert-repeat' &&
      !this.sequenceHidden &&
      now >= this.revealUntil
    ) {
      this.sequenceHidden = true;
      if (now < this.endsAt) return true;
    }
    if (now < this.endsAt) return false;
    this.finishChoice();
    return true;
  }

  takeSentIds(): string[] {
    const ids = this.pendingSent.map((player) => player.playerId);
    this.pendingSent = [];
    return ids;
  }

  snapshot(now: number, viewerId: string | null = null): ActivitySnapshot {
    if (this.phase === 'briefing') {
      return {
        status: 'briefing',
        gameId: this.gameId,
        title: this.title,
        blurb: this.blurb,
        line: this.line,
      };
    }
    if (this.phase === 'result') {
      return {
        status: 'result',
        gameId: this.gameId,
        title: this.title,
        line: this.line,
        sentToHh: this.sentToHh,
      };
    }
    if (this.gameId === 'server-balance') {
      return {
        status: 'play',
        gameId: 'server-balance',
        title: this.title,
        line: this.line,
        serverNow: now,
        endsAt: this.endsAt,
        wind: this.windAt(now),
        racks: [...this.racks.values()].map(toRackView),
        haunts: this.haunts,
      };
    }
    if (this.gameId === 'friday-release') {
      return {
        status: 'play',
        gameId: 'friday-release',
        title: this.title,
        line: this.line,
        serverNow: now,
        startedAt: this.startedAt,
        endsAt: this.endsAt,
        periodMs: FRIDAY_PERIOD_MS,
        greenCenter: GREEN_CENTER,
        greenHalf:
          viewerId && this.narrow.has(viewerId) ? NARROW_HALF : GREEN_HALF,
        tapped: [...this.taps.keys()],
        haunts: this.haunts,
      };
    }
    if (this.gameId === 'night-pager') {
      return {
        status: 'play',
        gameId: 'night-pager',
        title: this.title,
        line: this.line,
        serverNow: now,
        endsAt: this.endsAt,
        locked: [...this.picks.keys()],
        wideZone: viewerId ? this.wide.has(viewerId) : false,
        haunts: this.haunts,
      };
    }
    if (this.gameId === 'red-button') {
      return {
        status: 'play',
        gameId: 'red-button',
        title: this.title,
        line: this.line,
        serverNow: now,
        endsAt: this.endsAt,
        options: RED_OPTIONS,
        locked: [...this.picks.keys()],
        sealedIndex: viewerId ? (this.seals.get(viewerId) ?? null) : null,
        haunts: this.haunts,
      };
    }
    return {
      status: 'play',
      gameId: 'alert-repeat',
      title: this.title,
      line: this.line,
      serverNow: now,
      revealUntil: this.revealUntil,
      endsAt: this.endsAt,
      sequence: this.sequenceFor(viewerId),
      icons: ALERT_ICONS,
      locked: [...this.sequences.keys()],
      haunts: this.haunts,
    };
  }

  private stepBalance(now: number): void {
    const dt = Math.min(0.1, Math.max(0, (now - this.lastTick) / 1000));
    this.lastTick = now;
    if (dt === 0) return;
    const wind = this.windAt(now);
    for (const rack of this.racks.values()) {
      stepRack(rack, wind, dt, now);
    }
  }

  private windAt(now: number): number {
    const index = Math.floor((now - this.startedAt) / WIND_STEP_MS);
    return this.winds[index] ?? this.winds[this.winds.length - 1] ?? 1;
  }

  private sequenceFor(viewerId: string | null): string[] {
    if (this.sequenceHidden) return [];
    if (!viewerId) return this.shown;
    return this.lies.get(viewerId) ?? this.shown;
  }

  private curse(
    ghost: RoundPlayer,
    targetId: string | undefined,
    now: number,
  ): void {
    if (!targetId) throw new RoomError('Выбери, кому подложить');
    if (this.haunts.some((haunt) => haunt.ghostId === ghost.id)) {
      throw new RoomError('Ты уже подложил в этом раунде');
    }
    const target = this.players.find((player) => player.id === targetId);
    if (!target)
      throw new RoomError('Подложить можно только тому, кто в штате');
    if (this.haunts.some((haunt) => haunt.targetId === target.id)) {
      throw new RoomError('Этому уже подложили');
    }
    const kind = hauntKind(this.gameId);
    this.applyCurse(kind, target, now);
    this.haunts.push({
      ghostId: ghost.id,
      ghostName: ghost.name,
      targetId: target.id,
      targetName: target.name,
      kind,
      text: hauntText(kind, ghost.name, target.name),
    });
  }

  private applyCurse(kind: HauntKind, target: RoundPlayer, now: number): void {
    if (kind === 'weight') {
      const rack = this.racks.get(target.id);
      if (!rack?.alive) throw new RoomError('Стойка уже лежит');
      rack.weight = HEAVY_WEIGHT;
      return;
    }
    if (kind === 'window') {
      this.narrow.add(target.id);
      return;
    }
    if (kind === 'band') {
      this.wide.add(target.id);
      return;
    }
    if (kind === 'seal') {
      if (this.picks.has(target.id)) throw new RoomError('Этот уже нажал');
      const safe = RED_OPTIONS.map((_, index) => index).filter(
        (index) => index !== this.deadly,
      );
      const picked = safe[Math.floor(this.random() * safe.length)] ?? 0;
      this.seals.set(target.id, picked);
      return;
    }
    if (now >= this.revealUntil) throw new RoomError('Алерты уже погасли');
    const step = Math.floor(this.random() * this.shown.length);
    const current = this.shown[step] ?? ALERT_ICONS[0];
    const options = ALERT_ICONS.filter((icon) => icon !== current);
    const icon =
      options[Math.floor(this.random() * options.length)] ?? ALERT_ICONS[0];
    const lied = this.shown.slice();
    lied[step] = icon;
    this.lies.set(target.id, lied);
  }

  private finishBalance(): void {
    const racks = [...this.racks.values()];
    const dead = racks.filter((rack) => !rack.alive);
    const alive = racks.filter((rack) => rack.alive);
    if (alive.length === 0) {
      this.resolve(asPlayers(dead), 'wipe');
      return;
    }
    if (dead.length > 0) {
      this.resolve(asPlayers(dead), 'failed');
      return;
    }
    const min = Math.min(...alive.map((rack) => rack.score));
    const lowest = alive
      .filter((rack) => rack.score === min)
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    this.resolve(asPlayers(lowest.slice(0, 1)), 'all-clear');
  }

  private finishChoice(): void {
    if (this.gameId === 'friday-release') {
      const hits = this.players.map((player) => {
        const position = this.taps.get(player.id);
        const distance =
          position === undefined
            ? Number.POSITIVE_INFINITY
            : Math.abs(position - GREEN_CENTER);
        const half = this.narrow.has(player.id) ? NARROW_HALF : GREEN_HALF;
        return { player, distance, hit: distance <= half };
      });
      const missed = hits
        .filter((item) => !item.hit)
        .map((item) => item.player);
      if (missed.length === this.players.length) {
        this.resolve(missed, 'wipe');
        return;
      }
      if (missed.length > 0) {
        this.resolve(missed, 'failed');
        return;
      }
      const worst = Math.max(...hits.map((item) => item.distance));
      const lowest = hits
        .filter((item) => item.distance === worst)
        .map((item) => item.player)
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
      this.resolve(lowest.slice(0, 1), 'all-clear');
      return;
    }
    if (this.gameId === 'night-pager') {
      const judged = this.players.map((player) => {
        const pick = this.picks.get(player.id);
        const half = this.wide.has(player.id) ? WIDE_BAND : BAND_HALF;
        const inBand =
          pick !== undefined && Math.abs(pick.value - this.bandCenter) <= half;
        return { player, pick, inBand };
      });
      const failed = judged
        .filter((item) => item.pick === undefined || item.inBand)
        .map((item) => item.player);
      if (failed.length === this.players.length) {
        this.resolve(failed, 'wipe');
        return;
      }
      if (failed.length > 0) {
        this.resolve(failed, 'failed');
        return;
      }
      const closest = [...judged].sort((a, b) => {
        const left = Math.abs((a.pick?.value ?? 0) - this.bandCenter);
        const right = Math.abs((b.pick?.value ?? 0) - this.bandCenter);
        return left - right;
      });
      this.resolve(
        closest.slice(0, 1).map((item) => item.player),
        'all-clear',
      );
      return;
    }
    if (this.gameId === 'red-button') {
      const judged = this.players.map((player) => ({
        player,
        pick: this.picks.get(player.id),
      }));
      const failed = judged
        .filter((item) => !item.pick || item.pick.value === this.deadly)
        .map((item) => item.player);
      if (failed.length === this.players.length) {
        this.resolve(failed, 'wipe');
        return;
      }
      if (failed.length > 0) {
        this.resolve(failed, 'failed');
        return;
      }
      const slowest = [...judged].sort(
        (a, b) => (b.pick?.at ?? 0) - (a.pick?.at ?? 0),
      );
      this.resolve(
        slowest.slice(0, 1).map((item) => item.player),
        'all-clear',
      );
      return;
    }
    const judged = this.players.map((player) => {
      const answer = this.sequences.get(player.id);
      const correct =
        answer !== undefined && answer.icons.join('|') === this.shown.join('|');
      return { player, answer, correct };
    });
    const failed = judged
      .filter((item) => !item.correct)
      .map((item) => item.player);
    if (failed.length === this.players.length) {
      this.resolve(failed, 'wipe');
      return;
    }
    if (failed.length > 0) {
      this.resolve(failed, 'failed');
      return;
    }
    const slowest = [...judged].sort(
      (a, b) => (b.answer?.at ?? 0) - (a.answer?.at ?? 0),
    );
    this.resolve(
      slowest.slice(0, 1).map((item) => item.player),
      'all-clear',
    );
  }

  private resolve(
    players: RoundPlayer[],
    reason: 'all-clear' | 'failed' | 'wipe',
  ): void {
    this.sentToHh = players.map((player) => ({
      playerId: player.id,
      name: player.name,
    }));
    this.pendingSent = this.sentToHh;
    this.phase = 'result';
    this.line = hhLine(
      this.sentToHh.map((player) => player.name),
      reason,
    );
  }
}

function hauntKind(gameId: Exclude<GameId, 'code-review'>): HauntKind {
  if (gameId === 'server-balance') return 'weight';
  if (gameId === 'friday-release') return 'window';
  if (gameId === 'night-pager') return 'band';
  if (gameId === 'red-button') return 'seal';
  return 'swap';
}

function hauntText(
  kind: HauntKind,
  ghostName: string,
  targetName: string,
): string {
  if (kind === 'weight') {
    return `${ghostName} вешает гирю. Досталось ${targetName}.`;
  }
  if (kind === 'window') {
    return `${ghostName} сужает зелёное окно. Досталось ${targetName}.`;
  }
  if (kind === 'band') {
    return `${ghostName} расширяет мёртвую зону. Досталось ${targetName}.`;
  }
  if (kind === 'seal') {
    return `${ghostName} заклеивает кнопку. Досталось ${targetName}.`;
  }
  return `${ghostName} подменяет алерт на телефоне. Досталось ${targetName}.`;
}

function rollWinds(random: () => number): number[] {
  return Array.from({ length: WIND_STEPS }, () => {
    const level = WIND_LEVELS[Math.floor(random() * WIND_LEVELS.length)] ?? 1;
    const sign = random() < 0.5 ? -1 : 1;
    return sign * level;
  });
}

export function stepRack(
  rack: Rack,
  wind: number,
  dt: number,
  now: number,
): void {
  if (!rack.alive || dt <= 0) return;
  const tilt = Math.sin((rack.angle * Math.PI) / 180);
  const accel =
    wind * WIND_FORCE + rack.hold * INPUT_FORCE + tilt * GRAVITY * rack.weight;
  rack.velocity = rack.velocity * 0.9 + accel * dt;
  rack.angle += rack.velocity * dt;
  if (Math.abs(rack.angle) > FAIL_ANGLE) {
    rack.alive = false;
    rack.fellAt = now;
    rack.hold = 0;
    return;
  }
  if (rack.hold !== 0 && Math.abs(rack.angle) < SCORE_ANGLE) {
    rack.score += SCORE_PER_SEC * dt;
  }
}

function asPlayers(racks: Rack[]): RoundPlayer[] {
  return racks.map((rack) => ({ id: rack.playerId, name: rack.name }));
}

function toRackView(rack: Rack): RackView {
  return {
    playerId: rack.playerId,
    name: rack.name,
    angle: Math.round(rack.angle * 10) / 10,
    score: Math.round(rack.score),
    alive: rack.alive,
    heavy: rack.weight > 1,
  };
}

function sameSequenceShape(
  sequence: string[] | undefined,
): sequence is string[] {
  return (
    Array.isArray(sequence) &&
    sequence.length === 4 &&
    sequence.every((item) => ALERT_ICONS.includes(item))
  );
}

function hhLine(
  names: string[],
  reason: 'all-clear' | 'failed' | 'wipe',
): HostLine {
  if (names.length === 0) {
    return {
      id: 'round.clean',
      text: 'Никого не отправили. Николай даже расстроен.',
    };
  }
  const list = names.join(', ');
  if (reason === 'all-clear') {
    return {
      id: 'round.all-clear',
      text: `Ух какие все молодцы. Но всё равно кого-то надо отправить на hh. Сегодня это ${list}.`,
    };
  }
  if (reason === 'wipe') {
    const verb = names.length === 1 ? 'уходит' : 'уходят';
    return {
      id: 'round.wipe',
      text: `Смена легла целиком. На hh ${verb} ${list}.`,
    };
  }
  return {
    id: 'fired',
    text: `${list}, доступ закрыли. hh уже открыт в соседней вкладке.`,
  };
}
