// model compare: run every desk model on the same pictures and count mistakes.
// Uses ml5's TensorFlow.js (ml5.tf) and tm-input.js, the same input code the sketch uses.

// Every model that ships with the sketch, newest first. The page reads each one's
// training date from its metadata.json.
const SHIPPED = [
  { url: '../model/', name: 'model/ (the sketch loads this one)' },
  { url: '../model-v3/', name: 'model 3' },
  { url: '../model-classroom/', name: 'model 2 · classroom' },
  { url: '../model-desk/', name: 'model 1 · first desk' },
];
const CLASSES = ['working', 'phone', 'away'];
const MIN_CONF = HandsFree.DEFAULTS.minConf;   // the sketch ignores guesses under this
const tf = ml5.tf;

const models = [];          // { url, name, m, on }
const results = new Map();  // key -> tally
const rows = [];            // CSV rows
let truth = null, heldKey = null, stickyTruth = null;
let camOn = false, lastSample = 0, bodyPose = null, poseBusy = false, lastPose = null;

const $ = (id) => document.getElementById(id);
const matched = TMInput.makeCanvas(), raw = TMInput.makeCanvas(), photo = TMInput.makeCanvas();
const seeMatched = $('seeMatched').getContext('2d'), seeRaw = $('seeRaw').getContext('2d');

