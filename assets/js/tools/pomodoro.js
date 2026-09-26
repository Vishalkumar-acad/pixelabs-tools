/* Pomodoro Focus Timer — fully local */
"use strict";

(function () {

  var els = {
    phase: document.getElementById("phase"),
    clock: document.getElementById("clock"),
    sessions: document.getElementById("sessions"),
    start: document.getElementById("start-btn"),
    reset: document.getElementById("reset-btn"),
    skip: document.getElementById("skip-btn"),
    work: document.getElementById("work"),
    brk: document.getElementById("break"),
    lbrk: document.getElementById("lbreak"),
    sound: document.getElementById("sound")
  };

  var state = {
    mode: "work",       /* work | break | long */
    remaining: 25 * 60,
    running: false,
    completed: 0,
    timer: null
  };

  function minutesFor(mode) {
    if (mode === "work") return Math.max(1, Math.min(90, parseInt(els.work.value, 10) || 25));
    if (mode === "break") return Math.max(1, Math.min(30, parseInt(els.brk.value, 10) || 5));
    return Math.max(5, Math.min(60, parseInt(els.lbrk.value, 10) || 15));
  }

  function labelFor(mode) {
    return mode === "work" ? "Focus" : mode === "break" ? "Short break" : "Long break";
  }

  function beep() {
    if (els.sound.value === "off") return;
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.35, 0.7].forEach(function (delay) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.frequency.value = 830;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.001, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + delay + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.32);
      });
    } catch (e) { /* audio blocked until user interacts — fine */ }
  }

  function render() {
    var m = Math.floor(state.remaining / 60);
    var s = state.remaining % 60;
    var txt = (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
    els.clock.textContent = txt;
    els.phase.textContent = labelFor(state.mode);
    els.phase.style.color = state.mode === "work" ? "var(--accent)" : "var(--success)";
    document.title = (state.running ? txt + " · " : "") + "Pomodoro — PixelAbs Tools";
    els.sessions.textContent = state.completed + " focus session" + (state.completed === 1 ? "" : "s") + " completed";
    els.start.textContent = state.running ? "Pause" : "Start";
  }

  function nextPhase() {
    beep();
    if (state.mode === "work") {
      state.completed++;
      state.mode = (state.completed % 4 === 0) ? "long" : "break";
    } else {
      state.mode = "work";
    }
    state.remaining = minutesFor(state.mode) * 60;
    render();
  }

  function tick() {
    state.remaining--;
    if (state.remaining <= 0) {
      nextPhase();
      return;
    }
    render();
  }

  els.start.addEventListener("click", function () {
    if (state.running) {
      clearInterval(state.timer);
      state.running = false;
    } else {
      state.timer = setInterval(tick, 1000);
      state.running = true;
      if (state.remaining === minutesFor(state.mode) * 60) beep(); /* unlock audio */
    }
    render();
  });

  els.reset.addEventListener("click", function () {
    clearInterval(state.timer);
    state.running = false;
    state.mode = "work";
    state.remaining = minutesFor("work") * 60;
    render();
  });

  els.skip.addEventListener("click", function () {
    clearInterval(state.timer);
    state.running = false;
    nextPhase();
  });

  [els.work, els.brk, els.lbrk].forEach(function (el) {
    el.addEventListener("change", function () {
      if (!state.running) {
        state.mode = "work";
        state.remaining = minutesFor("work") * 60;
        render();
      }
    });
  });

  /* start fresh */
  state.remaining = 25 * 60;
  render();

})();
