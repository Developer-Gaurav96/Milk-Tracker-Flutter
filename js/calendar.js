/* ============================================================
   calendar.js — month grid rendering
   ============================================================ */

(function () {
  var MDT = window.MDT;

  var viewYM = MDT.monthKey(new Date());
  var els = {};

  function cacheEls() {
    els.grid = document.getElementById('calGrid');
    els.label = document.getElementById('calMonthLabel');
    els.prev = document.getElementById('prevMonth');
    els.next = document.getElementById('nextMonth');
    els.today = document.getElementById('todayBtn');
  }

  function shiftMonth(delta) {
    var parts = viewYM.split('-');
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1 + delta, 1);
    viewYM = MDT.monthKey(d);
    render();
  }

  function cellFor(key) {
    var day = MDT.parseYmd(key).getDate();
    var entry = MDT.getEntry(key);
    var isToday = key === MDT.ymd(new Date());

    var cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cal-cell glass rounded-xl py-1.5 flex flex-col items-center justify-center gap-1 min-h-[46px]';
    cell.dataset.date = key;
    cell.dataset.today = isToday ? 'true' : 'false';

    var num = document.createElement('span');
    num.className = 'text-[12.5px] font-semibold leading-none tabular-nums' + (isToday ? ' accent' : '');
    num.textContent = String(day);
    cell.appendChild(num);

    var dots = document.createElement('span');
    dots.className = 'flex items-center gap-[3px] h-1.5';

    if (entry && entry.absent) {
      // Absent days get a struck-through marker rather than a dot.
      var bar = document.createElement('span');
      bar.className = 'w-[14px] h-[2px] rounded-full';
      bar.style.background = 'var(--danger)';
      dots.appendChild(bar);
      cell.dataset.absent = 'true';
      cell.dataset.selected = 'true';
    } else if (entry && (entry.milk > 0 || entry.dahi > 0)) {
      if (entry.milk > 0) dots.appendChild(dot('var(--accent)', entry.manual ? 1 : 0.45));
      if (entry.dahi > 0) dots.appendChild(dot('var(--dahi)', entry.manual ? 1 : 0.45));
      cell.dataset.selected = 'true';
      cell.dataset.absent = 'false';
    } else {
      dots.appendChild(dot('var(--faint)', 0.22));
      cell.dataset.selected = 'false';
      cell.dataset.absent = 'false';
    }

    cell.appendChild(dots);
    return cell;
  }

  function dot(color, alpha) {
    var s = document.createElement('span');
    s.className = 'w-[5px] h-[5px] rounded-full';
    s.style.background = color;
    s.style.opacity = String(alpha);
    return s;
  }

  function render() {
    els.label.textContent = MDT.monthLabel(viewYM);

    var parts = viewYM.split('-');
    var year = Number(parts[0]);
    var month = Number(parts[1]) - 1;
    var first = new Date(year, month, 1);
    var daysInMonth = new Date(year, month + 1, 0).getDate();

    // Monday-first grid: shift Sunday (0) to the end of the week.
    var lead = (first.getDay() + 6) % 7;

    els.grid.innerHTML = '';
    var frag = document.createDocumentFragment();

    for (var b = lead; b > 0; b--) {
      var pad = document.createElement('div');
      pad.className = 'min-h-[46px]';
      frag.appendChild(pad);
    }

    for (var d = 1; d <= daysInMonth; d++) {
      frag.appendChild(cellFor(viewYM + '-' + String(d).padStart(2, '0')));
    }

    els.grid.appendChild(frag);
  }

  /* Totals + invoice cards are the expensive half (they rebuild every
     invoice card in the list). While a modal is open — e.g. the user is
     tapping the +/- steppers, which persist on every tap — skip the
     full invoice re-render and refresh only the summary strip. The
     invoice list is caught up when the modal closes or the month changes. */
  function renderSummary() {
    MDT.renderTotals(viewYM);
  }

  /* Repaint a single calendar cell in place. Called after the entry
     modal edits a day, so steppers don't rebuild all ~37 cells (and
     their backdrop-filter surfaces) on every tap. */
  function updateCell(dateKey) {
    if (!dateKey) return;
    var cell = els.grid.querySelector('.cal-cell[data-date="' + dateKey + '"]');
    if (!cell) return;
    var fresh = cellFor(dateKey);
    cell.replaceWith(fresh);
  }

  /* The month currently displayed in the grid. Other modules read this
     so exports and settings act on what the user is actually looking at. */
  MDT.currentYM = function () { return viewYM; };

  MDT.initCalendar = function () {
    cacheEls();

    els.prev.addEventListener('click', function () { shiftMonth(-1); });
    els.next.addEventListener('click', function () { shiftMonth(1); });
    els.today.addEventListener('click', function () {
      viewYM = MDT.monthKey(new Date());
      render();
    });

    els.grid.addEventListener('click', function (ev) {
      var cell = ev.target.closest('.cal-cell');
      if (!cell || !cell.dataset.date) return;
      MDT.openModal(cell.dataset.date);
    }, { passive: true });

    render();
  };

  /* Full refresh: grid + totals + invoices. */
  MDT.refreshCalendar = function () {
    render();
    MDT.renderTotals(viewYM);
    MDT.renderInvoices(viewYM);
  };

  /* Cheap refresh: one cell + summary strip, no invoice rebuild. */
  MDT.refreshCell = function (dateKey) {
    updateCell(dateKey);
    MDT.renderTotals(viewYM);
  };

  /* Invoice list needs a rebuild (e.g. after closing the modal or an
     import). Re-renders the grid-less parts only. */
  MDT.refreshInvoices = function () {
    render();
    MDT.renderTotals(viewYM);
    MDT.renderInvoices(viewYM);
  };
})();
