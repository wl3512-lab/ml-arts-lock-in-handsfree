// lock in, hands-free — code sketch for the ML Arts final proposal.
// A Teachable Machine image model (week 2, transfer learning) watches the desk;
// handsfree-logic.js turns its guesses into start / pause / dim.
// Based on the class example "Image Classification with Teachable Machine and ml5.js".

let video, classifier, bodyPose, hf;
// Presence check: a pretrained bodyPose (MoveNet) decides "is anyone here?",
// which works in any room. The desk model only decides working vs phone.
// Without it, an empty room the desk model never saw can read as "phone 100%".
let presenceCheck = true;
let tmGuess = null;            // last desk-model result
let person = { here: false, score: 0, seen: false };
const PERSON_MIN = 0.3;        // mean confidence of nose, eyes, shoulders
let mode = 'demo';            // 'demo' (keys) or 'model'
let guess = { label: 'away', confidence: 1, raw: 'away' };
let snap;

const COLORS = {
  waiting: [201, 184, 255], starting: [201, 184, 255], focus: [159, 211, 255],
  paused: [140, 146, 190], done: [255, 217, 138],
};
const PHONE_YELLOW = [255, 214, 90];
// The lock in menu bar app listens here (PhoneBridge.swift); nothing leaves the Mac.
const MENUBAR = 'http://127.0.0.1:8779/phone';
let phoneWas = false, lastBeat = 0;
let busyTM = false, busyPose = false, poseReady = false, lastUpdate = 0;

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
  select('#presence').changed(() => { presenceCheck = select('#presence').elt.checked; combine(); });
  bodyPose = ml5.bodyPose('MoveNet', { flipped: true }, () => { poseReady = true; });
  loadDeskModel();
  startTicker();
  // ask for notification permission on the first click (browsers need a click)
  document.addEventListener('click', () => {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  }, { once: true });
}

// Chrome stops drawing (and ml5's own loops) when this tab isn't on screen.
// A worker's timer keeps going, so the models and the timer keep running
// while you're in another tab or app: that's when "phone down?" matters most.
function startTicker() {
  const src = 'setInterval(() => postMessage(0), 200);';
  const worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
  worker.onmessage = tick;
}

function tick() {
  if (video && video.elt && video.elt.paused) video.elt.play().catch(() => {});
  if (mode === 'model' && classifier && !busyTM) {
    busyTM = true;
    classifier.classify(video, (r) => { busyTM = false; gotResult(r); });
  }
  if (presenceCheck && poseReady && !busyPose) {
    busyPose = true;
    bodyPose.detect(video, (r) => { busyPose = false; gotPoses(r); });
  }
  const t = now();
  if (t - lastUpdate >= 0.1 && guess.label) { lastUpdate = t; snap = hf.update(guess.label, guess.confidence, t); }
  phoneSignals(t);
}

// 20 s of phone in a row: tell the menu bar app (yellow pulsing ring + one
// notification); if the app isn't running, the browser notifies instead.
function phoneSignals(t) {
  const on = !!snap.phoneAlert;
  document.title = on ? '📵 phone down?' : (snap.state === 'focus' ? `${fmt(snap.remaining)} · locked in` : 'lock in, hands-free');
  if (on !== phoneWas || (on && t - lastBeat > 5)) {
    const first = on && !phoneWas;
    phoneWas = on; lastBeat = t;
    fetch(MENUBAR, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: on }) })
      .catch(() => { if (first) browserNotify(); });
  }
}

function browserNotify() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  new Notification('phone down?', { body: "Your phone's been up for 20 seconds. Your focus timer is still going.", tag: 'phone-down' });
}

function gotPoses(poses) {
  const names = ['nose', 'left_eye', 'right_eye', 'left_shoulder', 'right_shoulder'];
  let best = 0;
  for (const p of poses || []) {
    const ks = p.keypoints.filter(k => names.includes(k.name));
    const mean = ks.reduce((a, k) => a + (k.confidence ?? k.score ?? 0), 0) / (ks.length || 1);
    best = max(best, mean);
  }
  person = { here: best >= PERSON_MIN, score: best, seen: true };
  combine();
}

