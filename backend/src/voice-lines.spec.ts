import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { voiceLines } from './voice-lines';

describe('voiceLines', () => {
  it('lists audio files per category and ignores the rest', () => {
    const root = mkdtempSync(join(tmpdir(), 'voice-'));
    mkdirSync(join(root, 'countdown'));
    mkdirSync(join(root, 'answer'));
    writeFileSync(join(root, 'countdown', 'countdown_02.mp3'), '');
    writeFileSync(join(root, 'countdown', 'countdown_01.mp3'), '');
    writeFileSync(join(root, 'countdown', 'notes.txt'), '');
    writeFileSync(join(root, 'answer', 'answer_01.mp3'), '');
    expect(voiceLines(root)).toEqual({
      intro: [],
      countdown: ['countdown_01.mp3', 'countdown_02.mp3'],
      answer: ['answer_01.mp3'],
      other: [],
    });
  });

  it('finds the real voice folder of the project', () => {
    const lines = voiceLines();
    expect(lines.countdown.length).toBeGreaterThan(0);
    expect(lines.answer.length).toBeGreaterThan(0);
  });
});
