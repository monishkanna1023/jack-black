/* App shell: tabs, rules panel, keyboard routing. */
(function (global) {
  'use strict';
  const BJ = global.BJ;
  const TABS = ['chart', 'drill', 'quiz', 'play', 'progress'];
  const LAST_TAB = 'bjTrainer.lastTab';
  let current = null;

  function showTab(name) {
    if (!TABS.includes(name)) name = 'chart';
    if (name === current) return;
    const prev = current && BJ.Tabs[current];
    if (prev && prev.onHide) prev.onHide();
    current = name;
    for (const t of TABS) {
      document.getElementById('tab-' + t).hidden = t !== name;
      const btn = document.querySelector(`.tabs [data-tab="${t}"]`);
      btn.classList.toggle('on', t === name);
      btn.setAttribute('aria-selected', String(t === name));
    }
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
    document.body.dataset.tab = name;
    BJ.Store.write(LAST_TAB, name);
    window.scrollTo(0, 0);
    const tab = BJ.Tabs[name];
    if (tab && tab.onShow) tab.onShow();
  }

  function initRulesPanel() {
    const btn = document.getElementById('rulesBtn');
    const panel = document.getElementById('rulesPanel');
    btn.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      btn.setAttribute('aria-expanded', String(!panel.hidden));
    });
    document.querySelectorAll('[data-open-rules]').forEach((b) =>
      b.addEventListener('click', () => {
        panel.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      })
    );
    BJ.UI.bindSettings(panel);
  }

  function initKeys() {
    document.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target.closest('input, select, textarea, summary')) return;
      if (e.key === 'Escape') document.getElementById('rulesPanel').hidden = true;
      const tab = BJ.Tabs[current];
      if (tab && tab.onKey && tab.onKey(e)) {
        e.preventDefault();
        // Stop Space/Enter from also "clicking" whichever button still has focus.
        if (e.target instanceof HTMLButtonElement) e.target.blur();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Installable app (PWA)
  // ---------------------------------------------------------------------------
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  function initPwa() {
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
    }

    // Chrome / Edge / Android: show our own Install button.
    const btn = document.getElementById('installBtn');
    let deferred = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferred = e;
      btn.hidden = false;
    });
    btn.addEventListener('click', async () => {
      if (!deferred) return;
      deferred.prompt();
      await deferred.userChoice.catch(() => null);
      deferred = null;
      btn.hidden = true;
    });
    window.addEventListener('appinstalled', () => (btn.hidden = true));

    // iPhone / iPad Safari has no install prompt: show a one-time hint.
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const hint = document.getElementById('iosHint');
    if (ios && !standalone() && !BJ.Store.read('bjTrainer.iosHintDone', false)) hint.hidden = false;
    document.getElementById('iosHintClose').addEventListener('click', () => {
      hint.hidden = true;
      BJ.Store.write('bjTrainer.iosHintDone', true);
    });
    if (standalone()) document.documentElement.classList.add('standalone');
  }

  function init() {
    BJ.UI.initTooltips();
    initRulesPanel();
    for (const t of TABS) BJ.Tabs[t].init();
    document.querySelectorAll('.tabs [data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
    window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));
    initKeys();
    initPwa();
    showTab(location.hash.slice(1) || BJ.Store.read(LAST_TAB, 'chart'));
  }

  BJ.App = { showTab };
  document.addEventListener('DOMContentLoaded', init);
})(window);
