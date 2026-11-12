// lock in, hands-free: turns a stream of webcam guesses into timer actions.
// Pure logic (no p5, no ml5) so it can be tested in node.
//
// Labels: "working" | "phone" | "away". Anything below minConf is ignored,
// so one shaky frame never starts, pauses or dims anything.
(function (root) {
  const DEFAULTS = {
    minConf: 0.7,      // ignore guesses below this confidence
    startHold: 5,      // seconds of "working" before the start countdown
    startCountdown: 5, // cancelable "starting…" before focus begins
    awayHold: 10,      // seconds of "away" before pausing
    backHold: 2,       // seconds of "working" before resuming / un-dimming
    phoneHold: 20,     // seconds of "phone" before the ring dims
    cancelQuiet: 60,   // after you cancel a start, don't auto-start for this long
    focusLength: 25 * 60,
  };

  function createHandsFree(options) {
    const o = Object.assign({}, DEFAULTS, options || {});
    const s = {
      state: 'waiting', // waiting | starting | focus | paused | done
      dimmed: false,
      elapsed: 0,       // true focus seconds
      runLabel: null,   // label currently held
      runSince: 0,      // when that label started being held
      lastT: null,
      startAt: 0,
      pausedAt: 0,
      quietUntil: 0,
      corrections: 0,   // wrong pauses you undid (future training photos)
      events: [],
    };

    function log(t, msg) { s.events.push({ t, msg }); }
    function held(label, secs, t) { return s.runLabel === label && t - s.runSince >= secs; }

    function update(label, conf, t) {
      // focus time only grows while in focus
      if (s.lastT !== null && s.state === 'focus') s.elapsed += t - s.lastT;
      s.lastT = t;

      if (conf >= o.minConf && label !== s.runLabel) { s.runLabel = label; s.runSince = t; }

      switch (s.state) {
        case 'waiting':
          if (t >= s.quietUntil && held('working', o.startHold, t)) {
            s.state = 'starting'; s.startAt = t + o.startCountdown; log(t, 'starting…');
          }
          break;
        case 'starting':
          if (s.runLabel === 'away') { s.state = 'waiting'; log(t, 'left before start'); }
          else if (t >= s.startAt) { s.state = 'focus'; log(t, 'focus started'); }
          break;
        case 'focus':
          if (held('away', o.awayHold, t)) {
            // take back the seconds you were already gone
            s.elapsed = Math.max(0, s.elapsed - o.awayHold);
            s.state = 'paused'; s.pausedAt = t; s.dimmed = false; log(t, 'paused (away)');
          } else if (!s.dimmed && held('phone', o.phoneHold, t)) {
            s.dimmed = true; log(t, 'dimmed (phone)');
          } else if (s.dimmed && held('working', o.backHold, t)) {
            s.dimmed = false; log(t, 'back');
          }
          if (s.elapsed >= o.focusLength) { s.elapsed = o.focusLength; s.state = 'done'; log(t, 'focus done'); }
          break;
        case 'paused':
          if (held('working', o.backHold, t)) { s.state = 'focus'; log(t, 'resumed'); }
          break;
      }
      return snapshot();
    }

    // You tapped "cancel" during the countdown.
    function cancelStart(t) {
      if (s.state !== 'starting') return snapshot();
      s.state = 'waiting'; s.quietUntil = t + o.cancelQuiet; log(t, 'start canceled');
      return snapshot();
    }

    // It paused but you were there: resume and give every second back.
    function undoPause(t) {
      if (s.state !== 'paused') return snapshot();
      s.elapsed = Math.min(o.focusLength, s.elapsed + o.awayHold + (t - s.pausedAt));
      s.state = 'focus'; s.lastT = t; s.corrections += 1; log(t, 'wrong pause, time given back');
      return snapshot();
    }

    function snapshot() {
      return {
        state: s.state, dimmed: s.dimmed, elapsed: s.elapsed,
        remaining: Math.max(0, o.focusLength - s.elapsed),
        countdown: s.state === 'starting' ? Math.max(0, s.startAt - (s.lastT || 0)) : 0,
        label: s.runLabel, corrections: s.corrections, events: s.events.slice(-6),
      };
    }

    return { update, cancelStart, undoPause, snapshot, options: o };
  }

  // Map whatever you named your Teachable Machine classes to the 3 states.
  function normalizeLabel(name) {
    const n = String(name || '').toLowerCase();
    if (n.includes('phone')) return 'phone';
    if (n.includes('away') || n.includes('empty') || n.includes('nobody') || n.includes('gone')) return 'away';
    if (n.includes('work') || n.includes('study') || n.includes('desk') || n.includes('focus')) return 'working';
    return null;
  }

  const api = { createHandsFree, normalizeLabel, DEFAULTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HandsFree = api;
})(this);
