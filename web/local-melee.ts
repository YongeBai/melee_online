import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import type { Plugin } from 'vite';

/** Local development only. The user's disc is never part of a web build. */
export function localMelee(): Plugin {
  const root = resolve(import.meta.dirname, '..');
  const engine = resolve(root, 'engines/wasm-dolphin');
  const runtime = resolve(root, 'scripts/engine');
  const mime: Record<string, string> = {
    '.js': 'text/javascript',
    '.html': 'text/html',
    '.css': 'text/css',
    '.wasm': 'application/wasm',
    '.json': 'application/json',
    '.png': 'image/png',
  };
  return {
    name: 'local-melee',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = new URL(req.url || '/', 'http://localhost').pathname;
        if (
          !path.startsWith('/play/') &&
          !path.startsWith('/engine/') &&
          path !== '/local-disc'
        )
          return next();
        let hostname: string;
        try {
          hostname = new URL('http://' + (req.headers.host || '')).hostname;
        } catch {
          res.writeHead(400);
          res.end();
          return;
        }
        if (!['localhost', '127.0.0.1', '[::1]'].includes(hostname)) {
          res.writeHead(403);
          res.end('Local host only');
          return;
        }
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405, { Allow: 'GET, HEAD' });
          res.end();
          return;
        }
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
        let file: string;
        if (path === '/play/vendor/three.module.js') {
          file = resolve(root, 'web/node_modules/three/build/three.module.js');
          res.setHeader('Cache-Control', 'no-cache');
        } else if (path.startsWith('/play/assets/')) {
          const base = resolve(root, '.melee-assets');
          file = resolve(base, path.slice('/play/assets/'.length));
          if (!file.startsWith(base + sep)) {
            res.writeHead(403);
            res.end();
            return;
          }
          res.setHeader('Cache-Control', 'private, no-cache');
        } else if (path === '/local-disc') {
          const discs = readdirSync(root).filter((name) =>
            /\.(iso|gcm)$/i.test(name),
          );
          const name =
            discs.find((name) => /melee/i.test(name)) ||
            (discs.length === 1 ? discs[0] : undefined);
          if (!name) {
            res.writeHead(404);
            res.end('Melee disc not found in the project directory.');
            return;
          }
          file = resolve(root, name);
          res.setHeader('Cache-Control', 'private, no-store');
        } else {
          const base =
            path.startsWith('/engine/') || path.startsWith('/play/cores/')
              ? engine
              : runtime;
          const relative =
            path === '/play/'
              ? 'melee.html'
              : path.replace(/^\/(engine|play)\//, '');
          try {
            file = resolve(base, decodeURIComponent(relative));
          } catch {
            res.writeHead(400);
            res.end();
            return;
          }
          res.setHeader('Cache-Control', 'no-cache');
          if (!file.startsWith(base + sep)) {
            res.writeHead(403);
            res.end();
            return;
          }
        }
        if (!existsSync(file) || !statSync(file).isFile()) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const size = statSync(file).size;
        res.setHeader(
          'Content-Type',
          mime[extname(file)] || 'application/octet-stream',
        );
        res.setHeader('Accept-Ranges', 'bytes');
        let start = 0,
          end = size - 1;
        if (req.headers.range) {
          const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
          if (!match || Number(match[1]) >= size) {
            res.writeHead(416, { 'Content-Range': `bytes */${size}` });
            res.end();
            return;
          }
          start = Number(match[1]);
          end = match[2] ? Math.min(Number(match[2]), end) : end;
          if (end < start) {
            res.writeHead(416);
            res.end();
            return;
          }
          res.statusCode = 206;
          res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
        }
        res.setHeader('Content-Length', end - start + 1);
        if (req.method === 'HEAD') {
          res.end();
          return;
        }
        const stream = createReadStream(file, { start, end });
        stream.on('error', () => res.destroy());
        res.on('close', () => stream.destroy());
        stream.pipe(res);
      });
    },
  };
}
