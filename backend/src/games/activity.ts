export const GAME_IDS = [
  'server-balance',
  'friday-release',
  'night-pager',
  'red-button',
  'alert-repeat',
  'code-review',
] as const;

export type GameId = (typeof GAME_IDS)[number];

export interface HostLine {
  id: string;
  text: string;
}

export interface RackView {
  playerId: string;
  name: string;
  angle: number;
  score: number;
  alive: boolean;
  heavy: boolean;
}

export type HauntKind = 'weight' | 'window' | 'band' | 'seal' | 'swap';

export interface HauntView {
  ghostId: string;
  ghostName: string;
  targetId: string;
  targetName: string;
  kind: HauntKind;
  text: string;
}

export interface SentPlayer {
  playerId: string;
  name: string;
}

interface ActivityBase {
  gameId: GameId;
  title: string;
  line: HostLine;
}

export interface BriefingActivity extends ActivityBase {
  status: 'briefing';
  blurb: string;
}

export interface ServerBalancePlay extends ActivityBase {
  status: 'play';
  gameId: 'server-balance';
  serverNow: number;
  endsAt: number;
  wind: number;
  racks: RackView[];
  haunts: HauntView[];
}

export interface FridayPlay extends ActivityBase {
  status: 'play';
  gameId: 'friday-release';
  serverNow: number;
  startedAt: number;
  endsAt: number;
  periodMs: number;
  greenCenter: number;
  greenHalf: number;
  tapped: string[];
  haunts: HauntView[];
}

export interface PagerPlay extends ActivityBase {
  status: 'play';
  gameId: 'night-pager';
  serverNow: number;
  endsAt: number;
  locked: string[];
  wideZone: boolean;
  haunts: HauntView[];
}

export interface RedButtonPlay extends ActivityBase {
  status: 'play';
  gameId: 'red-button';
  serverNow: number;
  endsAt: number;
  options: string[];
  locked: string[];
  sealedIndex: number | null;
  haunts: HauntView[];
}

export interface AlertPlay extends ActivityBase {
  status: 'play';
  gameId: 'alert-repeat';
  serverNow: number;
  revealUntil: number;
  endsAt: number;
  sequence: string[];
  icons: string[];
  locked: string[];
  haunts: HauntView[];
}

export interface ResultActivity extends ActivityBase {
  status: 'result';
  sentToHh: SentPlayer[];
}

export type PlayActivity =
  ServerBalancePlay | FridayPlay | PagerPlay | RedButtonPlay | AlertPlay;

export type ActivitySnapshot = BriefingActivity | PlayActivity | ResultActivity;
