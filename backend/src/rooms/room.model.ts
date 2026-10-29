import type { ActivitySnapshot } from '../games/activity';
import type { ShowSnapshot } from '../games/show';

export const MAX_PLAYERS = 100;
export const EMPTY_ROOM_TTL_MS = 2 * 60 * 1000;
export const ROOM_CODE_LENGTH = 4;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export type RoomPhase = 'lobby' | 'live';

export interface Player {
  id: string;
  name: string;
  token: string;
  connected: boolean;
  onHh: boolean;
  pinnedHh: boolean;
  socketId: string | null;
}

export interface Room {
  code: string;
  phase: RoomPhase;
  maxPlayers: number;
  players: Map<string, Player>;
  screenSocketId: string | null;
  screenToken: string;
  createdAt: number;
}

export interface PublicPlayer {
  id: string;
  name: string;
  connected: boolean;
  onHh: boolean;
}

export interface RoomSnapshot {
  code: string;
  phase: RoomPhase;
  maxPlayers: number;
  players: PublicPlayer[];
  screenConnected: boolean;
  activity: ActivitySnapshot | null;
  show: ShowSnapshot | null;
}

export class RoomError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoomError';
  }
}

export function normalizeCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '');
}

export function normalizeName(input: string): string {
  let cleaned = '';
  for (const char of input) {
    if (char.charCodeAt(0) <= 31) continue;
    cleaned += char;
  }
  return cleaned.trim().replace(/\s+/g, ' ');
}

export function makeRoomCode(randomByte: (index: number) => number): string {
  let code = '';
  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    code += CODE_ALPHABET[randomByte(index) % CODE_ALPHABET.length];
  }
  return code;
}
