# Training the desk model (about 15 minutes)

1. Open https://teachablemachine.withgoogle.com/train/image at the desk where you study, laptop in its usual spot, usual lighting.
2. Make 3 classes, named exactly: `working`, `phone`, `away`.
3. Record each one with "Webcam → Hold to record", about 150–250 images per class:
   - **working**: typing, reading, writing on paper, leaning in, leaning back, chin on hand, headphones on and off.
   - **phone**: phone in hand at chest, in lap, held up near the face, scrolling with both hands.
   - **away**: empty chair, chair pushed in, chair turned, you standing behind it, someone walking past.
   Move around while recording; a model trained on one pose breaks the moment you shift.
4. Train (defaults are fine). Check the preview: each class should hit 80%+ when you act it out.
5. Export Model → Tensorflow.js → Upload (shareable link) → copy the link.
6. Open the sketch (https://wl3512-lab.github.io/ml-arts-lock-in-handsfree/sketch/), paste the link, Load model. It remembers the link.
7. Try it: sit and work (focus starts after a 5 s countdown you can cancel), walk away for ~10 s (pauses), pick up your phone for ~20 s (ring dims).

Write down anything it gets wrong (light change, hoodie, night) — that is the "where it fails" part of the documentation.

Optional second session: record again at night or in a different spot and retrain with both sets, then compare.
