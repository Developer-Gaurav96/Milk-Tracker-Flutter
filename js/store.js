/* ============================================================
   store.js — state, persistence, calculations
   ============================================================ */

var MDT = window.MDT || {};

MDT.KEYS = {
  entries: 'mdt.entries.v1',
  settings: 'mdt.settings.v1',
  theme: 'mdt.theme.v1',
  paid: 'mdt.paid.v1',
  deleted: 'mdt.deleted.v1'
};

MDT.DEFAULT_SETTINGS = {
  automation: false,
  autoTime: '19:30',
  milkPackets: 1,
  dahiPackets: 1,
  milkPrice: 60,
  dahiPrice: 40,
  vendorName: '',
  vendorPhone: ''
};

/* ---------- safe localStorage ---------- */

MDT.read = function (key, fallback) {
  try {
    var raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    var parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch (err) {
    return fallback;
  }
};

MDT.write = function (key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    return false;
  }
};

/* ---------- theme (manual: light | dark only, no system detection) ---------- */

MDT.getTheme = function () {
  var saved = MDT.read(MDT.KEYS.theme, null);
  return saved === 'dark' ? 'dark' : 'light';
};

MDT.setTheme = function (theme) {
  var next = theme === 'dark' ? 'dark' : 'light';
  MDT.write(MDT.KEYS.theme, next);
  MDT.applyTheme(next);
  return next;
};

MDT.applyTheme = function (theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.classList.toggle('light', theme !== 'dark');
};

/* ---------- date helpers ---------- */

MDT.MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

MDT.WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

MDT.ymd = function (date) {
  var m = String(date.getMonth() + 1).padStart(2, '0');
  var d = String(date.getDate()).padStart(2, '0');
  return date.getFullYear() + '-' + m + '-' + d;
};

MDT.parseYmd = function (key) {
  var parts = String(key).split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
};

MDT.monthKey = function (date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
};

MDT.longDate = function (key) {
  var d = MDT.parseYmd(key);
  return MDT.WEEKDAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MDT.MONTHS[d.getMonth()] + ' ' + d.getFullYear();
};

MDT.monthLabel = function (ym) {
  var parts = ym.split('-');
  return MDT.MONTHS[Number(parts[1]) - 1] + ' ' + parts[0];
};

/* ---------- entries ---------- */

/* In-memory mirror of the entries map. localStorage is slow (JSON
   parse/stringify per call) and the calendar renders ~37 cells plus
   every invoice card on each repaint, so reads are served from here
   and writes flush through to storage once. */
var entriesCache = null;

MDT.entries = function () {
  if (entriesCache === null) {
    var raw = MDT.read(MDT.KEYS.entries, {});
    entriesCache = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  }
  return entriesCache;
};

MDT.saveEntries = function (map) {
  entriesCache = map;
  return MDT.write(MDT.KEYS.entries, map);
};

MDT.getEntry = function (dateKey) {
  var e = MDT.entries()[dateKey];
  if (!e) return null;
  return {
    milk: Number(e.milk) || 0,
    dahi: Number(e.dahi) || 0,
    milkPrice: Number(e.milkPrice) || 0,
    dahiPrice: Number(e.dahiPrice) || 0,
    manual: e.manual !== false,
    absent: e.absent === true
  };
};

MDT.setEntry = function (dateKey, data) {
  var map = MDT.entries();
  map[dateKey] = {
    milk: Number(data.milk) || 0,
    dahi: Number(data.dahi) || 0,
    milkPrice: Number(data.milkPrice) || 0,
    dahiPrice: Number(data.dahiPrice) || 0,
    manual: data.manual !== false,
    absent: data.absent === true
  };
  MDT.saveEntries(map);
  // A new entry revives a deleted month: the user is recording in it
  // again, so auto-logging may resume for the remaining days.
  var ym = dateKey.slice(0, 7);
  if (MDT.isMonthDeleted(ym)) {
    var deleted = MDT.deletedMap();
    delete deleted[ym];
    MDT.write(MDT.KEYS.deleted, deleted);
  }
  return map[dateKey];
};

