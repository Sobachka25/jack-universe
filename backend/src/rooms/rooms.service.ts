import { randomBytes, randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { GameInput, PartyRound } from '../games/party-round';
import {
  EMPTY_ROOM_TTL_MS,
  MAX_PLAYERS,
  Player,
  Room,
  RoomError,
  RoomPhase,
  RoomSnapshot,
  makeRoomCode,
  normalizeCode,
  normalizeName,
} from './room.model';

interface Membership {
  code: string;
  role: 'screen' | 'player';
  playerId?: string;
}

interface PlayerLink {
  code: string;
  playerId: string;
}

export interface RoomLimits {
  maxPlayers: number;
  emptyTtlMs: number;
}

export interface ScreenSession {
  code: string;
  screenToken: string;
  snapshot: RoomSnapshot;
  previousCode: string | null;
}

export interface PlayerSessionResult {
  playerId: string;
  playerToken: string;
  name: string;
  snapshot: RoomSnapshot;
  previousCode: string | null;
  displacedSocketId: string | null;
}

export interface ScreenAttachResult {
  snapshot: RoomSnapshot;
  previousCode: string | null;
  displacedSocketId: string | null;
}

export interface KickResult {
  snapshot: RoomSnapshot;
  kickedSocketId: string | null;
}

@Injectable()
export class RoomsService {
  /**
   * Nest constructs this with an empty constructor. Tests replace the limits
   * before using the service; a constructor argument would be treated as DI.
   */
  limits: RoomLimits = {
    maxPlayers: MAX_PLAYERS,
    emptyTtlMs: EMPTY_ROOM_TTL_MS,
  };

  private readonly rooms = new Map<string, Room>();
  private readonly rounds = new Map<string, PartyRound>();
  private readonly sockets = new Map<string, Membership>();
  private readonly playerTokens = new Map<string, PlayerLink>();
  private readonly emptySince = new Map<string, number>();

  createRoom(socketId: string): ScreenSession {
    const previousCode = this.takeSocket(socketId);
    const code = this.allocateCode();
    const room: Room = {
      code,
      phase: 'lobby',
      maxPlayers: this.limits.maxPlayers,
      players: new Map(),
      screenSocketId: socketId,
      screenToken: randomUUID(),
      createdAt: Date.now(),
    };
    this.rooms.set(code, room);
    this.sockets.set(socketId, { code, role: 'screen' });
    this.markPresence(room);
    return {
      code,
      screenToken: room.screenToken,
      snapshot: this.toSnapshot(room),
      previousCode,
    };
  }

  attachScreen(
    socketId: string,
    rawCode: string,
    token: string,
  ): ScreenAttachResult {
    const code = this.parseCode(rawCode);
    const room = this.requireRoom(code);
    if (room.screenToken !== token) {
      throw new RoomError('Это не экран этой комнаты');
    }
    if (room.screenSocketId === socketId) {
      return {
        snapshot: this.toSnapshot(room),
        previousCode: null,
        displacedSocketId: null,
      };
    }

    const previousCode = this.takeSocket(socketId);
    const displacedSocketId = room.screenSocketId;
    if (displacedSocketId) {
      this.sockets.delete(displacedSocketId);
    }
    room.screenSocketId = socketId;
    this.sockets.set(socketId, { code, role: 'screen' });
    this.markPresence(room);
    return {
      snapshot: this.toSnapshot(room),
      previousCode,
      displacedSocketId,
    };
  }

  join(
    socketId: string,
    rawCode: string,
    rawName: string,
  ): PlayerSessionResult {
    const code = this.parseCode(rawCode);
    const name = this.parseName(rawName);
    const room = this.requireRoom(code);
    const membership = this.sockets.get(socketId);
    if (membership?.code === code && membership.role === 'player') {
      const current = room.players.get(membership.playerId ?? '');
      if (current) {
        return {
          playerId: current.id,
          playerToken: current.token,
          name: current.name,
          snapshot: this.toSnapshot(room, current.id),
          previousCode: null,
          displacedSocketId: null,
        };
      }
    }

    if (room.players.size >= room.maxPlayers) {
      throw new RoomError(
        `В комнате уже ${room.maxPlayers} ${personWord(room.maxPlayers)}`,
      );
    }
    const nameKey = name.toLocaleLowerCase('ru-RU');
    for (const player of room.players.values()) {
      if (player.name.toLocaleLowerCase('ru-RU') === nameKey) {
        throw new RoomError('Это имя уже занято');
      }
    }

    const previousCode = this.takeSocket(socketId);
    const player: Player = {
      id: randomUUID(),
      name,
      token: randomUUID(),
      connected: true,
      onHh: false,
      pinnedHh: false,
      socketId,
    };
    room.players.set(player.id, player);
    this.playerTokens.set(player.token, { code, playerId: player.id });
    this.sockets.set(socketId, {
      code,
      role: 'player',
      playerId: player.id,
    });
    this.markPresence(room);
    return {
      playerId: player.id,
      playerToken: player.token,
      name: player.name,
      snapshot: this.toSnapshot(room, player.id),
      previousCode,
      displacedSocketId: null,
    };
  }

  rejoin(
    socketId: string,
    rawCode: string,
    token: string,
  ): PlayerSessionResult {
    const code = this.parseCode(rawCode);
    const room = this.requireRoom(code);
    const link = this.playerTokens.get(token);
    const player =
      link && link.code === code ? room.players.get(link.playerId) : undefined;
    if (!player) {
      throw new RoomError('Не получилось вернуться в комнату');
    }
    if (player.socketId === socketId && player.connected) {
      return {
        playerId: player.id,
        playerToken: player.token,
        name: player.name,
        snapshot: this.toSnapshot(room, player.id),
        previousCode: null,
        displacedSocketId: null,
      };
    }

    const displacedSocketId =
      player.socketId && player.socketId !== socketId ? player.socketId : null;
    const previousCode = this.takeSocket(socketId);
    if (displacedSocketId) {
      this.sockets.delete(displacedSocketId);
    }
    player.socketId = socketId;
    player.connected = true;
    this.sockets.set(socketId, {
      code,
      role: 'player',
      playerId: player.id,
    });
    this.markPresence(room);
    return {
      playerId: player.id,
      playerToken: player.token,
      name: player.name,
      snapshot: this.toSnapshot(room, player.id),
      previousCode,
      displacedSocketId,
    };
  }

  selectGame(socketId: string, gameId: string): RoomSnapshot {
    const room = this.requireScreenRoom(socketId);
    const current = this.rounds.get(room.code);
    if (current?.snapshot(Date.now()).status === 'play') {
      throw new RoomError('Сначала закройте текущий раунд');
    }
    this.rounds.set(room.code, PartyRound.briefing(gameId));
    room.phase = 'live';
    return this.toSnapshot(room);
  }

  startGame(socketId: string): RoomSnapshot {
    const room = this.requireScreenRoom(socketId);
    const round = this.rounds.get(room.code);
    if (!round) throw new RoomError('Сначала выберите мини-игру');
    const { living, ghosts } = this.rosters(room, false);
    round.start(Date.now(), living, ghosts);
    return this.toSnapshot(room);
  }

  armGame(socketId: string, gameId: string): RoomSnapshot {
    const room = this.requireScreenRoom(socketId);
    const round = PartyRound.briefing(gameId);
    const { living, ghosts } = this.rosters(room, true);
    round.start(Date.now(), living, ghosts);
    this.clearHh(room);
    this.rounds.set(room.code, round);
    room.phase = 'live';
    return this.toSnapshot(room);
  }

  pinGhost(socketId: string, playerId: string): RoomSnapshot {
    const room = this.requireScreenRoom(socketId);
    const player = room.players.get(playerId);
    if (!player) throw new RoomError('Игрока уже нет в комнате');
    player.onHh = true;
    player.pinnedHh = true;
    return this.toSnapshot(room);
  }

  replayGame(socketId: string): RoomSnapshot {
    const room = this.requireScreenRoom(socketId);
    const round = this.rounds.get(room.code);
    if (!round) throw new RoomError('Сначала выберите мини-игру');
    return this.armGame(socketId, round.snapshot(Date.now()).gameId);
  }

  stopGame(socketId: string): RoomSnapshot {
    const room = this.requireScreenRoom(socketId);
    this.rounds.delete(room.code);
    return this.toSnapshot(room);
  }

  gameInput(socketId: string, input: GameInput): string | null {
    const membership = this.sockets.get(socketId);
    if (!membership || membership.role !== 'player' || !membership.playerId) {
      throw new RoomError('Играют с телефона');
    }
    const room = this.rooms.get(membership.code);
    const round = room ? this.rounds.get(room.code) : undefined;
    if (!room || !round) throw new RoomError('Раунд ещё не идёт');
    const changed = round.input(membership.playerId, input, Date.now());
    this.applySent(room);
    return changed ? room.code : null;
  }

  tick(now = Date.now()): string[] {
    const dirty: string[] = [];
    for (const [code, round] of this.rounds) {
      if (!round.tick(now)) continue;
      const room = this.rooms.get(code);
      if (!room) continue;
      this.applySent(room);
      dirty.push(code);
    }
    return dirty;
  }

  setPhase(socketId: string, phase: RoomPhase): RoomSnapshot {
    if (phase !== 'lobby' && phase !== 'live') {
      throw new RoomError('Неизвестная фаза');
    }
    const room = this.requireScreenRoom(socketId);
    room.phase = phase;
    return this.toSnapshot(room);
  }

  kick(socketId: string, playerId: string): KickResult {
    const room = this.requireScreenRoom(socketId);
    const player = room.players.get(playerId);
    if (!player) {
      throw new RoomError('Игрока нет в комнате');
    }
    room.players.delete(playerId);
    this.playerTokens.delete(player.token);
    if (player.socketId) {
      this.sockets.delete(player.socketId);
    }
    this.markPresence(room);
    return {
      snapshot: this.toSnapshot(room),
      kickedSocketId: player.socketId,
    };
  }

  disconnect(socketId: string): string | null {
    return this.takeSocket(socketId);
  }

  snapshot(code: string, socketId?: string): RoomSnapshot | null {
    const room = this.rooms.get(normalizeCode(code));
    if (!room) return null;
    return this.toSnapshot(room, socketId ? this.viewerId(socketId) : null);
  }

  sweep(now = Date.now()): string[] {
    const closed: string[] = [];
    for (const [code, since] of this.emptySince) {
      if (now - since < this.limits.emptyTtlMs) continue;
      this.deleteRoom(code);
      closed.push(code);
    }
    return closed;
  }

  private allocateCode(): string {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const bytes = randomBytes(4);
      const code = makeRoomCode((index) => bytes[index] ?? 0);
      if (!this.rooms.has(code)) return code;
    }
    throw new RoomError('Не удалось создать комнату');
  }

  private parseCode(rawCode: string): string {
    const code = normalizeCode(rawCode);
    if (code.length !== 4) {
      throw new RoomError('Код комнаты — 4 символа');
    }
    return code;
  }

  private parseName(rawName: string): string {
    const name = normalizeName(rawName);
    const length = [...name].length;
    if (length === 0) throw new RoomError('Введите имя');
    if (length > 20) throw new RoomError('Имя длиннее 20 символов');
    return name;
  }

  private requireRoom(code: string): Room {
    const room = this.rooms.get(code);
    if (!room) throw new RoomError('Такой комнаты нет');
    return room;
  }

  private requireScreenRoom(socketId: string): Room {
    const membership = this.sockets.get(socketId);
    if (!membership || membership.role !== 'screen') {
      throw new RoomError('Только экран может управлять комнатой');
    }
    const room = this.rooms.get(membership.code);
    if (!room || room.screenSocketId !== socketId) {
      throw new RoomError('Только экран может управлять комнатой');
    }
    return room;
  }

  private takeSocket(socketId: string): string | null {
    const membership = this.sockets.get(socketId);
    if (!membership) return null;
    this.sockets.delete(socketId);
    const room = this.rooms.get(membership.code);
    if (!room) return null;
    if (membership.role === 'screen' && room.screenSocketId === socketId) {
      room.screenSocketId = null;
    }
    if (membership.role === 'player' && membership.playerId) {
      const player = room.players.get(membership.playerId);
      if (player?.socketId === socketId) {
        player.connected = false;
        player.socketId = null;
      }
    }
    this.markPresence(room);
    return room.code;
  }

  private markPresence(room: Room): void {
    if (this.hasPresence(room)) {
      this.emptySince.delete(room.code);
      return;
    }
    if (!this.emptySince.has(room.code)) {
      this.emptySince.set(room.code, Date.now());
    }
  }

  private hasPresence(room: Room): boolean {
    if (room.screenSocketId) return true;
    for (const player of room.players.values()) {
      if (player.connected) return true;
    }
    return false;
  }

  private deleteRoom(code: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    for (const player of room.players.values()) {
      this.playerTokens.delete(player.token);
      if (player.socketId) this.sockets.delete(player.socketId);
    }
    if (room.screenSocketId) this.sockets.delete(room.screenSocketId);
    this.rooms.delete(code);
    this.rounds.delete(code);
    this.emptySince.delete(code);
  }

  private rosters(room: Room, revive: boolean) {
    const connected = [...room.players.values()].filter(
      (player) => player.connected,
    );
    const ghosts = connected.filter(
      (player) => player.onHh && (!revive || player.pinnedHh),
    );
    const ghostIds = new Set(ghosts.map((player) => player.id));
    const living = connected.filter((player) => !ghostIds.has(player.id));
    const asRound = (player: Player) => ({ id: player.id, name: player.name });
    return { living: living.map(asRound), ghosts: ghosts.map(asRound) };
  }

  private clearHh(room: Room): void {
    for (const player of room.players.values()) {
      if (!player.pinnedHh) player.onHh = false;
    }
  }

  private viewerId(socketId: string): string | null {
    const membership = this.sockets.get(socketId);
    if (membership?.role !== 'player') return null;
    return membership.playerId ?? null;
  }

  private applySent(room: Room): void {
    const round = this.rounds.get(room.code);
    if (!round) return;
    for (const playerId of round.takeSentIds()) {
      const player = room.players.get(playerId);
      if (player) player.onHh = true;
    }
  }

  private toSnapshot(room: Room, viewerId: string | null = null): RoomSnapshot {
    return {
      code: room.code,
      phase: room.phase,
      maxPlayers: room.maxPlayers,
      players: [...room.players.values()].map((player) => ({
        id: player.id,
        name: player.name,
        connected: player.connected,
        onHh: player.onHh,
      })),
      screenConnected: Boolean(room.screenSocketId),
      activity:
        this.rounds.get(room.code)?.snapshot(Date.now(), viewerId) ?? null,
    };
  }
}

function personWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'человек';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return 'человека';
  }
  return 'человек';
}
