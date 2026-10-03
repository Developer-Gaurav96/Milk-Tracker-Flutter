/* ============================================================
   invoices.js — monthly invoice cards + in-app preview modal
   ============================================================ */

(function () {
  var MDT = window.MDT;
  var els = {};
  var pv = {};
  var activeYM = null;
  var lastFocus = null;

  function cacheEls() {
    els.vendorName = document.getElementById('invVendorName');
    els.vendorPhone = document.getElementById('invVendorPhone');
    els.total = document.getElementById('invTotal');
    els.monthCount = document.getElementById('invMonthCount');
    els.monthList = document.getElementById('invMonthList');

    pv.root = document.getElementById('invModalRoot');
    pv.label = document.getElementById('pvLabel');
    pv.month = document.getElementById('pvMonth');
    pv.vendor = document.getElementById('pvVendor');
    pv.milk = document.getElementById('pvMilk');
    pv.dahi = document.getElementById('pvDahi');
    pv.amount = document.getElementById('pvAmount');
    pv.count = document.getElementById('pvCount');
    pv.list = document.getElementById('pvList');
    pv.total = document.getElementById('pvTotal');
    pv.exportBtn = document.getElementById('pvExportBtn');
    pv.deleteBtn = document.getElementById('pvDeleteBtn');
  }

  /* Dock + calendar summary strip share one source of truth. */
  MDT.renderTotals = function (ym) {
    var t = MDT.monthTotals(ym);

    setText('sumMilkPackets', String(t.milk));
    setText('sumDahiPackets', String(t.dahi));
    setText('sumAmount', MDT.rupees(t.amount));
    setText('dockMilk', String(t.milk));
    setText('dockDahi', String(t.dahi));
    setText('dockAmount', MDT.rupees(t.amount));
  };

  /* ---------- month cards ---------- */

  function statusBadge(ym) {
    var paid = MDT.isMonthPaid(ym);
    if (paid) {
      return '<span class="text-[9.5px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style="background:rgba(16,185,129,.15);color:#10B981">Paid</span>';
    }
    return '<span class="text-[9.5px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style="background:rgba(245,158,11,.15);color:#F59E0B">Pending</span>';
  }

  function monthCard(ym, t) {
    var card = document.createElement('div');
    card.className = 'glass rounded-3xl p-4 w-full mb-3';
    card.dataset.ym = ym;

    var isCurrent = MDT.isCurrentMonth(ym);
    var logged = t.rows.length;
    var absent = t.absent;
    var perDay = logged > 0 ? t.amount / logged : 0;

    var currentBadge = isCurrent
      ? '<span class="text-[9.5px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full" style="background:var(--accent-soft);color:var(--accent)">Current</span>'
      : '';

    // Header + totals act as the preview trigger; the status toggle is a
    // sibling, so tapping one never triggers the other.
    var hit = document.createElement('button');
    hit.type = 'button';
    hit.className = 'step-btn w-full text-left';
    hit.dataset.openYm = ym;
    hit.innerHTML =
      '<div class="flex items-start justify-between gap-3">'
      + '<div class="min-w-0">'
      + '<div class="text-[15px] font-semibold tracking-tight">' + MDT.monthLabel(ym) + '</div>'
      + '<div class="text-[11px] muted mt-1">'
      + logged + (logged === 1 ? ' day' : ' days') + ' logged'
      + (absent > 0 ? ' &nbsp;·&nbsp; ' + absent + ' absent' : '')
      + (perDay > 0 ? ' &nbsp;·&nbsp; ' + MDT.rupees(Math.round(perDay * 100) / 100) + ' avg/day' : '')
      + '</div>'
      + '</div>'
      + '<div class="text-right shrink-0 flex flex-col items-end gap-1">'
      + '<div class="flex items-center gap-1.5">' + currentBadge + statusBadge(ym) + '</div>'
      + '<div class="text-[19px] font-bold leading-tight tabular-nums">' + MDT.rupees(t.amount) + '</div>'
      + '</div>'
      + '</div>'
      + '<div class="flex items-center gap-3 mt-3">'
      + '<span class="text-[11px] flex items-center gap-1.5">'
      + '<span class="w-2 h-2 rounded-full" style="background:var(--accent)"></span>'
      + '<span class="muted">Milk</span><span class="font-semibold">' + t.milk + '</span></span>'
      + '<span class="text-[11px] flex items-center gap-1.5">'
      + '<span class="w-2 h-2 rounded-full" style="background:var(--dahi)"></span>'
      + '<span class="muted">Dahi</span><span class="font-semibold">' + t.dahi + '</span></span>'
      + '<span class="text-[11px] muted ml-auto flex items-center gap-1">'
      + 'Preview'
      + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>'
      + '</span>'
      + '</div>';

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'step-btn flex-1 mt-3 py-2 rounded-xl text-[11.5px] font-semibold transition';
    toggle.dataset.payYm = ym;
    toggle.style.border = '1px solid var(--border)';
    toggle.style.background = MDT.isMonthPaid(ym) ? 'rgba(16,185,129,.10)' : 'var(--field)';
    toggle.style.color = MDT.isMonthPaid(ym) ? '#10B981' : 'var(--muted)';
    toggle.textContent = MDT.isMonthPaid(ym) ? 'Mark as Pending' : 'Mark as Paid';

    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'step-btn shrink-0 mt-3 px-3 py-2 rounded-xl transition';
    del.dataset.delYm = ym;
    del.title = 'Delete this month and its history';
    del.setAttribute('aria-label', 'Delete ' + MDT.monthLabel(ym));
    del.style.border = '1px solid var(--border)';
    del.style.background = 'var(--field)';
    del.style.color = 'var(--danger)';
    del.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9.5 7V4.8h5V7M6.4 7l.9 12.2A1.8 1.8 0 0 0 9.1 21h5.8a1.8 1.8 0 0 0 1.8-1.8L17.6 7"/></svg>';

    var actions = document.createElement('div');
    actions.className = 'flex gap-2';
    actions.appendChild(toggle);
    actions.appendChild(del);

    card.appendChild(hit);
    card.appendChild(actions);
    return card;
  }

  MDT.renderInvoices = function (ym) {
    var s = MDT.settings();
    var current = MDT.monthTotals(ym);

    els.vendorName.textContent = s.vendorName || 'Not set';
    els.vendorPhone.textContent = s.vendorPhone || 'Not set';
    els.total.textContent = MDT.rupees(current.amount);

    // Build the ordered set: every month with data, always including the
    // calendar's current month even when it is still empty.
    var months = MDT.monthsWithData();
    if (months.indexOf(ym) === -1) months.unshift(ym);
    months.sort().reverse();

    els.monthCount.textContent = months.length === 1 ? '1 month' : months.length + ' months';

    els.monthList.innerHTML = '';
    var frag = document.createDocumentFragment();
    months.forEach(function (key) {
      frag.appendChild(monthCard(key, MDT.monthTotals(key)));
    });
    els.monthList.appendChild(frag);
  };

  /* ---------- preview modal ---------- */

  function rowEl(row) {
    var d = MDT.parseYmd(row.date);
    var isToday = row.date === MDT.ymd(new Date());

    var item = document.createElement('div');
    item.className = 'flex items-center gap-3 px-3 py-2.5 hairline-t';

    var day = document.createElement('div');
    day.className = 'w-8 shrink-0 text-center';
    day.innerHTML = '<div class="text-[14px] font-bold leading-none tabular-nums' + (isToday ? ' accent' : '') + '">'
      + d.getDate() + '</div>'
      + '<div class="text-[8.5px] muted uppercase tracking-wide mt-0.5">'
      + MDT.WEEKDAYS[d.getDay()].slice(0, 3) + '</div>';

    var mid = document.createElement('div');
    mid.className = 'flex-1 min-w-0';
    var parts = [];
    if (row.data.milk > 0) {
      parts.push('<span style="color:var(--accent)">' + row.data.milk + ' milk</span>'
        + ' × ' + MDT.rupees(row.data.milkPrice));
    }
    if (row.data.dahi > 0) {
      parts.push('<span style="color:var(--dahi)">' + row.data.dahi + ' dahi</span>'
        + ' × ' + MDT.rupees(row.data.dahiPrice));
    }
    var tags = [];
    if (row.data.manual === false) tags.push('Auto-logged');
    if (row.data.absent) tags.push('Absent');
    mid.innerHTML = '<div class="text-[12px] leading-snug">' + parts.join(' &nbsp;·&nbsp; ') + '</div>'
      + (tags.length ? '<div class="text-[9.5px] faint mt-0.5">' + tags.join(' &nbsp;·&nbsp; ') + '</div>' : '');

    var amt = document.createElement('div');
    amt.className = 'text-[12.5px] font-semibold tabular-nums shrink-0';
    amt.textContent = MDT.rupees(MDT.dayTotal(row.data));

    item.appendChild(day);
    item.appendChild(mid);
    item.appendChild(amt);
    return item;
  }

  function openPreview(ym) {
    var s = MDT.settings();
    var t = MDT.monthTotals(ym);

    activeYM = ym;
    lastFocus = document.activeElement;

    pv.label.textContent = MDT.isCurrentMonth(ym) ? 'Current invoice' : 'Invoice preview';
    pv.month.textContent = MDT.monthLabel(ym);
    pv.vendor.textContent = (s.vendorName || 'Vendor not set')
      + (s.vendorPhone ? ' · ' + s.vendorPhone : '');

    pv.milk.textContent = String(t.milk);
    pv.dahi.textContent = String(t.dahi);
    pv.amount.textContent = MDT.rupees(t.amount);
    pv.total.textContent = MDT.rupees(t.amount);
    pv.count.textContent = t.rows.length + (t.rows.length === 1 ? ' entry' : ' entries');

    pv.list.innerHTML = '';
    if (!t.rows.length) {
      var empty = document.createElement('div');
      empty.className = 'px-3 py-8 text-center';
      empty.innerHTML = '<div class="text-[12px] muted">No entries recorded for this month.</div>';
      pv.list.appendChild(empty);
    } else {
      var frag = document.createDocumentFragment();
      t.rows.forEach(function (row) { frag.appendChild(rowEl(row)); });
      pv.list.appendChild(frag);
    }

    pv.root.dataset.open = 'true';
    document.body.style.overflow = 'hidden';
    window.setTimeout(function () { pv.exportBtn.focus(); }, 60);
  }

  function closePreview() {
    pv.root.dataset.open = 'false';
    document.body.style.overflow = '';
    activeYM = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function deleteMonth(ym) {
    var label = MDT.monthLabel(ym);
    var t = MDT.monthTotals(ym);
    var detail = t.rows.length
      ? 'This removes ' + t.rows.length + ' logged day' + (t.rows.length === 1 ? '' : 's')
        + ' (' + MDT.rupees(t.amount) + ') and its Paid/Pending status.'
      : 'There are no entries for this month.';

    MDT.confirm({
      label: 'Delete history',
      title: 'Delete ' + label + '?',
      message: detail + ' This cannot be undone. Export a backup first if you may need the data.',
      confirmText: 'Delete',
      danger: true
    }).then(function (ok) {
      if (!ok) return;

      MDT.deleteMonth(ym);

      // If the open preview was showing the deleted month, close it
      // before re-rendering so it can't point at emptied state.
      if (activeYM === ym && pv.root.dataset.open === 'true') closePreview();

      MDT.toast(label + ' history deleted');
      MDT.refreshInvoices();
    });
  }

  MDT.initInvoices = function () {
    cacheEls();

    els.monthList.addEventListener('click', function (ev) {
      // The action buttons are siblings of the preview trigger, so
      // ordering these checks keeps one tap from doing two things.
      var delBtn = ev.target.closest('[data-del-ym]');
      if (delBtn) {
        ev.stopPropagation();
        deleteMonth(delBtn.dataset.delYm);
        return;
      }

      var payBtn = ev.target.closest('[data-pay-ym]');
      if (payBtn) {
        ev.stopPropagation();
        var ym = payBtn.dataset.payYm;
        var nowPaid = MDT.toggleMonthPaid(ym);
        MDT.toast(MDT.monthLabel(ym) + ' marked ' + (nowPaid ? 'paid' : 'pending'));
        MDT.renderInvoices(MDT.currentYM());
        return;
      }

      var hit = ev.target.closest('[data-open-ym]');
      if (hit) openPreview(hit.dataset.openYm);
    });

    pv.root.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-close]')) closePreview();
    });

    pv.exportBtn.addEventListener('click', function () {
      if (activeYM) MDT.exportPDF(activeYM);
    });

    pv.deleteBtn.addEventListener('click', function () {
      if (activeYM) deleteMonth(activeYM);
    });

    // Ignore Escape only for this modal; the entry modal handles its own.
    // A confirm card may sit on top of the preview — Escape must close
    // only that top layer, so the preview stays until its own Escape.
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && pv.root.dataset.open === 'true' && !MDT.isConfirmOpen()) closePreview();
    });
  };

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }
})();
