// Regression guard: no horizontal page scroll at any width. DESIGN.md §4a.
import { chromium } from 'playwright-core';

const r = await fetch('http://localhost:8000/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@kairos.local', password: 'KairosAdmin123!' }),
});
if (r.status !== 200) throw new Error('login failed: ' + r.status);
const { access_token, refresh_token } = await r.json();
if (!access_token || access_token.split('.').length !== 3) throw new Error('malformed token');

const WIDTHS = [360, 768, 1024, 1440];
const ROUTES = ['/', '/management', '/assets', '/audit', '/governance', '/copilot', '/graph'];
const b = await chromium.launch();
let bad = 0;
console.log('route'.padEnd(14) + WIDTHS.map(w => String(w).padStart(7)).join(''));
console.log('-'.repeat(14 + 7 * WIDTHS.length));
for (const route of ROUTES) {
  let row = route.padEnd(14);
  for (const w of WIDTHS) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 }, reducedMotion: 'reduce' });
    await ctx.addInitScript(([t, rt]) => {
      localStorage.setItem('kairos-token', t);
      localStorage.setItem('kairos-refresh', rt);
      localStorage.setItem('kairos-theme', 'light');
    }, [access_token, refresh_token]);
    const p = await ctx.newPage();
    try {
      await p.goto('http://localhost:3000' + route, { waitUntil: 'networkidle', timeout: 35000 });
      await p.waitForTimeout(700);
      const over = await p.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
      if (over > 2) bad++;
      row += (over > 2 ? '+' + over : 'ok').padStart(7);
    } catch { row += 'ERR'.padStart(7); bad++; }
    await ctx.close();
  }
  console.log(row);
}
await b.close();
console.log(bad === 0 ? '\nPASS — no overflow' : `\nFAIL — ${bad} route/width combinations overflow`);
process.exit(bad === 0 ? 0 : 1);
