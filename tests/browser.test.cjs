// node tests/browser.test.cjs   (needs: npm install, and Playwright's Chromium)
// HEADED=1 xvfb-run -a node tests/browser.test.cjs   (Linux, real hidden tabs)
// Opens the sketch and the compare page in Chromium with a fake webcam and checks:
//  1. the desk model loads and guesses from the camera
//  2. it keeps guessing while the tab is hidden (you're in another tab)
//  3. ml5's own classify() — the old path — does not, when the tab is hidden
//  4. the compare page tallies live frames and photo folders for every model
// p5 and ml5 come from node_modules, so it runs offline. bodyPose's model is
// downloaded from the web, so it may not load here; the sketch works without it.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  console.log('skip - browser: Playwright is not installed'); process.exit(0);
}
const ROOT = path.join(__dirname, '..');
const NM = path.join(ROOT, 'node_modules');
const LOCAL = {
  'https://unpkg.com/ml5@1.4.0/dist/ml5.min.js': path.join(NM, 'ml5/dist/ml5.min.js'),
  'https://cdn.jsdelivr.net/npm/p5@1.11.10/lib/p5.min.js': path.join(NM, 'p5/lib/p5.min.js'),
};
for (const f of Object.values(LOCAL)) if (!fs.existsSync(f)) { console.log('skip - browser: run `npm install` first'); process.exit(0); }

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.bin': 'application/octet-stream', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('ok -', name); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  // Headless Chromium never hides a background tab; HEADED=1 (with a display,
  // e.g. xvfb-run) runs a real window so the hidden-tab checks mean something.
  const browser = await chromium.launch({
    headless: !process.env.HEADED,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  });
  const context = await browser.newContext({ permissions: ['camera'] });
  await context.route('**/*', (route) => {
    const u = route.request().url();
    if (LOCAL[u]) return route.fulfill({ path: LOCAL[u], contentType: 'text/javascript' });
    if (u.startsWith(base)) return route.continue();
    return route.abort();     // fonts, bodyPose weights, the lock in app: not needed here
  });
  await context.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window), waiting = [];
    window.__noFrames = false;
    window.requestAnimationFrame = (cb) => raf(function run(t) { if (window.__noFrames) waiting.push(cb), raf(flush); else cb(t); });
    function flush(t) { if (!window.__noFrames) waiting.splice(0).forEach(cb => cb(t)); else raf(flush); }
  });
  const errors = [];

  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/sketch/`);

  await test('sketch loads the shipped desk model and guesses from the camera', async () => {
    await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Model loaded'), null, { timeout: 60000 });
    await page.waitForFunction(() => typeof tmGuess !== 'undefined' && tmGuess && tmGuess.label, null, { timeout: 20000 });
    const g = await page.evaluate(() => tmGuess);
    assert.ok(['working', 'phone', 'away'].includes(g.label), JSON.stringify(g));
    assert.ok(g.confidence > 0 && g.confidence <= 1);
  });

  // Count guesses, and run the old path (ml5's classify on the video) in a loop
  // beside it, first with the tab on screen, then with its window minimized.
  await page.evaluate(() => {
    window.__guesses = 0;
    const p = TMInput.predict;
    TMInput.predict = (...a) => { window.__guesses++; return p(...a); };
    window.__old = ml5.imageClassifier(new URL('model/model.json', location.href).href);
  });
  await page.waitForFunction(() => window.__old && window.__old.model, null, { timeout: 30000 });
  const measure = () => page.evaluate(async () => {
    window.__guesses = 0;
    let on = true, old = 0;
    const v = document.querySelector('video');
    (async () => { while (on) { await window.__old.classify(v); if (on) old++; } })();
    await new Promise(r => setTimeout(r, 6000));
    on = false;
    return { vis: document.visibilityState, guesses: window.__guesses, old };
  });
  const shown = await measure();
  // Chrome stops animation frames in a hidden tab. Headless (and Xvfb with no
  // window manager) never hides one, so do what Chrome does: stop the frames.
  await page.evaluate(() => { window.__noFrames = true; });
  const away = await measure();
  await page.evaluate(() => { window.__noFrames = false; });
  console.log(`   6 s on screen:       ${shown.guesses} guesses, old ml5 classify() answered ${shown.old}×`);
  console.log(`   6 s with no frames:  ${away.guesses} guesses, old ml5 classify() answered ${away.old}×`);

  await test('desk model keeps guessing when the tab gets no animation frames (hidden tab)', async () => {
    assert.ok(away.guesses >= Math.max(3, shown.guesses * 0.5), JSON.stringify({ shown, away }));
  });
  await test('old ml5 classify() stops with no animation frames (why the sketch no longer uses it)', async () => {
    assert.ok(shown.old >= 2, JSON.stringify(shown));
    assert.ok(away.old <= 1, JSON.stringify(away));
  });

  await test('?raw=1 still runs (old ml5 input, for side-by-side traces)', async () => {
    const p2 = await context.newPage();
    p2.on('pageerror', (e) => errors.push(e.message));
    await p2.goto(`${base}/sketch/?raw=1`);
    await p2.waitForFunction(() => tmGuess && tmGuess.label, null, { timeout: 60000 });
    assert.ok((await p2.textContent('#status')).includes('raw ml5 input'));
    await p2.close();
  });

  const cmp = await context.newPage();
  cmp.on('pageerror', (e) => errors.push(e.message));
  await cmp.goto(`${base}/sketch/compare/`);

  await test('compare page lists every shipped model with its training date', async () => {
    await cmp.waitForFunction(() => document.querySelectorAll('#models input:not([disabled])').length >= 3, null, { timeout: 60000 });
    const txt = await cmp.textContent('#models');
    assert.ok(/trained/.test(txt), txt);
  });

  await test('live: holding a key tallies every model, both inputs', async () => {
    await cmp.click('#cam');
    await cmp.waitForFunction(() => document.querySelector('#live-now').textContent.includes('%'), null, { timeout: 20000 });
    await cmp.keyboard.down('1');
    await sleep(2500);
    await cmp.keyboard.up('1');
    await sleep(1200);
    const rows = await cmp.$$eval('#results > table tr', trs => trs.slice(1).map(tr => tr.cells[0].textContent));
    const models = await cmp.$$eval('#models input:not([disabled])', x => x.length);
    assert.equal(rows.length, models * 2, rows.join(' | '));
    assert.ok(rows.some(r => r.includes('old ml5 input')));
  });

  await test('photos: a folder of working / phone / away photos is scored per model', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lockin-photos-'));
    const png = fs.readFileSync(path.join(ROOT, 'media', 'state-focus.png'));
    for (const c of ['working', 'phone', 'away']) {
      fs.mkdirSync(path.join(dir, 'lock in training', c), { recursive: true });
      for (let i = 0; i < 3; i++) fs.writeFileSync(path.join(dir, 'lock in training', c, `${i}.png`), png);
    }
    await cmp.click('#clear');
    await cmp.setInputFiles('#folder', path.join(dir, 'lock in training'));
    await cmp.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Done'), null, { timeout: 60000 });
    const status = await cmp.textContent('#status');
    assert.ok(/9 photos × [34] models/.test(status), status);
    const frames = await cmp.$$eval('#results > table tr', trs => trs.slice(1).map(tr => +tr.cells[1].textContent));
    assert.ok(frames.length >= 3 && frames.every(n => n === 9), frames.join(','));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await test('no page errors (other than bodyPose failing to download its model offline)', async () => {
    const offline = /Failed to fetch|reading 'estimatePoses'/;
    assert.deepEqual(errors.filter(e => !offline.test(e)), []);
  });

  await browser.close();
  server.close();
  console.log(`\n${passed} browser checks passed`);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
