import { existsSync } from 'fs';
import { dirname, resolve } from 'path';

/** True when running from the packaged single binary (pkg). */
export const packaged = Boolean((process as { pkg?: unknown }).pkg);

/** Folders that may hold public/, frontend/public/ and the questions xlsx, most specific first. */
export function appRoots(): string[] {
  const roots: string[] = [];
  if (process.env.JU_ROOT) roots.push(resolve(process.env.JU_ROOT));
  if (packaged) roots.push(dirname(process.execPath));
  roots.push(process.cwd(), resolve(process.cwd(), '..'));
  return [...new Set(roots)];
}

/** Existing voice folders: <root>/public/voice (release) or <root>/frontend/public/voice (sources). */
export function voiceRoots(): string[] {
  return appRoots()
    .flatMap((root) => [resolve(root, 'public', 'voice'), resolve(root, 'frontend', 'public', 'voice')])
    .filter((path) => existsSync(path));
}

/** Built frontend to serve in production: <root>/public (release) or <root>/frontend/dist. */
export function staticRoot(): string | null {
  const found = appRoots()
    .flatMap((root) => [resolve(root, 'public'), resolve(root, 'frontend', 'dist')])
    .find((path) => existsSync(resolve(path, 'index.html')));
  return found ?? null;
}
