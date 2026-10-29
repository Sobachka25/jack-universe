import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { voiceRoots } from './paths';

const cache = new Map<string, number>();

const BITRATES: Record<string, number[]> = {
  '1-1': [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  '1-2': [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  '1-3': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  '2-1': [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  '2-2': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  0: [11025, 12000, 8000],
};

/** Duration of an mp3 in ms by walking its frames (0 if unknown). */
export function mp3DurationMs(buffer: Buffer): number {
  let offset = 0;
  if (buffer.length > 10 && buffer.toString('latin1', 0, 3) === 'ID3') {
    const size =
      ((buffer[6] & 0x7f) << 21) |
      ((buffer[7] & 0x7f) << 14) |
      ((buffer[8] & 0x7f) << 7) |
      (buffer[9] & 0x7f);
    offset = 10 + size + (buffer[5] & 0x10 ? 10 : 0);
  }
  let seconds = 0;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff || (buffer[offset + 1] & 0xe0) !== 0xe0) {
      offset += 1;
      continue;
    }
    const b1 = buffer[offset + 1];
    const b2 = buffer[offset + 2];
    const versionBits = (b1 >> 3) & 3;
    const layerBits = (b1 >> 1) & 3;
    const rateIndex = (b2 >> 2) & 3;
    const bitIndex = b2 >> 4;
    const padding = (b2 >> 1) & 1;
    if (versionBits === 1 || layerBits === 0 || rateIndex === 3 || bitIndex === 0 || bitIndex === 15) {
      offset += 1;
      continue;
    }
    const layer = 4 - layerBits;
    const v1 = versionBits === 3;
    const table = v1 ? `1-${layer}` : layer === 1 ? '2-1' : '2-2';
    const bitrate = BITRATES[table][bitIndex] * 1000;
    const rate = RATES[versionBits][rateIndex];
    const samples = layer === 1 ? 384 : layer === 3 && !v1 ? 576 : 1152;
    const length =
      layer === 1
        ? Math.floor((12 * bitrate) / rate + padding) * 4
        : Math.floor(((samples / 8) * bitrate) / rate) + padding;
    if (length < 4) {
      offset += 1;
      continue;
    }
    seconds += samples / rate;
    offset += length;
  }
  return Math.round(seconds * 1000);
}

/** Duration of frontend/public/voice/<folder>/<file>, cached by path + mtime-free key. */
export function voiceDurationMs(folder: string, file: string): number {
  const key = `${folder}/${file}`;
  const known = cache.get(key);
  if (known !== undefined) return known;
  const roots = voiceRoots();
  let ms = 0;
  for (const root of roots) {
    const path = resolve(root, folder, file);
    if (!existsSync(path)) continue;
    try {
      ms = mp3DurationMs(readFileSync(path));
    } catch {
      ms = 0;
    }
    break;
  }
  cache.set(key, ms);
  return ms;
}
