/* ============================================================
   app.js — bootstrap, tab navigation, automation engine
   ============================================================ */

(function () {
  var MDT = window.MDT;

  var currentTab = 'calendar';
  var toastTimer = null;

  /* ---------- native bar theming (Android StatusBar + NavigationBar) ---------- */

  function initNativeBarTheme() {
    var Capacitor = window.Capacitor;
    if (!Capacitor || !Capacitor.Plugins) return;

    var StatusBar = Capacitor.Plugins.StatusBar;

    // Dark theme background matching the app's color scheme.
    var darkBg = '#0F172A';
    var lightBg = '#F8FAFC';

    var theme = MDT.getTheme();
    var bgColor = theme === 'dark' ? darkBg : lightBg;
    var isDark = theme === 'dark';

    // StatusBar: top system bar (battery, time, signal). Handles both the
    // system status bar AND ensures the content doesn't clip behind it.
    if (StatusBar) {
      StatusBar.setBackgroundColor({ color: bgColor })
        .then(function () {
          // Set icon/text color to contrast with background
          StatusBar.setStyle({ style: isDark ? 'Dark' : 'Light' });
        })
        .catch(function (err) {
          // Plugin not available or misconfigured — app still works
          console.warn('StatusBar config failed:', err.message);
        });
    }

    // Android navigation bar (bottom): controlled by the system theme applied
    // by the WebView. We ensure it's dark through CSS + theme-color meta tags
    // in index.html, plus the overscroll-behavior and safe-area-inset
    // handling below keeps content away from it.
  }

  /* Re-sync bar colors when theme switches */
  var origSetTheme = MDT.setTheme;
  MDT.setTheme = function (theme) {
    var next = origSetTheme(theme);
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      initNativeBarTheme();
    }
    return next;
  };


  /* ---------- toast ---------- */

  MDT.toast = function (message) {
    var el = document.getElementById('toast');
    var text = document.getElementById('toastText');
    if (!el || !text) return;

    text.textContent = message;
    el.classList.remove('hidden');
    el.classList.remove('toast-in');
    void el.offsetWidth;           // restart the animation
    el.classList.add('toast-in');

    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { el.classList.add('hidden'); }, 2400);
  };

  /* ---------- tabs ---------- */

  function movePill(btn) {
    var pill = document.getElementById('segPill');
    pill.style.width = btn.offsetWidth + 'px';
    pill.style.transform = 'translateX(' + (btn.offsetLeft - 4) + 'px)';
  }

  function setTab(tab) {
    currentTab = tab;

    Array.prototype.forEach.call(document.querySelectorAll('.seg-btn'), function (b) {
      b.dataset.active = String(b.dataset.tab === tab);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-panel]'), function (p) {
      var show = p.dataset.panel === tab;
      p.hidden = !show;
      if (show) {
        p.classList.remove('fade-swap');
        void p.offsetWidth;
        p.classList.add('fade-swap');
      }
    });

    var active = document.querySelector('.seg-btn[data-tab="' + tab + '"]');
    if (active) movePill(active);
  }

  function initTabs() {
    var seg = document.getElementById('segControl');
    seg.addEventListener('click', function (ev) {
      var btn = ev.target.closest('.seg-btn');
      if (btn) setTab(btn.dataset.tab);
    });

    setTab('calendar');
    window.addEventListener('resize', function () {
      var active = document.querySelector('.seg-btn[data-tab="' + currentTab + '"]');
      if (active) movePill(active);
    }, { passive: true });
    window.addEventListener('load', function () {
      var active = document.querySelector('.seg-btn[data-tab="' + currentTab + '"]');
      if (active) movePill(active);
    });
  }

  /* ---------- automation ---------- */

  function minutesNow() {
    var d = new Date();
    return (d.getHours() * 60) + d.getMinutes();
  }

  function parseTime(value) {
    var parts = String(value).split(':');
    return (Number(parts[0]) * 60) + Number(parts[1]);
  }

  function todayKey() { return MDT.ymd(new Date()); }

  /* True when a day holds no real record — absent (a deliberate "no
     delivery" choice) or a leftover zeroed-out entry. Those days are open
     to auto-logging. A day with actual packets is never touched. */
  function isOpenForAuto(key) {
    var e = MDT.getEntry(key);
    if (!e) return true;
    if (e.absent) return false;
    return e.milk === 0 && e.dahi === 0;
  }

  /* True when the day belongs to a month the user deleted. Deleted
     months are sealed: backfill must not resurrect the history. */
  function isInDeletedMonth(key) {
    return MDT.isMonthDeleted(key.slice(0, 7));
  }

  /* Logs today's defaults if no manual record exists and the trigger
     time has passed. Safe to call on a timer: it no-ops once written. */
  function runAutomationCheck() {
    var s = MDT.settings();
    if (!s.automation) return false;

    var key = todayKey();
    if (isInDeletedMonth(key)) return false;

    // Don't log before the trigger time.
    if (minutesNow() < parseTime(s.autoTime)) return false;
    if (!isOpenForAuto(key)) return false;
    if (s.milkPackets === 0 && s.dahiPackets === 0) return false;

    MDT.setEntry(key, {
      milk: s.milkPackets,
      dahi: s.dahiPackets,
      milkPrice: s.milkPrice,
      dahiPrice: s.dahiPrice,
      manual: false
    });

    MDT.refreshCalendar();
    MDT.toast('Auto-logged ' + s.milkPackets + ' milk, ' + s.dahiPackets + ' dahi for today');
    return true;
  }

  /* Catch-up sweep: fills days that elapsed while the app was closed.
     Auto-logging runs in a browser tab, so anything past the trigger time
     that never got logged counts as a missed day and is filled with the
     defaults. Both of today's entry states are handled up front:
       - the current day is handled by runAutomationCheck, since it may
         not have reached the trigger time yet;
       - a day the user emptied by hand is open again, so it gets filled
         if it was missed.
     Days explicitly marked absent are never filled. */
  function backfill() {
    var s = MDT.settings();
    if (!s.automation) return 0;

    var trigger = parseTime(s.autoTime);
    var now = new Date();
    var filled = 0;
    var cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Walk back at most 90 days so a long gap can't lock up the UI.
    for (var i = 1; i <= 90; i++) {
      var day = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - i);
      var key = MDT.ymd(day);

      if (isInDeletedMonth(key)) continue;

      // The trigger must have passed on that day too.
      var dayCutoff = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, trigger);
      if (dayCutoff.getTime() > now.getTime()) continue;

      if (!isOpenForAuto(key)) continue;
      if (s.milkPackets === 0 && s.dahiPackets === 0) continue;

      MDT.setEntry(key, {
        milk: s.milkPackets,
        dahi: s.dahiPackets,
        milkPrice: s.milkPrice,
        dahiPrice: s.dahiPrice,
        manual: false
      });
      filled++;
    }

    return filled;
  }

  function reportBackfill(count) {
    if (!count) return;
    MDT.refreshCalendar();
    MDT.toast('Back-filled ' + count + ' missed day' + (count === 1 ? '' : 's'));
  }

  function initAutomation() {
    var filled = backfill();
    runAutomationCheck();

    /* Poll every 30s. The interval is cheap because runAutomationCheck
       no-ops once the day is written, but a laptop that sleeps past the
       trigger wakes to a burst of missed ticks — so the poll is only
       allowed to fire once per calendar day, and the visibility handler
       covers waking instead. */
    var lastPollDay = todayKey();

    window.setInterval(function () {
      var key = todayKey();
      if (key === lastPollDay) return;
      lastPollDay = key;
      runAutomationCheck();
    }, 30000);

    // Fires on wake / tab refocus, which is when a missed trigger matters.
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      lastPollDay = todayKey();
      reportBackfill(backfill());
      runAutomationCheck();
    });

    return filled;
  }

  /* ---------- export wiring ---------- */

  function initExport() {
    // Wrapped so the click event isn't passed in as the month argument.
    document.getElementById('dockExport').addEventListener('click', function () {
      MDT.exportPDF();
    });
  }

  /* ---------- boot ---------- */

  function boot() {
    MDT.applyTheme(MDT.getTheme());

    // Request persistent storage to prevent Android/WebView from evicting
    // localStorage under low disk space. Without this, months of packet data
    // can silently vanish. The promise settles regardless of permission grant.
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().then(function (granted) {
        if (!granted) console.warn('Storage permission denied — data may be evicted under pressure');
      }).catch(function (err) {
        console.warn('Storage.persist() not supported:', err.message);
      });
    }

    // Configure Capacitor StatusBar and NavigationBar for edge-to-edge theming.
    // On Android, this prevents white bars from appearing at top/bottom.
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      initNativeBarTheme();
    }

    initTabs();
    // Invoices first: the calendar's initial render calls into it.
    MDT.initInvoices();
    MDT.initCalendar();
    MDT.initModal();
    MDT.initSettings();
    initExport();

    // Last-resort safety net: mirror the in-memory view of state into
    // storage on tab hide/pagehide, which covers inputs mid-edit.
    var flush = function () {
      try {
        MDT.saveEntries(MDT.entries());
        MDT.saveSettings(MDT.settings());
        MDT.write(MDT.KEYS.theme, MDT.getTheme());
      } catch (err) { /* storage unavailable; nothing to recover */ }
    };
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') flush();
    });
    window.addEventListener('pagehide', flush);

    var filled = initAutomation();
    reportBackfill(filled);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();