MDT.isAbsent = function (dateKey) {
  var e = MDT.getEntry(dateKey);
  return !!(e && e.absent);
};

MDT.deleteEntry = function (dateKey) {
  var map = MDT.entries();
  delete map[dateKey];
  MDT.saveEntries(map);
};

/* Entries for a given "YYYY-MM" month, ascending by date. */
MDT.monthEntries = function (ym) {
  var all = MDT.entries();
  return Object.keys(all)
    .filter(function (key) { return key.indexOf(ym + '-') === 0; })
    .sort()
    .map(function (key) { return { date: key, data: MDT.getEntry(key) }; })
    .filter(function (row) { return row.data; });
};

/* Months that have at least one entry, newest first, as "YYYY-MM".
   Absent days count: a month of recorded absences is still a real month
   the user worked in, even though its amount is zero. */
MDT.monthsWithData = function () {
  var all = MDT.entries();
  var deleted = MDT.deletedMap();
  var seen = {};
  Object.keys(all).forEach(function (key) {
    var e = all[key];
    if (!e) return;
    var ym = key.slice(0, 7);
    if (deleted[ym] === true) return;          // skip fully deleted months
    var hasPackets = (Number(e.milk) || 0) > 0 || (Number(e.dahi) || 0) > 0;
    if (!hasPackets && e.absent !== true) return;
    seen[ym] = true;
  });
  return Object.keys(seen).sort().reverse();
};

/* ---------- payment status, per month ---------- */

