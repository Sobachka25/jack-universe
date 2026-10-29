import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { inflateRawSync } from 'zlib';
import { RoomError } from '../rooms/room.model';
import { appRoots } from '../paths';

export interface QuizQuestion {
  prompt: string;
  correct: string;
  wrong: string[];
  audio?: string;
}

export function loadQuizQuestions(): QuizQuestion[] {
  const file = questionsFile();
  const rows = readRows(readFileSync(file));
  const questions = rows.slice(1).flatMap((row) => {
    const prompt = row.A?.trim() ?? '';
    const correct = row.B?.trim() ?? '';
    const wrong = [row.C, row.D, row.E]
      .map((value) => value?.trim() ?? '')
      .filter((value) => value.length > 0);
    if (!prompt || !correct || wrong.length < 3) return [];
    const audio = row.F?.trim() ?? '';
    return [
      {
        prompt,
        correct,
        wrong: wrong.slice(0, 3),
        ...(audio ? { audio } : {}),
      },
    ];
  });
  if (questions.length === 0) throw new RoomError('В файле нет вопросов');
  return questions;
}

function questionsFile(): string {
  const candidates = appRoots().map((root) => resolve(root, 'вопросы.xlsx'));
  const found = candidates.find((path) => existsSync(path));
  if (!found) throw new RoomError('Файл с вопросами не найден');
  return found;
}

function readRows(file: Buffer): Array<Record<string, string>> {
  const parts = unzip(file);
  const shared = parts.get('xl/sharedStrings.xml');
  const sheet = parts.get('xl/worksheets/sheet1.xml');
  if (!sheet) throw new RoomError('В файле нет листа с вопросами');
  const strings = shared ? readStrings(shared) : [];
  const rows = new Map<number, Record<string, string>>();
  const cells =
    sheet
      .toString('utf8')
      .match(/<c\b[^>]*r="([A-Z]+)(\d+)"[^>]*>[\s\S]*?<\/c>/g) ?? [];
  for (const cell of cells) {
    const ref = /r="([A-Z]+)(\d+)"/.exec(cell);
    if (!ref) continue;
    const column = ref[1] ?? '';
    const rowNumber = Number(ref[2]);
    const type = /t="([^"]+)"/.exec(cell)?.[1];
    const raw = /<v>([\s\S]*?)<\/v>/.exec(cell)?.[1] ?? '';
    const value =
      type === 's'
        ? (strings[Number(raw)] ?? '')
        : type === 'inlineStr'
          ? (readStrings(Buffer.from(cell.replace(/<is\b/, '<si').replace(/<\/is>/, '</si>')))[0] ?? '')
          : decodeXml(raw);
    const row = rows.get(rowNumber) ?? {};
    row[column] = value;
    rows.set(rowNumber, row);
  }
  return [...rows.entries()]
    .sort((left, right) => left[0] - right[0])
    .map((entry) => entry[1]);
}

function readStrings(xml: Buffer): string[] {
  const source = xml.toString('utf8');
  const items = source.match(/<si\b[\s\S]*?<\/si>/g) ?? [];
  return items.map((item) => {
    const texts = [...item.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(
      (match) => decodeXml(match[1] ?? ''),
    );
    return texts.join('');
  });
}

function decodeXml(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

function unzip(file: Buffer): Map<string, Buffer> {
  const parts = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 30 <= file.length) {
    if (file.readUInt32LE(offset) !== 0x04034b50) break;
    const method = file.readUInt16LE(offset + 8);
    const compressedSize = file.readUInt32LE(offset + 18);
    const nameLength = file.readUInt16LE(offset + 26);
    const extraLength = file.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = file
      .subarray(nameStart, nameStart + nameLength)
      .toString('utf8');
    const dataStart = nameStart + nameLength + extraLength;
    const data = file.subarray(dataStart, dataStart + compressedSize);
    parts.set(name, method === 0 ? Buffer.from(data) : inflateRawSync(data));
    offset = dataStart + compressedSize;
  }
  return parts;
}