function status(msg) { $('status').innerHTML = msg; }
function pct(x) { return `${Math.round(x * 100)}%`; }
function trainedOn(m) {
  const ts = m && m.meta && m.meta.timeStamp;
  return ts ? new Date(ts).toLocaleString([], { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
}

// ---------- models ----------
async function addModel(url, name, shipped = false) {
  const abs = new URL(url, location.href).href;
  if (models.some(x => x.m && x.m.url === abs.replace(/model\.json$/, ''))) return;
  const entry = { url: abs, name, m: null, on: true, error: null };
  models.push(entry);
  renderModels();
  try {
    entry.m = await TMInput.loadModel(tf, abs);
    const odd = entry.m.labels.filter(l => !HandsFree.normalizeLabel(l));
    if (odd.length) entry.error = `class names it can't map: ${odd.join(', ')}`;
  } catch (e) {
    entry.error = 'not found';
    entry.on = false;
    if (shipped) models.splice(models.indexOf(entry), 1);   // not every slot is filled
  }
  renderModels();
}

function renderModels() {
  $('models').innerHTML = models.map((x, i) => `
    <label class="small check"><input type="checkbox" data-i="${i}" ${x.on ? 'checked' : ''} ${x.m ? '' : 'disabled'}>
      <span><b>${x.name}</b><br>${x.m ? `trained ${trainedOn(x.m)} · ${x.m.labels.join(' / ')}` : x.error ? `<span class="bad">${x.error}</span>` : 'loading…'}
      ${x.m && x.error ? `<br><span class="bad">${x.error}</span>` : ''}</span></label>`).join('');
  $('models').querySelectorAll('input').forEach(cb => cb.onchange = () => { models[cb.dataset.i].on = cb.checked; });
  $('missModel').innerHTML = models.filter(x => x.m).map(x => `<option>${x.name}</option>`).join('');
}

function activeModels() { return models.filter(x => x.m && x.on); }

// ---------- tallies ----------
function tally(key, label, truthLabel, guess, extra) {
  if (!results.has(key)) {
    results.set(key, { label, n: 0, right: 0, confWrong: 0, unsure: 0,
      cm: Object.fromEntries(CLASSES.map(c => [c, Object.fromEntries(CLASSES.map(d => [d, 0]))])), misses: [] });
  }
  const r = results.get(key);
  const pred = HandsFree.normalizeLabel(guess.label);
  r.n++;
  if (guess.confidence < MIN_CONF) r.unsure++;
  else if (pred === truthLabel) r.right++;
  else { r.confWrong++; if (extra && extra.thumb && r.misses.length < 60) r.misses.push({ ...extra, pred, conf: guess.confidence }); }
  if (pred) r.cm[truthLabel][pred]++;
}

function renderResults() {
  const blocks = [];
  // summary table first: the numbers for the documentation
  const keys = [...results.keys()];
  if (!keys.length) { $('results').innerHTML = ''; $('csv').disabled = true; return; }
  blocks.push(`<table><tr><th>model · input</th><th>frames</th><th>right</th><th>unsure &lt;${pct(MIN_CONF)}</th><th>confident &amp; wrong</th>${CLASSES.map(c => `<th>${c} right</th>`).join('')}</tr>` +
    keys.map(k => {
      const r = results.get(k);
      const recall = CLASSES.map(c => {
        const row = r.cm[c], tot = Object.values(row).reduce((a, b) => a + b, 0);
        return tot ? `<td class="${row[c] / tot >= 0.9 ? 'good' : row[c] / tot >= 0.7 ? 'mid' : 'bad'}">${pct(row[c] / tot)} <span class="small">(${tot})</span></td>` : '<td>–</td>';
      }).join('');
      const acc = r.right / r.n;
      return `<tr><td>${r.label}</td><td>${r.n}</td><td class="${acc >= 0.9 ? 'good' : acc >= 0.7 ? 'mid' : 'bad'}">${pct(acc)}</td><td>${pct(r.unsure / r.n)}</td><td class="${r.confWrong ? 'bad' : 'good'}">${pct(r.confWrong / r.n)}</td>${recall}</tr>`;
    }).join('') + '</table>');
  blocks.push('<p class="small">"right" counts only guesses the sketch would act on (≥70%). "unsure" guesses are ignored by the timer, so they are safe; "confident &amp; wrong" are the ones that start, pause or dim by mistake. bodyPose only answers here vs away, so it has no phone column.</p>');
  // confusion matrices
  blocks.push('<div class="cms">' + keys.map(k => {
    const r = results.get(k);
    return `<div class="model-block"><h3>${r.label}</h3><table class="cm"><tr><th>really ↓ · guessed →</th>${CLASSES.map(c => `<th>${c}</th>`).join('')}</tr>` +
      CLASSES.map(t => `<tr><td>${t}</td>${CLASSES.map(p => `<td class="${t === p ? 'diag' : r.cm[t][p] ? 'bad' : ''}">${r.cm[t][p]}</td>`).join('')}</tr>`).join('') + '</table></div>';
  }).join('') + '</div>');
  $('results').innerHTML = blocks.join('');
  $('csv').disabled = !rows.length;
  renderMisses();
}

function renderMisses() {
  const name = $('missModel').value;
  const r = [...results.entries()].find(([k]) => k.startsWith('photo|' + name + '|'));
  $('misses').innerHTML = r && r[1].misses.length
    ? r[1].misses.map(m => `<figure><img src="${m.thumb}" alt=""><figcaption>${m.truth} → <span class="bad">${m.pred} ${pct(m.conf)}</span><br>${m.file}</figcaption></figure>`).join('')
    : '<p class="small">None yet.</p>';
}

// ---------- photos ----------
function truthFromPath(path) {
  const parts = path.split('/').slice(0, -1).reverse();   // nearest folder first
  for (const p of parts) { const l = HandsFree.normalizeLabel(p); if (l) return l; }
  return null;
}

async function runPhotos(fileList) {
  const files = [...fileList].filter(f => /\.(jpe?g|png|webp)$/i.test(f.name))
    .map(f => ({ f, truth: truthFromPath(f.webkitRelativePath || f.name) })).filter(x => x.truth);
  const ms = activeModels();
  if (!files.length) { status('No photos in working / phone / away folders there.'); return; }
  if (!ms.length) { status('Turn on at least one model.'); return; }
  const counts = Object.fromEntries(CLASSES.map(c => [c, files.filter(x => x.truth === c).length]));
  for (let i = 0; i < files.length; i++) {
    const { f, truth: t } = files[i];
    const bmp = await createImageBitmap(f);
    TMInput.drawPhoto(bmp, photo);
    bmp.close && bmp.close();
    seeMatched.drawImage(photo, 0, 0);
    let thumb = null;
    for (const x of ms) {
      const g = TMInput.predict(tf, x.m, photo);
      const wrong = g.confidence >= MIN_CONF && HandsFree.normalizeLabel(g.label) !== t;
      if (wrong && !thumb) thumb = photo.toDataURL('image/jpeg', 0.7);
      tally(`photo|${x.name}|tm`, `${x.name} · photos`, t, g, wrong ? { thumb, truth: t, file: f.name } : null);
      rows.push(['photo', f.webkitRelativePath || f.name, t, x.name, 'photo', HandsFree.normalizeLabel(g.label), g.confidence.toFixed(3)]);
    }
    if (i % 8 === 0 || i === files.length - 1) {
      status(`Photos: ${i + 1} / ${files.length} (working ${counts.working}, phone ${counts.phone}, away ${counts.away})`);
      renderResults();
      await new Promise(r => setTimeout(r, 0));
    }
  }
  status(`Done: ${files.length} photos × ${ms.length} models.`);
}

// ---------- live ----------
async function startCam() {
  const v = $('video');
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: false });
  v.srcObject = stream;
  await v.play();
  camOn = true;
  $('cam').disabled = true;
  // without p5 on the page, ml5.bodyPose() hands back a promise of the model
  if ($('pose').checked && !bodyPose) {
    Promise.resolve(ml5.bodyPose('MoveNet', { flipped: true }))
      .then((bp) => { bodyPose = bp; })
      .catch(() => { $('pose').checked = false; status("bodyPose couldn't load (it downloads its model), so it's left out."); });
  }
  // a worker clock, like the sketch, so it keeps sampling if you switch tabs
  const w = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 250);'], { type: 'text/javascript' })));
  w.onmessage = liveTick;
  status('Camera on. Hold 1, 2 or 3 while you act it out.');
}

