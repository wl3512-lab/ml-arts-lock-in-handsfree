// node tests/models.test.cjs   (needs: npm install)
// Checks every desk model the sketch ships: it loads, its classes map to
// working / phone / away, and it gives one probability per class.
// Then prints what each model says about frames with nobody in them (blank,
// dark, bright), the case that once read as "phone 100%" in a new room.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
let tf;
try { tf = require('@tensorflow/tfjs'); } catch (e) {
  console.log('skip - models: run `npm install` first (needs @tensorflow/tfjs)');
  process.exit(0);
}
const { normalizeLabel } = require('../sketch/handsfree-logic.js');

const SKETCH = path.join(__dirname, '..', 'sketch');
const dirs = fs.readdirSync(SKETCH).filter(d => /^model/.test(d) && fs.existsSync(path.join(SKETCH, d, 'model.json'))).sort();

async function load(dir) {
  const j = JSON.parse(fs.readFileSync(path.join(dir, 'model.json'), 'utf8'));
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'metadata.json'), 'utf8'));
  const groups = j.weightsManifest;
  const bufs = groups.flatMap(g => g.paths.map(p => fs.readFileSync(path.join(dir, p))));
  const all = Buffer.concat(bufs);
  const model = await tf.loadLayersModel(tf.io.fromMemory({
    modelTopology: j.modelTopology,
    weightSpecs: groups.flatMap(g => g.weights),
    weightData: all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength),
  }));
  return { model, meta };
}

// pixels / 127 - 1, like Teachable Machine and the sketch
function frame(fill) {
  return tf.tidy(() => tf.fill([1, 224, 224, 3], fill).div(127).sub(1));
}
function noise(seed) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const data = new Float32Array(224 * 224 * 3).map(() => rnd() * 255);
  return tf.tidy(() => tf.tensor4d(data, [1, 224, 224, 3]).div(127).sub(1));
}

(async () => {
  await tf.setBackend('cpu');
  let passed = 0;
  const report = [];
  assert.ok(dirs.length > 0, 'no model folders in sketch/');
  for (const d of dirs) {
    const { model, meta } = await load(path.join(SKETCH, d));
    const mapped = meta.labels.map(normalizeLabel);
    assert.deepEqual([...mapped].sort(), ['away', 'phone', 'working'], `${d}: classes ${meta.labels}`);
    assert.deepEqual(model.inputs[0].shape.slice(1), [224, 224, 3], `${d}: input shape`);
    assert.equal(model.outputs[0].shape[1], meta.labels.length, `${d}: one output per class`);
    const probes = { 'gray (blank wall)': frame(128), 'dark room': frame(20), 'bright': frame(235), 'noise': noise(7) };
    const says = [];
    for (const [name, x] of Object.entries(probes)) {
      const p = model.predict(x).dataSync();
      const sum = p.reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(sum - 1) < 1e-3, `${d}: probabilities sum to ${sum}`);
      const best = p.indexOf(Math.max(...p));
      says.push(`${name}: ${meta.labels[best]} ${Math.round(p[best] * 100)}%`);
      x.dispose();
    }
    model.dispose();
    passed++;
    console.log(`ok - ${d} (trained ${meta.timeStamp}) loads, classes ${meta.labels.join('/')}`);
    report.push(`   ${d.padEnd(16)} ${says.join(' · ')}`);
  }
  console.log('\nnobody in frame (bodyPose is what catches these in the sketch):');
  console.log(report.join('\n'));
  console.log(`\n${passed} models passed`);
})().catch(e => { console.error(e); process.exit(1); });
