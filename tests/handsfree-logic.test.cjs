// node tests/handsfree-logic.test.cjs
const assert = require('assert');
const { createHandsFree, normalizeLabel } = require('../sketch/handsfree-logic.js');

function run(hf, label, from, to, conf = 0.9) {
  let snap;
  for (let t = from; t <= to; t += 0.5) snap = hf.update(label, conf, t);
  return snap;
}
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok -', name); }

test('sitting down starts focus after hold + countdown', () => {
  const hf = createHandsFree();
  let s = run(hf, 'working', 0, 4.5);
  assert.equal(s.state, 'waiting');
  s = run(hf, 'working', 5, 5);
  assert.equal(s.state, 'starting');
  s = run(hf, 'working', 5.5, 10);
  assert.equal(s.state, 'focus');
});

test('low-confidence frames are ignored', () => {
  const hf = createHandsFree();
  run(hf, 'working', 0, 11);
  const s = run(hf, 'away', 11.5, 40, 0.4);
  assert.equal(s.state, 'focus');
});

test('walking away pauses and takes back the away seconds', () => {
  const hf = createHandsFree();
  run(hf, 'working', 0, 70);                 // focus from t=10, ~60 s
  let s = run(hf, 'away', 70.5, 80.5);       // 10 s away
  assert.equal(s.state, 'paused');
  assert.ok(Math.abs(s.elapsed - 60.5) < 0.6, `elapsed ${s.elapsed}`);
  s = run(hf, 'away', 81, 200);
  assert.ok(Math.abs(s.elapsed - 60.5) < 0.6, 'no time counted while paused');
  s = run(hf, 'working', 200.5, 203);
  assert.equal(s.state, 'focus');
});

test('a quick stretch does not pause', () => {
  const hf = createHandsFree();
  run(hf, 'working', 0, 30);
  const s = run(hf, 'away', 30.5, 36);
  assert.equal(s.state, 'focus');
});

test('phone dims after 20 s, working un-dims', () => {
  const hf = createHandsFree();
  run(hf, 'working', 0, 30);
  let s = run(hf, 'phone', 30.5, 45);
  assert.equal(s.dimmed, false);
  s = run(hf, 'phone', 45.5, 51);
  assert.equal(s.dimmed, true);
  assert.equal(s.state, 'focus', 'phone never pauses');
  s = run(hf, 'working', 51.5, 54);
  assert.equal(s.dimmed, false);
});

test('a glance up mid-phone does not reset the 20 s', () => {
  const hf = createHandsFree();
  run(hf, 'working', 0, 30);
  run(hf, 'phone', 30.5, 40);
  run(hf, 'working', 40.5, 41.5);            // 1 s glance at the screen
  const s = run(hf, 'phone', 42, 51);
  assert.equal(s.phoneAlert, true);
});

test('putting the phone down for longer starts the count over', () => {
  const hf = createHandsFree();
  run(hf, 'working', 0, 30);
  run(hf, 'phone', 30.5, 40);
  run(hf, 'working', 40.5, 45);              // 4.5 s back at work
  const s = run(hf, 'phone', 45.5, 60);      // only 14.5 s of phone since
  assert.equal(s.phoneAlert, false);
});

test('undoing a wrong pause gives every second back', () => {
  const hf = createHandsFree();
  run(hf, 'working', 0, 70);
  run(hf, 'away', 70.5, 80.5);
  run(hf, 'away', 81, 90);
  const s = hf.undoPause(90);
  assert.equal(s.state, 'focus');
  assert.equal(s.corrections, 1);
  assert.ok(Math.abs(s.elapsed - 80) < 0.6, `elapsed ${s.elapsed}`);
});

test('canceling the countdown keeps it quiet for a minute', () => {
  const hf = createHandsFree();
  run(hf, 'working', 0, 6);
  let s = hf.cancelStart(6);
  assert.equal(s.state, 'waiting');
  s = run(hf, 'working', 6.5, 60);
  assert.equal(s.state, 'waiting');
  s = run(hf, 'working', 60.5, 67);
  assert.equal(s.state, 'starting');
});

test('focus ends at focus length', () => {
  const hf = createHandsFree({ focusLength: 60 });
  const s = run(hf, 'working', 0, 80);
  assert.equal(s.state, 'done');
  assert.equal(s.remaining, 0);
});

test('label names map to states', () => {
  assert.equal(normalizeLabel('On Phone'), 'phone');
  assert.equal(normalizeLabel('Away'), 'away');
  assert.equal(normalizeLabel('Working'), 'working');
  assert.equal(normalizeLabel('Class 4'), null);
});

console.log(`\n${passed} passed`);