MDT.paidMap = function () {
  var raw = MDT.read(MDT.KEYS.paid, {});
  return (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
};

MDT.isMonthPaid = function (ym) {
  return MDT.paidMap()[ym] === true;
};

MDT.setMonthPaid = function (ym, paid) {
  var map = MDT.paidMap();
  if (paid) {
    map[ym] = true;
  } else {
    delete map[ym];
  }
  MDT.write(MDT.KEYS.paid, map);
  return !!paid;
};

MDT.toggleMonthPaid = function (ym) {
  return MDT.setMonthPaid(ym, !MDT.isMonthPaid(ym));
};

MDT.isCurrentMonth = function (ym) {
  return ym === MDT.monthKey(new Date());
};

/* ---------- deleted months ---------- */

MDT.deletedMap = function () {
  var raw = MDT.read(MDT.KEYS.deleted, {});
  return (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
};

MDT.isMonthDeleted = function (ym) {
  return MDT.deletedMap()[ym] === true;
};

/* Remove every entry for a month plus its payment status. The month is
   remembered as deleted so the automation backfill (which walks back 90
   days) does not silently re-create the history the user just removed.
   Recording a new entry in the month clears the flag. */
MDT.deleteMonth = function (ym) {
  var map = MDT.entries();
  var prefix = ym + '-';
  Object.keys(map).forEach(function (key) {
    if (key.indexOf(prefix) === 0) delete map[key];
  });
  MDT.saveEntries(map);

  if (MDT.isMonthPaid(ym)) MDT.setMonthPaid(ym, false);

  var deleted = MDT.deletedMap();
  deleted[ym] = true;
  MDT.write(MDT.KEYS.deleted, deleted);
};

/* ---------- settings ---------- */

MDT.settings = function () {
  var raw = MDT.read(MDT.KEYS.settings, {});
  var s = (raw && typeof raw === 'object') ? raw : {};
  var out = {};
  Object.keys(MDT.DEFAULT_SETTINGS).forEach(function (k) {
    out[k] = (s[k] === undefined || s[k] === null) ? MDT.DEFAULT_SETTINGS[k] : s[k];
  });
  out.automation = !!out.automation;
  out.milkPackets = Math.max(0, Number(out.milkPackets) || 0);
  out.dahiPackets = Math.max(0, Number(out.dahiPackets) || 0);
  out.milkPrice = Math.max(0, Number(out.milkPrice) || 0);
  out.dahiPrice = Math.max(0, Number(out.dahiPrice) || 0);
  if (!/^\d{2}:\d{2}$/.test(String(out.autoTime))) out.autoTime = '19:30';
  return out;
};

MDT.saveSettings = function (patch) {
  var next = MDT.settings();
  Object.keys(patch).forEach(function (k) { next[k] = patch[k]; });
  MDT.write(MDT.KEYS.settings, next);
  return next;
};

/* ---------- calculations ---------- */

MDT.dayTotal = function (entry) {
  if (!entry) return 0;
  return (entry.milk * entry.milkPrice) + (entry.dahi * entry.dahiPrice);
};

MDT.monthTotals = function (ym) {
  var rows = MDT.monthEntries(ym);
  var milk = 0, dahi = 0, milkValue = 0, dahiValue = 0, absent = 0;
  rows.forEach(function (row) {
    if (row.data.absent) absent++;
    milk += row.data.milk;
    dahi += row.data.dahi;
    milkValue += row.data.milk * row.data.milkPrice;
    dahiValue += row.data.dahi * row.data.dahiPrice;
  });
  return {
    rows: rows,
    milk: milk,
    dahi: dahi,
    milkValue: milkValue,
    dahiValue: dahiValue,
    absent: absent,
    amount: milkValue + dahiValue
  };
};

/* ---------- formatting ---------- */

MDT.rupees = function (n) {
  var v = Math.round((Number(n) || 0) * 100) / 100;
  var str = v.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return '₹' + str;
};

/* Indian digit grouping done by hand: some WebViews ship without full ICU
   data and slip into European grouping, rendering "Rs. 1.860" instead of
   "Rs. 1,860". Decimals show only when non-zero. */
MDT.inr = function (n) {
  var v = Math.round((Number(n) || 0) * 100) / 100;
  var parts = Math.abs(v).toFixed(2).split('.');
  var intPart = parts[0];
  var last3 = intPart.slice(-3);
  var rest = intPart.slice(0, -3);
  if (rest) intPart = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  return (v < 0 ? '-' : '') + intPart + (parts[1] === '00' ? '' : '.' + parts[1]);
};

/* jsPDF's built-in fonts are WinAnsi-encoded and have no rupee glyph,
   so the PDF uses the "Rs." prefix while the UI uses ₹.
   Uses Indian number grouping (lakhs/crores) instead of Western (thousands/millions). */
MDT.pdfRupees = function (n) {
  return 'Rs. ' + MDT.inr(n);
};

/* ---------- backup ---------- */

MDT.exportBackup = function () {
  return {
    app: 'Milk & Dahi Tracker',
    version: 1,
    exportedAt: new Date().toISOString(),
    theme: MDT.getTheme(),
    settings: MDT.settings(),
    entries: MDT.entries(),
    paid: MDT.paidMap()
  };
};

MDT.importBackup = function (payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Backup file is not valid JSON.');
  if (!payload.entries || typeof payload.entries !== 'object' || Array.isArray(payload.entries)) {
    throw new Error('Backup file is missing an entries object.');
  }

  var clean = {};
  Object.keys(payload.entries).forEach(function (key) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
    var e = payload.entries[key] || {};
    clean[key] = {
      milk: Math.max(0, Number(e.milk) || 0),
      dahi: Math.max(0, Number(e.dahi) || 0),
      milkPrice: Math.max(0, Number(e.milkPrice) || 0),
      dahiPrice: Math.max(0, Number(e.dahiPrice) || 0),
      manual: e.manual !== false,
      absent: e.absent === true
    };
  });

  MDT.saveEntries(clean);

  // The imported data is now the source of truth: any months the user
  // deleted afterwards are moot, so clear the deleted flags.
  MDT.write(MDT.KEYS.deleted, {});

  if (payload.settings && typeof payload.settings === 'object') {
    MDT.saveSettings(payload.settings);
  }
  if (payload.theme === 'light' || payload.theme === 'dark') {
    MDT.setTheme(payload.theme);
  }

  var paidClean = {};
  if (payload.paid && typeof payload.paid === 'object' && !Array.isArray(payload.paid)) {
    Object.keys(payload.paid).forEach(function (key) {
      if (/^\d{4}-\d{2}$/.test(key) && payload.paid[key] === true) paidClean[key] = true;
    });
  }
  MDT.write(MDT.KEYS.paid, paidClean);

  return Object.keys(clean).length;
};

window.MDT = MDT;
