/* ============================================================
   modal.js — spring-animated per-date entry editor
   ============================================================ */

(function () {
  var MDT = window.MDT;

  var root, panel, dateLabel, autoNote, absentBtn, absentLabel;
  var milkOut, dahiOut, milkPrice, dahiPrice, totalOut, saveBtn, deleteBtn;
  var lastFocus = null;
  var activeDate = null;
  var draft = { milk: 0, dahi: 0, milkPrice: 0, dahiPrice: 0, absent: false };

  function cacheEls() {
    root = document.getElementById('modalRoot');
    panel = root.querySelector('.modal-panel');
    dateLabel = document.getElementById('modalDate');
    autoNote = document.getElementById('modalAutoNote');
    absentBtn = document.getElementById('absentBtn');
    absentLabel = document.getElementById('absentLabel');
    milkOut = document.getElementById('modalMilk');
    dahiOut = document.getElementById('modalDahi');
    milkPrice = document.getElementById('modalMilkPrice');
    dahiPrice = document.getElementById('modalDahiPrice');
    totalOut = document.getElementById('modalTotal');
    saveBtn = document.getElementById('modalSave');
    deleteBtn = document.getElementById('modalDelete');
  }

  function recalc() {
    milkOut.textContent = String(draft.milk);
    dahiOut.textContent = String(draft.dahi);
    var total = (draft.milk * draft.milkPrice) + (draft.dahi * draft.dahiPrice);
    totalOut.textContent = MDT.rupees(total);
  }

  /* Writes the draft straight to storage on every stepper tap and every
     keystroke, so a refresh mid-edit loses nothing. Zeroing both counts
     removes the day — unless the day is flagged absent, which is itself a
     meaningful record and must survive. */
  function persistDraft() {
    if (!activeDate) return;

    var empty = draft.milk === 0 && draft.dahi === 0;

    if (empty && !draft.absent) {
      if (MDT.getEntry(activeDate)) MDT.deleteEntry(activeDate);
    } else {
      MDT.setEntry(activeDate, {
        milk: draft.milk,
        dahi: draft.dahi,
        milkPrice: draft.milkPrice,
        dahiPrice: draft.dahiPrice,
        manual: true,
        absent: draft.absent
      });
    }

    deleteBtn.classList.toggle('hidden', !MDT.getEntry(activeDate));
    /* Cheap path: repaint just the edited cell + summary strip. The full
       calendar+invoice rebuild happens on close(), so steppers stay at
       60/120Hz instead of re-rendering ~37 backdrop-blurred cells per tap. */
    if (MDT.refreshCell) {
      MDT.refreshCell(activeDate);
    } else {
      MDT.refreshCalendar();
    }
  }

  function paintAutoNote() {
    var entry = MDT.getEntry(activeDate);
    var s = MDT.settings();

    if (draft.absent) {
      autoNote.classList.remove('hidden');
      autoNote.textContent = 'Marked absent. This day is recorded with no packets and stays visible on the calendar.';
      return;
    }
    if (entry && entry.manual === false) {
      autoNote.classList.remove('hidden');
      autoNote.textContent = 'This day was logged automatically. Saving now marks it as a manual entry.';
      return;
    }
    if (entry && entry.manual) {
      autoNote.classList.add('hidden');
      return;
    }
    if (!s.automation) {
      autoNote.classList.remove('hidden');
      autoNote.textContent = 'No record for this day yet. Auto-logging is currently off.';
      return;
    }
    autoNote.classList.remove('hidden');
    autoNote.textContent = 'No record yet. Auto-logging will add '
      + s.milkPackets + ' milk and ' + s.dahiPackets + ' dahi at ' + s.autoTime + '.';
  }

  function paintAbsent() {
    absentBtn.dataset.on = String(draft.absent);
    absentBtn.setAttribute('aria-pressed', draft.absent ? 'true' : 'false');
    absentLabel.textContent = draft.absent ? 'Absent — no delivery' : 'Mark Absent / No Delivery';
    absentBtn.style.background = draft.absent ? 'var(--danger)' : 'var(--field)';
    absentBtn.style.color = draft.absent ? '#fff' : 'var(--muted)';
    absentBtn.style.borderColor = draft.absent ? 'var(--danger)' : 'var(--border)';
  }

  function load(dateKey) {
    activeDate = dateKey;
    var s = MDT.settings();
    var entry = MDT.getEntry(dateKey);

    dateLabel.textContent = MDT.longDate(dateKey);

    if (entry) {
      draft = {
        milk: entry.milk,
        dahi: entry.dahi,
        milkPrice: entry.milkPrice,
        dahiPrice: entry.dahiPrice,
        absent: entry.absent
      };
    } else {
      // Pre-fill with the automation defaults so one tap confirms the day.
      draft = {
        milk: s.milkPackets,
        dahi: s.dahiPackets,
        milkPrice: s.milkPrice,
        dahiPrice: s.dahiPrice,
        absent: false
      };
    }

    milkPrice.value = String(draft.milkPrice);
    dahiPrice.value = String(draft.dahiPrice);
    deleteBtn.classList.toggle('hidden', !entry);

    recalc();
    paintAbsent();
    paintAutoNote();
  }

  /* Toggling absent zeroes both counts and locks the steppers, so the day
     reads as a deliberate "no delivery" rather than an accidental zero.
     Un-marking restores the automation defaults so it's a one-tap undo. */
  function toggleAbsent() {
    draft.absent = !draft.absent;

    if (draft.absent) {
      draft.milk = 0;
      draft.dahi = 0;
    } else {
      var s = MDT.settings();
      draft.milk = s.milkPackets;
      draft.dahi = s.dahiPackets;
    }

    recalc();
    paintAbsent();
    persistDraft();
    paintAutoNote();

    MDT.toast(draft.absent ? 'Marked absent — no delivery' : 'Absent cleared');
  }

  function open(dateKey) {
    lastFocus = document.activeElement;
    load(dateKey);
    root.dataset.open = 'true';
    document.body.style.overflow = 'hidden';
    window.setTimeout(function () { saveBtn.focus(); }, 60);
  }

  function close() {
    root.dataset.open = 'false';
    document.body.style.overflow = '';
    /* Catch up the invoice list now that the modal is gone — steppers only
       repainted the single cell while it was open. */
    if (MDT.refreshInvoices) MDT.refreshInvoices();
    activeDate = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function step(kind, delta) {
    draft[kind] = Math.max(0, draft[kind] + delta);
    recalc();
    persistDraft();
  }

  function onPriceInput() {
    draft.milkPrice = Math.max(0, Number(milkPrice.value) || 0);
    draft.dahiPrice = Math.max(0, Number(dahiPrice.value) || 0);
    recalc();
    persistDraft();
  }

  function save() {
    if (!activeDate) return;
    var isEmpty = draft.milk === 0 && draft.dahi === 0 && !draft.absent;
    if (isEmpty) {
      MDT.deleteEntry(activeDate);
      MDT.toast('Entry cleared');
    } else {
      MDT.setEntry(activeDate, {
        milk: draft.milk,
        dahi: draft.dahi,
        milkPrice: draft.milkPrice,
        dahiPrice: draft.dahiPrice,
        manual: true,
        absent: draft.absent
      });
      MDT.toast('Saved for ' + MDT.parseYmd(activeDate).getDate()
        + ' ' + MDT.MONTHS[MDT.parseYmd(activeDate).getMonth()].slice(0, 3));
    }
    close();
    MDT.refreshCalendar();
  }

  function remove() {
    if (!activeDate) return;
    MDT.deleteEntry(activeDate);
    close();
    MDT.refreshCalendar();
    MDT.toast('Entry deleted');
  }

  MDT.initModal = function () {
    cacheEls();

    root.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-close]')) close();
    });

    // A confirm card may sit on top of this modal — Escape closes
    // only the top layer, so the entry modal keeps its own Escape.
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && root.dataset.open === 'true' && !MDT.isConfirmOpen()) close();
    });

    root.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-step]');
      if (!btn) return;
      if (draft.absent) {
        MDT.toast('Un-mark absent to change packet counts');
        return;
      }
      var parts = btn.dataset.step.split(':');
      step(parts[0], Number(parts[1]));
    });

    absentBtn.addEventListener('click', toggleAbsent);

    milkPrice.addEventListener('input', onPriceInput);
    dahiPrice.addEventListener('input', onPriceInput);

    saveBtn.addEventListener('click', save);
    deleteBtn.addEventListener('click', remove);
  };

  MDT.openModal = open;
  MDT.closeModal = close;
})();
