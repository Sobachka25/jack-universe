import type { ActivitySnapshot, HostLine } from './activity';

export interface ScoreSeat {
  playerId: string;
  name: string;
  score: number;
  ghost: boolean;
  lane: number;
  role: 'living' | 'safe' | 'awaiting' | 'ghost';
}

export interface PointGain {
  playerId: string;
  name: string;
  points: number;
}

export interface ShowFail {
  playerId: string;
  name: string;
}

export type ShowStage =
  | {
      kind: 'trivia' | 'finale';
      prompt: string;
      audio: string | null;
      readUntil: number | null;
      intro: string | null;
      options: string[];
      locked: string[];
      serverNow: number;
      endsAt: number;
      exitAt: number | null;
    }
  | {
      kind: 'trivia-result' | 'finale-step' | 'punishment-result';
      correct: string | null;
      options: string[];
      gained: PointGain[];
      failed: ShowFail[];
      exitAt: number | null;
      announce: boolean;
      answerLine: string | null;
      revealed: boolean;
    }
  | { kind: 'intro'; audio: string; serverNow: number; endsAt: number }
  | {
      kind: 'briefing';
      title: string;
      audio: string | null;
      text: string;
      serverNow: number;
      endsAt: number;
    }
  | {
      kind: 'countdown';
      title: string;
      serverNow: number;
      endsAt: number;
    }
  | { kind: 'punishment'; activity: ActivitySnapshot }
  | { kind: 'done'; winnerId: string; winnerName: string; exitAt: number };

export interface ShowSnapshot {
  paused: boolean;
  round: number;
  roundCount: number;
  stake: number;
  line: HostLine;
  seats: ScoreSeat[];
  stage: ShowStage;
}
