/* ============================================================
   capacitor-files.js — native file export/import on Android
   ------------------------------------------------------------
   Inside the Capacitor APK an <a download> blob: link silently
   does nothing: the WebView has no Downloads folder to write to
   and no browser chrome to route the tap. So on native we write
   the file with @capacitor/filesystem, then hand the resulting
   content:// URI to @capacitor/share, which raises the system
   sheet — Save to Downloads, Drive, WhatsApp, mail, and so on.

   In a browser (PWA / desktop) both plugins are absent, so every
   path falls back to the ordinary blob download. Detect with
   Capacitor.isNativePlatform(), which is false in a browser and
   true only inside the native WebView.
   ============================================================ */

(function () {
  var MDT = window.MDT;
  var Capacitor = window.Capacitor;

  var isNative = !!(Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());

  // Registered by the native bridge on window.Capacitor when the plugin
  // is installed and allowed. Guarded so a missing plugin degrades to the
  // web path instead of throwing.
  function plugin(name) {
    if (!isNative || !Capacitor.Plugins) return null;
    return Capacitor.Plugins[name] || null;
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        // "data:application/pdf;base64,XXXX" -> "XXXX"
        var comma = String(reader.result).indexOf(',');
        resolve(comma === -1 ? reader.result : String(reader.result).slice(comma + 1));
      };
      reader.onerror = function () { reject(new Error('Could not read the generated file.')); };
      reader.readAsDataURL(blob);
    });
  }

  /* ---------- web fallback ---------- */

  function downloadInBrowser(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Safari needs the URL alive a beat past the click to finish the save.
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---------- native export ---------- */

  // Files land in Cache, not Documents: Cache is always writable without a
  // runtime permission prompt, and the share sheet takes a copy from there
  // wherever the user chooses to put it. Documents would leave the file
  // stranded in app-private storage the user can never reach.
  async function exportViaNative(blob, filename) {
    var Filesystem = plugin('Filesystem');
    var Share = plugin('Share');
    if (!Filesystem) return false;   // signals "not possible", caller falls back

    try {
      var base64 = await blobToBase64(blob);

      var written = await Filesystem.writeFile({
        path: filename,
        data: base64,
        directory: 'CACHE',       // Directory.Cache
        // No `encoding` key: @capacitor/filesystem v8's Encoding enum has no
        // BASE64 member (only UTF8/ASCII/UTF16). Passing encoding:'base64'
        // makes the native fromEncodingName() fail Charset.forName("base64")
        // and silently fall back to UTF-8 text — which writes the base64
        // *string* to disk instead of decoding it, corrupting the PDF.
        // Omitting encoding selects the native Default = Base64 path, which
        // Base64.decode()s the payload into real bytes.
        recursive: true
      });

      var uri = (written && written.uri) || (await Filesystem.getUri({
        path: filename,
        directory: 'CACHE'
      })).uri;

      if (!Share) {
        MDT.toast('Saved to app storage: ' + filename);
        return true;
      }

      // @capacitor/share v8 takes a `files` array of URIs; the older single
      // `url` field is deprecated and is ignored on Android, which would
      // raise an empty sheet with nothing to save.
      await Share.share({
        title: filename,
        text: 'Invoice from Milk & Dahi Tracker',
        files: [uri],
        dialogTitle: 'Save or share'
      });

      // Share.share rejects with this exact string when the user dismisses
      // the sheet — not a failure, so it must not surface as an error.
      return true;
    } catch (err) {
      var msg = err && err.message ? err.message : String(err);
      if (msg === 'Share canceled.' || msg === 'Share cancelled.') return true;
      console.warn('Native export failed, falling back to browser path:', err);
      return false;
    }
  }

  async function exportBlob(blob, filename) {
    if (isNative) {
      var ok = await exportViaNative(blob, filename);
      if (ok) return true;
    }
    downloadInBrowser(blob, filename);
    return true;
  }

  /* ---------- PDF ---------- */

  // Wrap the module's original export so every existing call site — the dock
  // button in app.js, the invoice panel in invoices.js — routes through the
  // native path without any of them knowing.
  var webExportPDF = MDT.exportPDF;

  MDT.exportPDF = function (ym) {
    var target = ym || (typeof MDT.currentYM === 'function' ? MDT.currentYM() : MDT.monthKey(new Date()));

    if (!isNative) return webExportPDF(target);

    return Promise.resolve()
      .then(function () { return MDT.generatePDFBlob(target); })
      .then(function (blob) {
        return exportBlob(blob, MDT.pdfFileName ? MDT.pdfFileName(target) : ('milk-dahi-invoice-' + target + '.pdf'));
      })
      .then(function (ok) {
        MDT.toast('Invoice ready to save or share');
        return ok;
      })
      .catch(function (err) {
        MDT.toast(err && err.message ? err.message : 'Could not generate the PDF.');
        return false;
      });
  };

  /* ---------- backup JSON ---------- */

  MDT.exportBackupFile = function () {
    var json = JSON.stringify(MDT.exportBackup(), null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var filename = 'milk-dahi-backup-' + MDT.ymd(new Date()) + '.json';

    return exportBlob(blob, filename).then(function (ok) {
      MDT.toast('Backup ready to save or share');
      return ok;
    });
  };

  MDT.importBackupFile = function (file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        try {
          resolve(MDT.importBackup(JSON.parse(reader.result)));
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = function () { reject(new Error('Could not read that file.')); };
      reader.readAsText(file);
    });
  };

  /* ---------- rewire the settings backup buttons ---------- */

  // settings.js already binds these to a plain blob download, which is the
  // exact path that fails on Android. Loaded after it, so a capture-phase
  // listener here runs first and stopPropagation keeps the old handler from
  // firing a second, competing download.
  function captureNativeBackupButtons() {
    var exportBtn = document.getElementById('btnExportBackup');
    var importBtn = document.getElementById('btnImportBackup');
    var input = document.getElementById('importFile');

    if (exportBtn) {
      exportBtn.addEventListener('click', function (ev) {
        if (!isNative) return;            // web: leave settings.js's own handler alone
        ev.preventDefault();
        ev.stopImmediatePropagation();
        MDT.exportBackupFile();
      }, true);
    }

    if (importBtn && input) {
      importBtn.addEventListener('click', function (ev) {
        if (!isNative) return;
        ev.preventDefault();
        ev.stopImmediatePropagation();
        input.click();
      }, true);

      input.addEventListener('change', function () {
        if (!isNative) return;            // web: settings.js handles the change
        var file = input.files && input.files[0];
        if (!file) return;

        MDT.importBackupFile(file)
          .then(function (count) {
            // A backup carries theme + settings, so the whole UI has to
            // re-read them — same refresh order as settings.js's own import.
            MDT.applyTheme(MDT.getTheme());
            MDT.refreshSettings();
            MDT.refreshCalendar();
            MDT.toast('Imported ' + count + ' entr' + (count === 1 ? 'y' : 'ies'));
          })
          .catch(function (err) {
            MDT.toast(err && err.message ? err.message : 'Could not read that file.');
          })
          .then(function () { input.value = ''; });
      }, true);
    }
  }

  function init() {
    if (isNative) captureNativeBackupButtons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.MDT = MDT;
})();