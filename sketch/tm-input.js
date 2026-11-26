// lock in, hands-free: how a webcam frame becomes desk-model input.
//
// Teachable Machine learns from what its webcam records: a mirrored square
// cut from the middle of the frame, 224×224. ml5 1.4.0's imageClassifier does
// something else with a Teachable Machine model: it ignores `flipped` and
// stretches the whole 4:3 frame into 224×224, so the model sees a squashed,
// un-mirrored picture it never trained on. It also waits for an animation
// frame before every guess, which Chrome never gives a hidden tab.
//
// So the sketch runs the model itself: draw the same square TM saw, then
// predict with ml5's own TensorFlow.js (ml5.tf). No animation frame needed.
(function (root) {
  const SIZE = 224;

  function makeCanvas() {
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    return c;
  }

  // What Teachable Machine trained on: mirrored, center square.
  function drawMatched(video, canvas) {
    const vw = video.videoWidth || video.width, vh = video.videoHeight || video.height;
    const side = Math.min(vw, vh);
    const g = canvas.getContext('2d', { willReadFrequently: true });
    g.save();
    g.translate(SIZE, 0); g.scale(-1, 1);
    g.drawImage(video, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, SIZE, SIZE);
    g.restore();
    return canvas;
  }

  // What ml5.imageClassifier(tmUrl).classify(video) feeds the model:
  // the whole frame, not mirrored, stretched to a square. Kept for comparison.
  function drawMl5Default(video, canvas) {
    const vw = video.videoWidth || video.width, vh = video.videoHeight || video.height;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    g.drawImage(video, 0, 0, vw, vh, 0, 0, SIZE, SIZE);
    return canvas;
  }

  // A photo saved by ?collect or downloaded from Teachable Machine is already
  // a mirrored square, so it only needs the center crop + resize.
  function drawPhoto(img, canvas) {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const side = Math.min(w, h);
    const g = canvas.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, SIZE, SIZE);
    return canvas;
  }

  // url: folder holding model.json + metadata.json (a TM share link works too)
  async function loadModel(tf, url) {
    if (url.endsWith('model.json')) url = url.slice(0, -'model.json'.length);
    if (!url.endsWith('/')) url += '/';
    await tf.ready();
    const [model, meta] = await Promise.all([
      tf.loadLayersModel(url + 'model.json'),
      fetch(url + 'metadata.json').then(r => r.json()),
    ]);
    // first guess compiles the shaders; do it now, not on the first real frame
    tf.tidy(() => model.predict(tf.zeros([1, SIZE, SIZE, 3])));
    return { model, labels: meta.labels, meta, url };
  }

  // Same scaling as Teachable Machine and ml5: pixels / 127 - 1.
  // dataSync() reads the answer right away (no animation frame, no timer).
  function predict(tf, m, canvas) {
    const probs = tf.tidy(() =>
      m.model.predict(tf.browser.fromPixels(canvas).toFloat().div(127).sub(1).expandDims(0)).dataSync());
    let best = 0;
    for (let i = 1; i < probs.length; i++) if (probs[i] > probs[best]) best = i;
    return { label: m.labels[best], confidence: probs[best], probs: Array.from(probs), labels: m.labels };
  }

  root.TMInput = { SIZE, makeCanvas, drawMatched, drawMl5Default, drawPhoto, loadModel, predict };
})(this);
