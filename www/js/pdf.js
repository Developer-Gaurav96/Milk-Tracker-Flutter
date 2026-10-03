/* ============================================================
   pdf.js — ultra-minimal itemised invoice (jsPDF)
   Layout:
     1. Header: app name + period
     2. Rate badge: "Unit Rates: Milk @ Rs. 60/pkt | Dahi @ Rs. 40/pkt"
     3. 4-column table: DATE | MILK PACKETS | DAHI PACKETS | DAILY TOTAL
     4. Grand total row
   Rules:
     - Clean spacing, no vendor if not set
     - "-" for zero packets
     - page-break-inside: avoid on header + table sections
     - Indian number grouping via MDT.pdfRupees

   build() returns the jsPDF doc instead of saving it, so both the
   browser download path and the native Capacitor share path in
   capacitor-files.js render from one implementation.
   ============================================================ */

(function () {
  var MDT = window.MDT;

  var INK      = [30, 41, 59];      // slate-800
  var MUTED    = [100, 116, 139];   // slate-500
  var LINE     = [226, 232, 240];   // slate-200
  var BG       = [248, 250, 252];   // slate-50

  function currentYM() {
    return typeof MDT.currentYM === 'function'
      ? MDT.currentYM()
      : MDT.monthKey(new Date());
  }

  function build(ym) {
    // build() is only reached after ready() resolves, so jsPDF is present.
    var JsPDF = window.jspdf.jsPDF;
    var doc = new JsPDF({ unit: 'pt', format: 'a4' });

    var W  = doc.internal.pageSize.getWidth();   // 595
    var H  = doc.internal.pageSize.getHeight();  // 842
    var M  = 48;                                 // side margin
    var CW = W - (M * 2);                        // content width
    var y  = 60;                                 // start Y

    var s = MDT.settings();
    var t = MDT.monthTotals(ym);

    /* ---------- helpers ---------- */

    function drawRect(x, y, w, h, color, rounded) {
      if (rounded) {
        doc.setFillColor.apply(doc, color);
        doc.roundedRect(x, y, w, h, 6, 6, 'F');
      } else {
        doc.setFillColor.apply(doc, color);
        doc.rect(x, y, w, h, 'F');
      }
    }

    function addPageIfNeeded(need) {
      if (y + need > H - 60) {
        doc.addPage();
        y = 60;
      }
    }

    /* ---------- 1. Header ---------- */

    // App name
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor.apply(doc, INK);
    doc.text('Milk & Dahi Tracker', M, y);
    y += 22;

    // Period + generation date
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor.apply(doc, MUTED);
    doc.text(MDT.monthLabel(ym), M, y);
    doc.text('Generated ' + MDT.longDate(MDT.ymd(new Date())), W - M, y, { align: 'right' });
    y += 28;

    /* ---------- 2. Rate badge (only if rates > 0) ---------- */

    if (s.milkPrice > 0 || s.dahiPrice > 0) {
      var badgeH = 28;
      addPageIfNeeded(badgeH + 16);
      drawRect(M, y, CW, badgeH, [240, 245, 250], true); // slate-100 bg
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor.apply(doc, MUTED);
      var rateStr = 'Unit Rates: ';
      var parts = [];
      if (s.milkPrice > 0) parts.push('Milk @ ' + MDT.pdfRupees(s.milkPrice) + '/pkt');
      if (s.dahiPrice > 0) parts.push('Dahi @ ' + MDT.pdfRupees(s.dahiPrice) + '/pkt');
      rateStr += parts.join(' | ');
      doc.text(rateStr, M + 12, y + 18);
      y += badgeH + 16;
    }

    /* ---------- 3. Vendor block (only if set) ---------- */

    var hasVendor = s.vendorName && s.vendorName.trim() && s.vendorName !== 'Not set';
    var hasPhone  = s.vendorPhone && s.vendorPhone.trim() && s.vendorPhone !== 'Not set';

    if (hasVendor || hasPhone) {
      var vendorH = hasPhone ? 40 : 28;
      addPageIfNeeded(vendorH + 12);
      drawRect(M, y, CW, vendorH, [255, 255, 255], true); // white card
      doc.setDrawColor.apply(doc, LINE);
      doc.setLineWidth(0.5);
      doc.roundedRect(M, y, CW, vendorH, 6, 6, 'D');

      y += 14;
      if (hasVendor) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor.apply(doc, INK);
        doc.text(s.vendorName, M + 12, y);
        y += 14;
      }
      if (hasPhone) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor.apply(doc, MUTED);
        doc.text('Phone: ' + s.vendorPhone, M + 12, y);
        y += 12;
      }
      y += 8;
    }

    /* ---------- 4. Summary cards (Milk, Dahi, Total) ---------- */

    var cardW = (CW - 16) / 3;
    var cardH = 50;
    addPageIfNeeded(cardH + 16);

    function card(x, label, value, accent) {
      drawRect(x, y, cardW, cardH, [255, 255, 255], true);
      doc.setDrawColor.apply(doc, LINE);
      doc.setLineWidth(0.5);
      doc.roundedRect(x, y, cardW, cardH, 6, 6, 'D');

      var cx = x + 14;
      var cy = y + 14;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor.apply(doc, MUTED);
      doc.text(label.toUpperCase(), cx, cy);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor.apply(doc, accent);
      doc.text(value, cx, cy + 18);
    }

    card(M,                 'Milk Packets', String(t.milk), [2, 132, 199]);   // accent
    card(M + cardW + 8,     'Dahi Packets', String(t.dahi), [124, 58, 237]);  // dahi
    card(M + (cardW * 2) + 16, 'Total Amount', MDT.pdfRupees(t.amount), INK);

    y += cardH + 20;

    /* ---------- 5. Table ---------- */

    // Column widths — DAILY TOTAL hugs the right edge (6pt padding, like other columns)
    var COL_DATE  = M;
    var COL_MILK  = M + 90;
    var COL_DAHI  = M + 190;
    var COL_TOTAL = W - M - 6;

    // Header row
    addPageIfNeeded(30);
    doc.setFillColor.apply(doc, INK);
    doc.roundedRect(M, y, CW, 30, 4, 4, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text('DATE',       COL_DATE + 6, y + 19);
    doc.text('MILK PKTS',  COL_MILK + 6, y + 19);
    doc.text('DAHI PKTS',  COL_DAHI + 6, y + 19);
    doc.text('DAILY TOTAL', COL_TOTAL, y + 19, { align: 'right' });

    y += 30;

    // Data rows
    var rowH = 26;
    var alt  = false;

    if (!t.rows.length) {
      addPageIfNeeded(40);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor.apply(doc, MUTED);
      doc.text('No entries recorded for this period.', M + 12, y + 20);
      y += 40;
    } else {
      t.rows.forEach(function (row) {
        addPageIfNeeded(rowH + 4);

        // Alternate row background
        if (alt) {
          doc.setFillColor.apply(doc, BG);
          doc.rect(M, y - 4, CW, rowH, 'F');
        }

        // Auto-logged indicator: thin left accent bar
        if (row.data.manual === false) {
          doc.setFillColor.apply(doc, [2, 132, 199]);
          doc.rect(M, y - 4, 3, rowH, 'F');
        }

        var d = MDT.parseYmd(row.date);

        // Date
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor.apply(doc, INK);
        var dateStr = String(d.getDate()).padStart(2, '0') + ' ' + MDT.MONTHS[d.getMonth()].slice(0, 3);
        doc.text(dateStr, COL_DATE + 6, y + 14);

        // Milk packets
        doc.setFont('helvetica', row.data.milk > 0 ? 'bold' : 'normal');
        doc.setFontSize(9);
        doc.setTextColor.apply(doc, row.data.milk > 0 ? [2, 132, 199] : MUTED);
        var milkStr = row.data.milk > 0 ? (row.data.milk + ' pkt' + (row.data.milk > 1 ? 's' : '')) : '-';
        doc.text(milkStr, COL_MILK + 6, y + 14);

        // Dahi packets
        doc.setTextColor.apply(doc, row.data.dahi > 0 ? [124, 58, 237] : MUTED);
        var dahiStr = row.data.dahi > 0 ? (row.data.dahi + ' pkt' + (row.data.dahi > 1 ? 's' : '')) : '-';
        doc.text(dahiStr, COL_DAHI + 6, y + 14);

        // Daily total
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor.apply(doc, INK);
        doc.text(MDT.pdfRupees(MDT.dayTotal(row.data)), COL_TOTAL, y + 14, { align: 'right' });

        y += rowH;
        alt = !alt;
      });

      // Table bottom line
      doc.setDrawColor.apply(doc, LINE);
      doc.setLineWidth(0.5);
      doc.line(M, y, W - M, y);
      y += 12;
    }

    /* ---------- 6. Grand Total ---------- */

    addPageIfNeeded(50);
    var totalBoxW = 220;
    var totalBoxH = 56;
    var tx = W - M - totalBoxW;
    var ty = y;

    drawRect(tx, ty, totalBoxW, totalBoxH, [255, 255, 255], true);
    doc.setDrawColor.apply(doc, LINE);
    doc.setLineWidth(0.5);
    doc.roundedRect(tx, ty, totalBoxW, totalBoxH, 6, 6, 'D');

    // Subtotals
    var bx = tx + 16;
    var by = ty + 16;

    function totalLine(label, value, isTotal) {
      doc.setFont('helvetica', isTotal ? 'bold' : 'normal');
      doc.setFontSize(isTotal ? 11 : 9);
      doc.setTextColor.apply(doc, isTotal ? INK : MUTED);
      doc.text(label, bx, by);
      doc.setFont('helvetica', isTotal ? 'bold' : 'normal');
      doc.setTextColor.apply(doc, INK);
      doc.text(value, tx + totalBoxW - 16, by, { align: 'right' });
      by += isTotal ? 22 : 18;
    }

    totalLine('Milk Subtotal', MDT.pdfRupees(t.milkValue), false);
    totalLine('Dahi Subtotal', MDT.pdfRupees(t.dahiValue), false);
    totalLine('GRAND TOTAL', MDT.pdfRupees(t.amount), true);

    y = ty + totalBoxH + 24;

    /* ---------- 7. Footer ---------- */

    doc.setDrawColor.apply(doc, LINE);
    doc.setLineWidth(0.4);
    doc.line(M, y, W - M, y);
    y += 10;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor.apply(doc, MUTED);
    doc.text('Auto-generated by Milk & Dahi Tracker', M, y);
    doc.text('Amounts computed from daily packet counts and per-day unit rates.', M, y + 12);
    doc.text(t.rows.length + ' day(s) logged', W - M, y, { align: 'right' });

    return doc;
  }

  /* ---------- public API ---------- */

  function fileName(ym) {
    return 'milk-dahi-invoice-' + ym + '.pdf';
  }

  /* Lazy-loads jsPDF (loaded on demand, not at startup) before rendering. */
  function ready() {
    if (typeof window.jspdf !== 'undefined' && window.jspdf.jsPDF) {
      return Promise.resolve();
    }
    if (typeof window.__loadJsPDF === 'function') {
      return window.__loadJsPDF();
    }
    return Promise.reject(new Error('jsPDF is not available.'));
  }

  /* The rendered document, for callers that need the bytes themselves
     (the native Capacitor share path). */
  MDT.generatePDFBlob = function (ym) {
    return ready().then(function () {
      return build(ym || currentYM()).output('blob');
    });
  };

  MDT.exportPDF = function (ym) {
    var target = ym || currentYM();
    return ready().then(function () {
      build(target).save(fileName(target));
      MDT.toast('Invoice PDF saved');
      return true;
    }).catch(function (err) {
      MDT.toast(err && err.message ? err.message : 'Could not generate the PDF.');
      return false;
    });
  };

  MDT.exportPDFFor = function (ym) { return ready().then(function () { build(ym); }); };

  MDT.pdfFileName = fileName;
})();