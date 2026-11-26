# lock in, hands-free

ML for the Arts final (Lucy Liu, Fall 2026). A study timer that starts when you sit down, pauses when you walk away, and dims when you pick up your phone, using a Teachable Machine image model trained on your own desk.

- `index.html`: proposal post
- `slides/`: proposal slides (arrow keys)
- `sketch/`: p5.js 1.11.10 + ml5 1.4.0 code sketch; `handsfree-logic.js` holds the rules, `tm-input.js` turns a webcam frame into desk-model input
  - URL flags: `?watch=1` (opened by the lock in app), `?trace=1` (test log), `?collect=working|phone|away` (training photos), `?raw=1` (old ml5 input, for comparison)
- `sketch/compare/`: model compare page. Runs every desk model on your training photos or live (hold 1/2/3 for the right answer) and counts mistakes
- `tests/`: `node tests/handsfree-logic.test.cjs` (no install). `npm install && npm test` also checks every model folder; `npm run test:browser` runs the sketch and compare page in Chromium with a fake camera
- `TRAINING.md`: how to train the desk model
