// npm run release -> release/jack-universe/ + release/jack-universe-linux.tar.gz (linux x64, no Node needed)
import { execSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync, copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(import.meta.url), '..', '..')
const out = resolve(root, 'release', 'jack-universe')
const run = (cmd, cwd = root) => {
  console.log(`> ${cmd}`)
  execSync(cmd, { cwd, stdio: 'inherit' })
}

run('npm run build --prefix frontend')
run('npm run build --prefix backend')

// one CommonJS file; Nest's optional integrations are never loaded at runtime
const optional = [
  '@nestjs/microservices',
  '@nestjs/microservices/*',
  '@nestjs/platform-fastify',
  '@fastify/static',
  'class-transformer',
  'class-transformer/*',
  'class-validator',
  'cache-manager',
  'bufferutil',
  'utf-8-validate',
]
mkdirSync(resolve(root, 'build'), { recursive: true })
run(
  `npx esbuild backend/dist/main.js --bundle --platform=node --target=node20 --format=cjs --outfile=build/server.cjs --log-level=warning ${optional.map((name) => `--external:${name}`).join(' ')}`,
)

rmSync(resolve(root, 'release'), { recursive: true, force: true })
mkdirSync(out, { recursive: true })
run(`npx pkg build/server.cjs --targets node22-linux-x64 --output release/jack-universe/jack-universe --no-bytecode --public --public-packages "*"`)

cpSync(resolve(root, 'frontend', 'dist'), resolve(out, 'public'), { recursive: true })
const sheet = 'вопросы.xlsx'
if (!existsSync(resolve(root, sheet))) throw new Error(`${sheet} not found in the project root`)
copyFileSync(resolve(root, sheet), resolve(out, sheet))
copyFileSync(resolve(root, 'scripts', 'README.txt'), resolve(out, 'README.txt'))

// tar keeps the executable bit set by the tar package regardless of the host OS
const tarball = resolve(root, 'release', 'jack-universe-linux.tar.gz')
const { create } = await import('tar')
await create(
  {
    gzip: true,
    file: tarball,
    cwd: resolve(root, 'release'),
    portable: true,
    onWriteEntry: (entry) => {
      if (entry.path.replace(/\\/g, '/') === 'jack-universe/jack-universe' && entry.header) entry.header.mode = 0o755
    },
  },
  ['jack-universe'],
)
console.log(existsSync(tarball) ? `\nDone: ${tarball}` : 'tarball missing')
