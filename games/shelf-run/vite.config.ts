import { defineConfig, type Plugin } from 'vite';

// The score API only runs on Vercel. On the plain dev server this plugin:
// - serves /stats the way production does (cleanUrls),
// - reads /api/stats from the live site, so the stats page and the game-over
//   top list show real data,
// - answers every other /api call with a 503. The game treats that as "no
//   leaderboard", so local runs never land on the real board.
// `vercel dev` runs the real API against the dev keys instead.
const LIVE = 'https://shelfrun.vercel.app';
function localApi(): Plugin {
  return {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url ?? '').split('?')[0];
        if (path === '/stats') {
          req.url = '/stats.html';
          return next();
        }
        // api/_lib holds modules the game imports too (balance.ts), not routes
        if (!path.startsWith('/api/') || path.startsWith('/api/_lib/')) return next();
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.setHeader('cache-control', 'no-store');
        if (path === '/api/stats' && req.method === 'GET') {
          try {
            const r = await fetch(`${LIVE}/api/stats`);
            res.statusCode = r.status;
            res.end(await r.text());
          } catch {
            res.statusCode = 502;
            res.end('{"error":"the live stats are unreachable"}');
          }
          return;
        }
        res.statusCode = 503;
        res.end('{"error":"the score API is off on the dev server. Use vercel dev."}');
      });
    },
  };
}

export default defineConfig({
  plugins: [localApi()],
  build: {
    // Three.js alone is about 700 KB minified, so the default 500 KB warning always fires.
    chunkSizeWarningLimit: 1200,
    // two pages: the game, and the leaderboard and stats page
    rollupOptions: { input: { main: 'index.html', stats: 'stats.html' } },
  },
});
