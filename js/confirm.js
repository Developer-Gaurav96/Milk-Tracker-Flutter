/* ============================================================
   confirm.js — in-app confirmation card (replaces window.confirm,
   which is a browser-styled dialog that clashes with the glass UI)

   MDT.confirm({ label, title, message, confirmText, danger })
     -> Promise<boolean>  true = confirmed, false = dismissed

   Only one dialog is shown at a time; further calls queue.
   Escape, the backdrop, and Cancel all dismiss (resolve false).
   ============================================================ */

(function () {
  var MDT = window.MDT;

  var root, panel, labelEl, titleEl, msgEl, cancelBtn, confirmBtn;
  var queue = Promise.resolve();
  var settle = null;
  var lastFocus = null;

  function cacheEls() {
    root = document.getElementById('confirmRoot');
    panel = root.querySelector('.modal-panel');
    labelEl = document.getElementById('cfLabel');
    titleEl = document.getElementById('cfTitle');
    msgEl = document.getElementById('cfMessage');
    cancelBtn = document.getElementById('cfCancel');
    confirmBtn = document.getElementById('cfConfirm');
  }

  function isOpen() {
    return root && root.dataset.open === 'true';
  }

  function open(opts) {
    lastFocus = document.activeElement;
    labelEl.textContent = opts.label || 'Confirm';
    titleEl.textContent = opts.title || 'Are you sure?';
    msgEl.textContent = opts.message || '';
    confirmBtn.textContent = opts.confirmText || 'Confirm';
    confirmBtn.style.background = opts.danger === false
      ? 'linear-gradient(135deg,var(--accent),var(--dahi))'
      : 'var(--danger)';

    root.dataset.open = 'true';
    document.body.style.overflow = 'hidden';
    window.setTimeout(function () { cancelBtn.focus(); }, 60);
  }

  function close(result) {
    root.dataset.open = 'false';
    document.body.style.overflow = '';
    if (settle) { var s = settle; settle = null; s(result); }
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function init() {
    cacheEls();

    confirmBtn.addEventListener('click', function () { close(true); });
    cancelBtn.addEventListener('click', function () { close(false); });

    root.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-confirm-close]')) close(false);
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && isOpen()) {
        // Claim the Escape: this card is the topmost layer, so no
        // other modal's Escape handler may run for this keypress.
        ev.stopImmediatePropagation();
        close(false);
      }
    });
  }

  MDT.confirm = function (opts) {
    // Serialize: the next dialog waits for the current one to settle.
    var run = queue.then(function () {
      return new Promise(function (resolve) {
        settle = resolve;
        open(opts);
      });
    });
    // Keep the chain alive even if the caller doesn't await us.
    queue = run.then(function () { return null; }, function () { return null; });
    return run;
  };

  MDT.isConfirmOpen = isOpen;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