// Merge the two models into one guess for handsfree-logic.js.
function combine() {
  if (mode !== 'model' || !tmGuess) return;
  if (tmGuess.label === 'phone' && tmGuess.confidence >= hf.options.minConf) {
    // a phone held up can hide your face from bodyPose, but a phone means you're here
    guess = { ...tmGuess, by: 'desk model' };
  } else if (presenceCheck && person.seen && !person.here) {
    guess = { raw: tmGuess.raw, label: 'away', confidence: 1 - person.score, by: 'bodyPose' };
  } else if (presenceCheck && person.seen && tmGuess.label === 'away') {
    // someone is clearly in frame, so "away" is the desk model being unsure: call it working
    guess = { raw: tmGuess.raw, label: 'working', confidence: person.score, by: 'bodyPose' };
  } else {
    guess = { ...tmGuess, by: 'desk model' };
  }
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
  });
}

function gotResult(results) {
  if (!results || !results.length) return;
  const top = results[0];
  tmGuess = { raw: top.label, label: HandsFree.normalizeLabel(top.label), confidence: top.confidence };
  combine();
}

function keyPressed() {
  if (mode !== 'demo') return;
  const map = { '1': 'working', '2': 'phone', '3': 'away' };
  if (map[key]) guess = { label: map[key], raw: map[key], confidence: 1 };
}

function draw() {
  // the logic is fed by tick() (it keeps running in the background)
  drawSky();
  drawRing();
  drawCamera();
  select('#log').html(snap.events.map(e => `${fmt(e.t)}  ${e.msg}`).join('\n') +
    (snap.corrections ? `\n\nwrong pauses fixed: ${snap.corrections}` : ''));
}

function drawSky() {
  background(11, 14, 34);
  noStroke();
  const c = snap.phoneAlert ? PHONE_YELLOW : COLORS[snap.state];
  // the aura breathes every 6 s, like lock in; on "phone down?" it pulses fast
  const breath = snap.phoneAlert ? pulse() : 0.5 + 0.5 * sin((millis() / 6000) * TWO_PI);
  const glow = snap.phoneAlert ? 1.6 : 1;
  for (let r = 420; r > 0; r -= 20) {
    fill(c[0], c[1], c[2], (4 + breath * 4) * glow);
    circle(width / 2 + 120, height / 2, r * 1.6);
  }
}

function drawRing() {
  const cx = width / 2 + 120, cy = height / 2, d = min(320, height * 0.5);
  const c = snap.phoneAlert ? PHONE_YELLOW : COLORS[snap.state];
  const a = snap.phoneAlert ? 120 + 135 * pulse() : 255;
  noFill();
  strokeWeight(snap.phoneAlert ? 14 + 6 * pulse() : 14);
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
  text(`sees: ${lbl}  ${(guess.confidence * 100).toFixed(0)}%${guess.by ? '  (' + guess.by + ')' : ''}`, x, y + h + 8);
  if (mode === 'model') {
    fill(238, 241, 255, 150);
    text(`desk model: ${tmGuess ? tmGuess.raw + ' ' + (tmGuess.confidence * 100).toFixed(0) + '%' : '…'}`, x, y + h + 40);
    text(`bodyPose: ${person.seen ? (person.here ? 'person' : 'nobody') + ' ' + (person.score * 100).toFixed(0) + '%' : 'loading…'}`, x, y + h + 56);
  }
  fill(255, 255, 255, 30);
  rect(x, y + h + 28, w, 5, 3);
  fill(guess.confidence >= hf.options.minConf ? color(166, 240, 207) : color(255, 160, 160));
  rect(x, y + h + 28, w * guess.confidence, 5, 3);
}

function pulse() { return 0.5 + 0.5 * sin((millis() / 1100) * TWO_PI); }
function status(msg) { select('#status').html(msg); }
function now() { return millis() / 1000; }
function fmt(sec) { sec = max(0, round(sec)); return `${floor(sec / 60)}:${nf(sec % 60, 2)}`; }
function readSaved() { try { return localStorage.getItem('handsfree-model'); } catch (e) { return null; } }
function windowResized() { resizeCanvas(windowWidth, windowHeight); }
