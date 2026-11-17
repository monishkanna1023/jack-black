/* Settings and progress, persisted in localStorage. */
(function (global) {
  'use strict';
  const BJ = global.BJ || (global.BJ = {});

  function read(key, fallback) {
    try {
      const raw = global.localStorage && global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, val) {
    try {
      global.localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      /* storage unavailable (private mode etc.) — keep going in memory */
    }
  }

  // ---------------------------------------------------------------------------
  const DEFAULTS = {
    // Table rules (affect which answer is correct)
    das: true,
    surrender: true,
    doubleRule: 'any',
    // Play-table only
    h17: true,
    bjPayout: 1.5,
    // Display
    showTotals: true,
    // Drill
    drillPairs: true,
    drillSoft: true,
    drillHard: true,
    drillAdaptive: true,
    drill3Card: false,
    drillAutoNext: true,
    // Play
    playMode: 'coach',
    // Quiz
    quizTable: 'hard',
    quizOrder: 'rows',
  };

  const KEY_SETTINGS = 'bjTrainer.settings.v1';
  const listeners = [];
  const Settings = {
    DEFAULTS,
    data: Object.assign({}, DEFAULTS, read(KEY_SETTINGS, {})),
    get(k) {
      return this.data[k];
    },
    set(k, v) {
      if (this.data[k] === v) return;
      this.data[k] = v;
      write(KEY_SETTINGS, this.data);
      for (const fn of listeners) fn(k, v);
    },
    onChange(fn) {
      listeners.push(fn);
    },
    /** Convert a form value to the type of the default (booleans/numbers come back as strings). */
    coerce(k, raw) {
      const d = DEFAULTS[k];
      if (typeof d === 'boolean') return raw === true || raw === 'true';
      if (typeof d === 'number') return Number(raw);
      return raw;
    },
  };

  // ---------------------------------------------------------------------------
  const KEY_STATS = 'bjTrainer.stats.v1';
  const RECENT = 10;
  const ones = (s) => (s.match(/1/g) || []).length;
  const blank = () => ({ cells: {}, insurance: { n: 0, c: 0 }, totals: { n: 0, c: 0 }, quizBest: {} });

  const Stats = {
    RECENT,
    data: Object.assign(blank(), read(KEY_STATS, {})),
    save() {
      write(KEY_STATS, this.data);
    },
    /** Log one decision for a chart cell ("soft:18:6"). `correct` is a boolean. */
    record(id, correct) {
      const t = this.data.totals;
      t.n++;
      if (correct) t.c++;
      if (id) {
        const s = this.data.cells[id] || (this.data.cells[id] = { n: 0, c: 0, r: '' });
        s.n++;
        if (correct) s.c++;
        s.r = (s.r + (correct ? '1' : '0')).slice(-RECENT);
      }
      this.save();
    },
    recordInsurance(correct) {
      this.data.insurance.n++;
      if (correct) this.data.insurance.c++;
      this.record(null, correct);
    },
    cell(id) {
      return this.data.cells[id] || null;
    },
    /** Accuracy over the last RECENT tries, or null if never seen. */
    recent(id) {
      const s = this.cell(id);
      return s && s.r.length ? ones(s.r) / s.r.length : null;
    },
    /** Mastered = the last 3 tries in a row were right. */
    isMastered(id) {
      const s = this.cell(id);
      return !!s && s.r.length >= 3 && s.r.slice(-3) === '111';
    },
    /** Drill weighting: unseen and recently-missed cells come up more often. */
    weight(id) {
      const s = this.cell(id);
      if (!s || !s.n) return 3;
      const last5 = s.r.slice(-5);
      const misses = last5.length - ones(last5);
      return 1 + misses * 4 + (this.isMastered(id) ? 0 : 1);
    },
    quizBest(table) {
      return this.data.quizBest[table] != null ? this.data.quizBest[table] : null;
    },
    setQuizBest(table, pct) {
      const prev = this.quizBest(table);
      if (prev == null || pct > prev) {
        this.data.quizBest[table] = pct;
        this.save();
        return true;
      }
      return false;
    },
    reset() {
      this.data = blank();
      this.save();
    },
  };

  BJ.Store = { read, write };
  BJ.Settings = Settings;
  BJ.Stats = Stats;
})(typeof window !== 'undefined' ? window : globalThis);
