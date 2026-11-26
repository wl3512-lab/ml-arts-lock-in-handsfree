# Finishing the final (from the class's final/README and wiki)

| When | What | Status |
|---|---|---|
| 11/13 | Proposal post + slides | done |
| now → 12/3 | Add model 4, test it against model 3 (compare page), friends use it | in progress |
| **Fri 12/4** | Play testing, round robin, 5–7 min each, no explaining until they've tried it | |
| **Fri 12/11** | Final presentation: ~10 min live demo, slides optional | |
| **Tue 12/15** | Documentation post due, linked on the Final-Presentations wiki page | draft: `final/index.html` |

## 1 · Model 4

1. Put the model files in `sketch/model/` (`model.json`, `metadata.json`, `weights.bin`); move model 3 to `sketch/model-v3/`.
2. `npm install && npm test`: checks it loads and its classes map to working / phone / away.
3. Open `sketch/compare/` at your desk:
   - **Photos:** Choose folder → `Pictures/lock in training` (the `?collect=` photos). Every model is scored on the same photos.
   - **Live:** Start camera, hold <kbd>1</kbd> working, <kbd>2</kbd> phone, <kbd>3</kbd> away while you act it out, about 30 s each. Do it once in the black sweater and once in a light top.
   - Download CSV. The numbers go in the Process section.
4. Keep whichever model has fewer **confident & wrong**, especially phone read as working. That one stays in `sketch/model/`.

## 2 · Before play testing (12/4)

- Study for real with `?trace=1` on for a few sessions; note every wrong pause / wrong "phone down?".
- Three friends try it at their own desks; count every "I was here" and cancel tap.
- Bring: laptop with the lock in app, the sketch open, a phone to pick up.

## 3 · At play testing, write down per person

- Did it start without them pressing anything?
- Corrections ("I was here", cancel): how many?
- Wrong pauses / wrong "phone down?": what were they doing?
- Did the camera feel like help or like being watched?

## 4 · Documentation (due 12/15)

`final/index.html` already has every required section (title, sketch link, one sentence, 250–500 word summary, inspiration, process, audience/context, user testing, source code, code references, next steps). Fill the boxes marked **To fill**, then add this line next to your name on https://github.com/ml5js/Intro-ML-Arts-IMA-F26/wiki/Final-Presentations (CLI pushes to the wiki get 403, so paste it by hand):

```markdown
Lucy Liu, [lock in, hands-free](https://wl3512-lab.github.io/ml-arts-lock-in-handsfree/final/)
```
