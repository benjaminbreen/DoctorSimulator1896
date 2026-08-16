import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';
import { POST as consultPost } from '../api/consult.mjs';
import { POST as npcDialoguePost } from '../api/npc-dialogue.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

// Mount the deployed serverless route on the dev server so custom questions
// work under `npm run game`. The key is read from the repo-root .env.local into
// this node process only; it is never passed to define(), so it cannot reach
// the browser bundle.
function serverlessRoutes() {
  const routes = [
    ['/api/consult', consultPost],
    ['/api/npc-dialogue', npcDialoguePost],
  ];
  return {
    name: 'serverless-routes',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv('', repoRoot, 'OPENAI');
      process.env.OPENAI_API_KEY ??= env.OPENAI_API_KEY;
      for (const [path, handler] of routes) {
        server.middlewares.use(path, async (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end();
            return;
          }
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const headers = Object.entries(req.headers).filter(([, value]) => typeof value === 'string');
          const response = await handler(new Request(`http://${req.headers.host}${path}`, {
            method: 'POST',
            headers,
            body: Buffer.concat(chunks),
          }));
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        });
      }
    },
  };
}

// `vite preview` sends `Cache-Control: no-cache` for everything, which makes a
// local preview a poor stand-in for the deployment: assets that Vercel lets the
// browser reuse get revalidated on every request instead. Mirror the rule in
// vercel.json so preview measurements mean something.
function productionAssetHeaders() {
  const cached = /^\/(models|textures|ui|newspapers)\//;
  return {
    name: 'production-asset-headers',
    apply: 'preview',
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (cached.test(req.url?.split('?')[0] ?? '')) {
          res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
        }
        next();
      });
    },
  };
}

// rapier3d-compat inlines its 1.5MB wasm as a 2MB base64 string, which lands in
// the entry chunk and has to be decoded and compiled before the first frame.
// Its init already accepts a URL and stream-compiles that, so point it at the
// .wasm the package also ships: the bytes move to a parallel request off the
// critical path. The match is deliberately strict — a rapier bump that renames
// the decoder should fail the build, not silently restore the 2MB.
function rapierWasmAsset() {
  const inlined = /[$\w]+\.toByteArray\("[A-Za-z0-9+/]{100000,}={0,2}"\)\.buffer/;
  return {
    name: 'rapier-wasm-asset',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('@dimforge/rapier3d-compat/rapier.mjs')) return null;
      if (!inlined.test(code)) {
        throw new Error('rapier-wasm-asset: inlined base64 wasm not found; check the rapier version');
      }
      return {
        code: code.replace(inlined, 'new URL("./rapier_wasm3d_bg.wasm", import.meta.url)'),
        map: null,
      };
    },
  };
}

export default {
  plugins: [react(), tailwindcss(), serverlessRoutes(), productionAssetHeaders(), rapierWasmAsset()],
  // Shared character modules live above game/, so resolve their Three.js
  // import from the game's dependency tree in clean monorepo builds.
  resolve: { dedupe: ['three'] },
  // Pre-bundling would inline the wasm again before rapierWasmAsset can see it.
  optimizeDeps: { exclude: ['@dimforge/rapier3d-compat'] },
  // PORT lets a second dev server run when 5175 is already taken.
  server: { host: '127.0.0.1', port: Number(process.env.PORT) || 5175, strictPort: true },
};