function personScore(poses) {
  const names = ['nose', 'left_eye', 'right_eye', 'left_shoulder', 'right_shoulder'];
  let best = 0;
  for (const p of poses || []) {
    const ks = p.keypoints.filter(k => names.includes(k.name));
    best = Math.max(best, ks.reduce((a, k) => a + (k.confidence ?? k.score ?? 0), 0) / (ks.length || 1));
  }
  return best;
}

let lastTickEnd = -Infinity;
function liveTick() {
  const v = $('video');
  if (!camOn || !v.videoWidth || performance.now() - lastTickEnd < 200) return;   // don't let slow ticks pile up
  try { liveFrame(v); } finally { lastTickEnd = performance.now(); }
}

function liveFrame(v) {
  TMInput.drawMatched(v, matched);
  TMInput.drawMl5Default(v, raw);
  seeMatched.drawImage(matched, 0, 0);
  seeRaw.drawImage(raw, 0, 0);
  if (bodyPose && $('pose').checked && !poseBusy) {
    poseBusy = true;
    bodyPose.detect(v, (r) => { poseBusy = false; lastPose = { t: performance.now(), score: personScore(r) }; });
  }
  const t = truth;
  const lines = [];
  for (const x of activeModels()) {
    const gm = TMInput.predict(tf, x.m, matched);
    lines.push(`${x.name.padEnd(34)} ${gm.label} ${pct(gm.confidence)}`);
    if (t) {
      tally(`live|${x.name}|tm`, `${x.name} · live, Teachable Machine input`, t, gm);
      rows.push(['live', Math.round(performance.now()), t, x.name, 'tm', HandsFree.normalizeLabel(gm.label), gm.confidence.toFixed(3)]);
    }
    if ($('both').checked) {
      const gr = TMInput.predict(tf, x.m, raw);
      lines.push(`${''.padEnd(34)} old ml5 input: ${gr.label} ${pct(gr.confidence)}`);
      if (t) {
        tally(`live|${x.name}|raw`, `${x.name} · live, old ml5 input`, t, gr);
        rows.push(['live', Math.round(performance.now()), t, x.name, 'raw', HandsFree.normalizeLabel(gr.label), gr.confidence.toFixed(3)]);
      }
    }
  }
  if (lastPose && $('pose').checked) {
    const here = lastPose.score >= 0.3;
    lines.push(`${'bodyPose (pretrained)'.padEnd(34)} ${here ? 'person' : 'nobody'} ${pct(lastPose.score)}`);
    if (t && performance.now() - lastPose.t < 1000) {
      // bodyPose can only say here or away; score it on that question alone
      const g = { label: here ? (t === 'away' ? 'working' : t) : 'away', confidence: 1 };
      tally('live|bodyPose|pose', 'bodyPose (pretrained) · live, here vs away only', t, g);
      rows.push(['live', Math.round(performance.now()), t, 'bodyPose', 'pose', here ? 'here' : 'away', lastPose.score.toFixed(3)]);
    }
  }
  $('live-now').textContent = (t ? `recording: you are ${t}\n` : 'not recording (hold 1, 2 or 3)\n') + lines.join('\n');
  if (t && performance.now() - lastSample > 1000) { lastSample = performance.now(); renderResults(); }
}

function setTruth() {
  truth = heldKey || stickyTruth;
  document.querySelectorAll('[data-truth]').forEach(b => b.classList.toggle('on', b.dataset.truth === truth));
}

// ---------- wiring ----------
$('addModel').onclick = () => {
  const u = $('extraUrl').value.trim();
  if (u) addModel(u, u.includes('teachablemachine') ? `TM link …${u.replace(/\/$/, '').split('/').pop()}` : u);
  $('extraUrl').value = '';
};
$('folder').onchange = (e) => runPhotos(e.target.files);
$('cam').onclick = () => startCam().catch(e => status(`Camera: ${e.message}`));
$('csv').onclick = () => {
  const csv = [['source', 'photo_or_ms', 'truth', 'model', 'input', 'guess', 'confidence'], ...rows]
    .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `lock-in-model-compare-${new Date().toISOString().slice(0, 16).replace(':', '')}.csv`;
  a.click();
};
$('clear').onclick = () => { results.clear(); rows.length = 0; renderResults(); };
$('missModel').onchange = renderMisses;
document.querySelectorAll('[data-truth]').forEach(b => b.onclick = () => {
  stickyTruth = stickyTruth === b.dataset.truth ? null : b.dataset.truth; setTruth();
});
const KEYS = { '1': 'working', '2': 'phone', '3': 'away' };
addEventListener('keydown', (e) => { if (KEYS[e.key] && e.target.tagName !== 'INPUT') { heldKey = KEYS[e.key]; setTruth(); } });
addEventListener('keyup', (e) => { if (KEYS[e.key] === heldKey) { heldKey = null; setTruth(); } });

SHIPPED.forEach(s => addModel(s.url, s.name, true));
