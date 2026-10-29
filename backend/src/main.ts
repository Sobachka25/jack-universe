import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter, type NestExpressApplication } from '@nestjs/platform-express';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { spawn } from 'child_process';
import type { NextFunction, Request, Response } from 'express';
import { networkInterfaces } from 'os';
import { resolve } from 'path';
import { AppModule } from './app.module';
import { packaged, staticRoot } from './paths';

const production = packaged || process.env.NODE_ENV === 'production';

async function bootstrap() {
  // explicit adapters: no dynamic require, so the bundled binary needs no node_modules
  const app = await NestFactory.create<NestExpressApplication>(AppModule, new ExpressAdapter());
  app.useWebSocketAdapter(new IoAdapter(app));
  app.enableCors({ origin: true });

  const web = production ? staticRoot() : null;
  if (web) {
    app.useStaticAssets(web, { index: 'index.html' });
    const index = resolve(web, 'index.html');
    // SPA fallback: page navigations (Accept: text/html) to client routes get index.html
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' || req.path.startsWith('/socket.io')) return next();
      if (!String(req.headers.accept ?? '').includes('text/html')) return next();
      if (/\.[a-z0-9]+$/i.test(req.path)) return next();
      res.sendFile(index);
    });
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  if (production) announce(port, web);
}

function announce(port: number, web: string | null) {
  const ips: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) {
      const family = String(net.family);
      if (!net.internal && (family === 'IPv4' || family === '4')) ips.push(net.address);
    }
  }
  const local = `http://localhost:${port}`;
  console.log('\n  Jack Universe is running');
  console.log(`  Screen (this computer): ${local}`);
  for (const ip of ips) console.log(`  Phones (same Wi-Fi):    http://${ip}:${port}`);
  if (!web) console.log('  WARNING: public/ folder with the site was not found next to the binary');
  console.log('  Stop: Ctrl+C\n');
  if (process.platform === 'linux' && !process.env.JU_NO_BROWSER) openBrowser(local);
}

// best effort: open the screen page in the default browser (ignored on servers without a desktop)
function openBrowser(url: string) {
  try {
    const child = spawn('xdg-open', [url], { stdio: 'ignore', detached: true });
    child.on('error', () => undefined);
    child.unref();
  } catch {
    // the printed URLs are enough
  }
}

void bootstrap();
