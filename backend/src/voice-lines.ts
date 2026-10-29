import { existsSync, readdirSync } from 'fs';
import { resolve } from 'path';

export const VOICE_CATEGORIES = ['intro', 'countdown', 'answer', 'other'] as const;
export type VoiceCategory = (typeof VOICE_CATEGORIES)[number];

export function voiceLines(root = voiceRoot()): Record<VoiceCategory, string[]> {
  const result = {} as Record<VoiceCategory, string[]>;
  for (const category of VOICE_CATEGORIES) {
    const dir = root ? resolve(root, category) : '';
    result[category] =
      dir && existsSync(dir)
        ? readdirSync(dir)
            .filter((name) => /\.(mp3|ogg|wav|m4a)$/i.test(name))
            .sort()
        : [];
  }
  return result;
}

function voiceRoot(): string | null {
  const candidates = [
    resolve(process.cwd(), 'frontend', 'public', 'voice'),
    resolve(process.cwd(), '..', 'frontend', 'public', 'voice'),
  ];
  return candidates.find((path) => existsSync(path)) ?? null;
}
