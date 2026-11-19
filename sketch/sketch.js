// lock in, hands-free — code sketch for the ML Arts final proposal.
// A Teachable Machine image model (week 2, transfer learning) watches the desk;
// handsfree-logic.js turns its guesses into start / pause / dim.
// Based on the class example "Image Classification with Teachable Machine and ml5.js".

let video, classifier, hf;
let mode = 'demo';            // 'demo' (keys) or 'model'
let guess = { label: 'away', confidence: 1, raw: 'away' };
let snap;

const COLORS = {
  waiting: [201, 184, 255], starting: [201, 184, 255], focus: [159, 211, 255],
  paused: [140, 146, 190], done: [255, 217, 138],
};

function setup() {
  createCanvas(windowWidth, windowHeight).parent(document.querySelector('main'));
  video = createCapture(VIDEO, { flipped: true });
  video.size(320, 240);
  video.hide();
  reset();

  // Lucy's desk model ships in sketch/model/, so the page starts watching with no paste.
  select('#modelUrl').value(readSaved() || 'model/');
  select('#load').mousePressed(loadDeskModel);
  select('#demo').mousePressed(() => { mode = 'demo'; status('Demo mode: keys 1 working, 2 phone, 3 away.'); });
  select('#len').changed(reset);
  select('#cancel').mousePressed(() => { snap = hf.cancelStart(now()); });
  select('#undo').mousePressed(() => { snap = hf.undoPause(now()); });
  loadDeskModel();
}

function reset() {
  hf = HandsFree.createHandsFree({ focusLength: Number(select('#len').value()) });
  snap = hf.snapshot();
}

function loadDeskModel() {
  let url = select('#modelUrl').value().trim();
  if (!url) { status('Paste your Teachable Machine model link first.'); return; }
  if (url.endsWith('model.json')) url = url.slice(0, -'model.json'.length);
  if (!url.endsWith('/')) url += '/';
  url = new URL(url, location.href).href;
  status('Loading model…');
  try { localStorage.setItem('handsfree-model', url); } catch (e) { /* private window */ }
  classifier = ml5.imageClassifier(url + 'model.json', { flipped: true }, () => {
    mode = 'model';
    status('Model loaded. It is watching your desk.');
    classifier.classifyStart(video, gotResult);
  });
}

function gotResult(results) {
  if (!results || !results.length) return;
  const top = results[0];
  guess = { raw: top.label, label: HandsFree.normalizeLabel(top.label), confidence: top.confidence };
}

function keyPressed() {
  if (mode !== 'demo') return;
  const map = { '1': 'working', '2': 'phone', '3': 'away' };
  if (map[key]) guess = { label: map[key], raw: map[key], confidence: 1 };
}

function draw() {
  // feed the logic ~10 times a second
  if (frameCount % 6 === 0 && guess.label) snap = hf.update(guess.label, guess.confidence, now());

  drawSky();
  drawRing();
  drawCamera();
  select('#log').html(snap.events.map(e => `${fmt(e.t)}  ${e.msg}`).join('\n') +
    (snap.corrections ? `\n\nwrong pauses fixed: ${snap.corrections}` : ''));
}

function drawSky() {
  background(11, 14, 34);
  noStroke();
  const c = COLORS[snap.state];
  // the aura breathes every 6 s, like lock in
  const breath = 0.5 + 0.5 * sin((millis() / 6000) * TWO_PI);
  const glow = snap.dimmed ? 0.25 : 1;
  for (let r = 420; r > 0; r -= 20) {
    fill(c[0], c[1], c[2], (4 + breath * 4) * glow);
    circle(width / 2 + 120, height / 2, r * 1.6);
  }
}

function drawRing() {
  const cx = width / 2 + 120, cy = height / 2, d = min(320, height * 0.5);
  const c = COLORS[snap.state];
  const a = snap.dimmed ? 90 : 255;
  noFill();
  strokeWeight(14);
  stroke(255, 255, 255, 25);
  circle(cx, cy, d);
  const total = hf.options.focusLength;
  const p = snap.elapsed / total;
  stroke(c[0], c[1], c[2], a);
  strokeCap(ROUND);
  if (p > 0) arc(cx, cy, d, d, -HALF_PI, -HALF_PI + p * TWO_PI);

  noStroke();
  fill(238, 241, 255, a);
  textAlign(CENTER, CENTER);
  textFont('Silkscreen');
  textSize(d * 0.2);
  text(fmt(snap.remaining), cx, cy - 6);
  textSize(14);
  fill(c[0], c[1], c[2], a);
  const words = {
    waiting: 'sit down to start',
    starting: `starting in ${ceil(snap.countdown)}…`,
    focus: snap.dimmed ? 'phone down?' : 'locked in',
    paused: 'paused · you stepped away',
    done: 'done ✦',
  };
  text(words[snap.state], cx, cy + d * 0.18);
}

function drawCamera() {
  const w = 200, h = 150, x = width - w - 20, y = 20;
  if (mode === 'model') image(video, x, y, w, h);
  else { fill(255, 255, 255, 15); noStroke(); rect(x, y, w, h, 10); }
  fill(238, 241, 255);
  textFont('system-ui');
  textAlign(LEFT, TOP);
  textSize(12);
  const lbl = guess.label || `? (${guess.raw})`;
  text(`sees: ${lbl}  ${(guess.confidence * 100).toFixed(0)}%`, x, y + h + 8);
  fill(255, 255, 255, 30);
  rect(x, y + h + 28, w, 5, 3);
  fill(guess.confidence >= hf.options.minConf ? color(166, 240, 207) : color(255, 160, 160));
  rect(x, y + h + 28, w * guess.confidence, 5, 3);
}

function status(msg) { select('#status').html(msg); }
function now() { return millis() / 1000; }
function fmt(sec) { sec = max(0, round(sec)); return `${floor(sec / 60)}:${nf(sec % 60, 2)}`; }
function readSaved() { try { return localStorage.getItem('handsfree-model'); } catch (e) { return null; } }
function windowResized() { resizeCanvas(windowWidth, windowHeight); }
