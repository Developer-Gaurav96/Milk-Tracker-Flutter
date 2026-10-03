/* ============================================================
   settings.js — automation, vendor, theme, backup controls
   ============================================================ */

(function () {
  var MDT = window.MDT;
  var els = {};

  function cacheEls() {
    els.autoToggle = document.getElementById('autoToggle');
    els.autoTime = document.getElementById('setAutoTime');
    els.milkPrice = document.getElementById('setMilkPrice');
    els.dahiPrice = document.getElementById('setDahiPrice');
    els.milkPackets = document.getElementById('setMilkPackets');
    els.dahiPackets = document.getElementById('setDahiPackets');
    els.vendorName = document.getElementById('setVendorName');
    els.vendorPhone = document.getElementById('setVendorPhone');
    els.themeOpts = Array.prototype.slice.call(document.querySelectorAll('.theme-opt'));
    els.exportBtn = document.getElementById('btnExportBackup');
    els.importBtn = document.getElementById('btnImportBackup');
    els.resetBtn = document.getElementById('btnResetMonth');
    els.importFile = document.getElementById('importFile');
    els.autoDot = document.getElementById('autoDot');
    els.autoLabel = document.getElementById('autoLabel');
    els.headerSub = document.getElementById('headerSub');
  }

  function paintToggle(on) {
    els.autoToggle.setAttribute('aria-checked', on ? 'true' : 'false');
  }

  function paintAutoBadge() {
    var s = MDT.settings();
    if (s.automation) {
      els.autoDot.style.background = 'var(--accent)';
      els.autoDot.style.boxShadow = '0 0 10px var(--glow)';
      els.autoLabel.textContent = 'Auto ' + s.autoTime;
      els.headerSub.textContent = 'Auto-logging on at ' + s.autoTime;
    } else {
      els.autoDot.style.background = 'var(--faint)';
      els.autoDot.style.boxShadow = 'none';
      els.autoLabel.textContent = 'Manual';
      els.headerSub.textContent = 'Daily dairy log';
    }
  }

  function paintThemeButtons() {
    var theme = MDT.getTheme();
    els.themeOpts.forEach(function (btn) {
      var on = btn.dataset.themeOpt === theme;
      btn.style.background = on ? 'var(--glass-strong)' : 'transparent';
      btn.style.color = on ? 'var(--accent)' : 'var(--muted)';
      btn.style.boxShadow = on ? '0 0 0 1px var(--border), 0 0 16px var(--glow)' : 'none';
    });
  }

  function num(el, min) {
    return Math.max(min, Number(el.value) || 0);
  }

  function bindNumber(el, key, min) {
    var commit = function () {
      var patch = {};
      patch[key] = num(el, min);
      MDT.saveSettings(patch);
    };
    el.addEventListener('input', commit);
    el.addEventListener('blur', function () {
      el.value = String(num(el, min));
      commit();
    });
  }

  function fill() {
    var s = MDT.settings();
    els.autoTime.value = s.autoTime;
    els.milkPrice.value = String(s.milkPrice);
    els.dahiPrice.value = String(s.dahiPrice);
    els.milkPackets.value = String(s.milkPackets);
    els.dahiPackets.value = String(s.dahiPackets);
    els.vendorName.value = s.vendorName || '';
    els.vendorPhone.value = s.vendorPhone || '';
    paintToggle(s.automation);
    paintAutoBadge();
    paintThemeButtons();
  }

  function doExport() {
    var payload = MDT.exportBackup();
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'milk-dahi-backup-' + MDT.ymd(new Date()) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    MDT.toast('Backup downloaded');
  }

  function doImport(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var count;
      try {
        count = MDT.importBackup(JSON.parse(reader.result));
      } catch (err) {
        MDT.toast(err.message || 'Could not read that file.');
        return;
      }
      MDT.applyTheme(MDT.getTheme());
      fill();
      MDT.refreshCalendar();
      MDT.toast('Imported ' + count + ' entr' + (count === 1 ? 'y' : 'ies'));
    };
    reader.onerror = function () { MDT.toast('Could not read that file.'); };
    reader.readAsText(file);
  }

  function doReset() {
    var ym = MDT.currentYM();
    var label = MDT.monthLabel(ym);

    MDT.confirm({
      label: 'Reset data',
      title: 'Reset ' + label + '?',
      message: 'This deletes every entry for the month currently shown in the calendar. This cannot be undone. Export a backup first if you may need the data.',
      confirmText: 'Reset',
      danger: true
    }).then(function (ok) {
      if (!ok) return;

      var map = MDT.entries();
      var prefix = ym + '-';
      var removed = 0;
      Object.keys(map).forEach(function (key) {
        if (key.indexOf(prefix) === 0) { delete map[key]; removed++; }
      });
      MDT.saveEntries(map);
      MDT.refreshCalendar();
      MDT.toast('Cleared ' + removed + ' entr' + (removed === 1 ? 'y' : 'ies') + ' from ' + label);
    });
  }

  MDT.initSettings = function () {
    cacheEls();

    els.autoToggle.addEventListener('click', function () {
      var next = !MDT.settings().automation;
      MDT.saveSettings({ automation: next });
      paintToggle(next);
      paintAutoBadge();
      MDT.toast(next ? 'Auto-logging on' : 'Auto-logging off');
    });

    // Persist on every change event so the trigger time survives a refresh.
    var commitTime = function () {
      var val = /^\d{2}:\d{2}$/.test(els.autoTime.value) ? els.autoTime.value : '19:30';
      els.autoTime.value = val;
      MDT.saveSettings({ autoTime: val });
      paintAutoBadge();
    };
    els.autoTime.addEventListener('input', commitTime);
    els.autoTime.addEventListener('change', commitTime);

    bindNumber(els.milkPrice, 'milkPrice', 0);
    bindNumber(els.dahiPrice, 'dahiPrice', 0);
    bindNumber(els.milkPackets, 'milkPackets', 0);
    bindNumber(els.dahiPackets, 'dahiPackets', 0);

    els.vendorName.addEventListener('input', function () {
      MDT.saveSettings({ vendorName: els.vendorName.value });
      MDT.refreshCalendar();
    });
    els.vendorPhone.addEventListener('input', function () {
      MDT.saveSettings({ vendorPhone: els.vendorPhone.value });
      MDT.refreshCalendar();
    });

    els.themeOpts.forEach(function (btn) {
      btn.addEventListener('click', function () {
        MDT.setTheme(btn.dataset.themeOpt);
        paintThemeButtons();
      });
    });

    els.exportBtn.addEventListener('click', doExport);
    els.importBtn.addEventListener('click', function () { els.importFile.click(); });
    els.importFile.addEventListener('change', function () {
      var file = els.importFile.files && els.importFile.files[0];
      if (file) doImport(file);
      els.importFile.value = '';
    });
    els.resetBtn.addEventListener('click', doReset);

    fill();
  };

  MDT.refreshSettings = fill;
})();
