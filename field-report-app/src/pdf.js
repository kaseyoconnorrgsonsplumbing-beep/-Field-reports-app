import { jsPDF } from 'jspdf';
import { loadImage, money } from './imageUtils';

// US Letter, points. Content box sits below the letterhead header.
const PAGE_W = 612;
const PAGE_H = 792;
const TOP = 122; // clear of the logo / address block
const BOTTOM = 742; // above the bottom safe margin
const LEFT = 54;
const RIGHT = 558;
const W = RIGHT - LEFT;
const NAVY = [27, 42, 94];
const RED = [154, 59, 48];
const GRAY = [90, 96, 110];
const BLACK = [30, 32, 40];

let letterheadCache = null;
async function letterhead() {
  if (letterheadCache) return letterheadCache;
  const res = await fetch('/letterhead.jpg');
  const blob = await res.blob();
  letterheadCache = await new Promise((r) => {
    const fr = new FileReader();
    fr.onload = () => r(fr.result);
    fr.readAsDataURL(blob);
  });
  return letterheadCache;
}

/**
 * Build the PDF. `report` is the Firestore report doc, `photos` is a map of
 * photoId -> { annotated, original }.
 * Returns the jsPDF instance (caller decides: save / share / open).
 */
export async function buildReportPdf(report, photos) {
  const bg = await letterhead();
  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: true });
  let y = TOP;

  const newPage = () => {
    doc.addPage();
    doc.addImage(bg, 'JPEG', 0, 0, PAGE_W, PAGE_H, 'letterhead', 'FAST');
    y = TOP;
  };
  doc.addImage(bg, 'JPEG', 0, 0, PAGE_W, PAGE_H, 'letterhead', 'FAST');

  const ensure = (h) => {
    if (y + h > BOTTOM) newPage();
  };

  const text = (str, { size = 10.5, bold = false, color = BLACK, x = LEFT, width = W, gap = 4, lineH = 1.35 } = {}) => {
    if (!str) return;
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(String(str), width);
    const lh = size * lineH;
    for (const line of lines) {
      ensure(lh);
      doc.text(line, x, y + size * 0.85);
      y += lh;
    }
    y += gap;
  };

  const label = (str) => text(str, { size: 9, bold: true, color: NAVY, gap: 1 });

  // ---------- Title block ----------
  const title = report.title || 'Field Issue Report';
  text(title, { size: 17, bold: true, color: NAVY, gap: 6 });
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(1.2);
  doc.line(LEFT, y, RIGHT, y);
  y += 10;

  // Info grid (two columns)
  const info = [
    ['Client', report.clientName],
    ['Property', report.address],
    ['Contact', [report.contactName, report.contactPhone, report.contactEmail].filter(Boolean).join('  ·  ')],
    ['Date', formatDate(report.date)],
    ['Prepared by', report.preparedBy],
    ['Report #', report.reportNumber || report.id?.slice(0, 8).toUpperCase()],
  ].filter(([, v]) => v);
  const colW = W / 2;
  doc.setFontSize(9.5);
  const rowH = 14;
  ensure(Math.ceil(info.length / 2) * rowH + 10);
  info.forEach(([k, v], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = LEFT + col * colW;
    const yy = y + row * rowH + 9;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...GRAY);
    doc.text(k.toUpperCase(), x, yy);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...BLACK);
    const val = doc.splitTextToSize(String(v), colW - 80)[0];
    doc.text(val, x + 72, yy);
  });
  y += Math.ceil(info.length / 2) * rowH + 12;

  // ---------- Summary ----------
  if (report.summary) {
    label('SUMMARY');
    text(report.summary, { gap: 10 });
  }

  // ---------- Issues ----------
  const issues = report.issues || [];
  if (issues.length) {
    label(`ISSUES FOUND (${issues.length})`);
    y += 4;
  }

  for (let n = 0; n < issues.length; n++) {
    const it = issues[n];
    const heading = `${n + 1}.  ${it.title || it.location || 'Issue'}`;
    ensure(60);
    // heading bar
    doc.setFillColor(...RED);
    doc.rect(LEFT, y, 4, 18, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(...NAVY);
    doc.text(doc.splitTextToSize(heading, W - 120)[0], LEFT + 12, y + 13);
    if (it.price !== '' && it.price != null && !isNaN(Number(it.price))) {
      doc.setTextColor(...RED);
      doc.text(money(it.price), RIGHT, y + 13, { align: 'right' });
    }
    y += 24;
    if (it.location) {
      text(`Location: ${it.location}`, { size: 9.5, color: GRAY, gap: 6 });
    }

    // photos, two per row
    const ids = (it.photoIds || []).filter((id) => photos[id]?.annotated || photos[id]?.original);
    if (ids.length) {
      const gutter = 10;
      const cellW = (W - gutter) / 2;
      const maxH = 190;
      for (let i = 0; i < ids.length; i += 2) {
        const pair = ids.slice(i, i + 2);
        const imgs = await Promise.all(pair.map((id) => loadImage(photos[id].annotated || photos[id].original)));
        const dims = imgs.map((im) => {
          const s = Math.min(cellW / im.width, maxH / im.height);
          return { w: im.width * s, h: im.height * s };
        });
        const rowHt = Math.max(...dims.map((d) => d.h));
        ensure(rowHt + 8);
        pair.forEach((id, j) => {
          const d = dims[j];
          const x = LEFT + j * (cellW + gutter) + (cellW - d.w) / 2;
          doc.addImage(photos[id].annotated || photos[id].original, 'JPEG', x, y, d.w, d.h, undefined, 'FAST');
          doc.setDrawColor(200, 204, 214);
          doc.setLineWidth(0.5);
          doc.rect(x, y, d.w, d.h);
        });
        y += rowHt + 8;
      }
      y += 2;
    }

    if (it.finding) {
      label('FINDING');
      text(it.finding, { gap: 6 });
    }
    if (it.recommendation) {
      label('RECOMMENDED SOLUTION');
      text(it.recommendation, { gap: 6 });
    }
    if (!it.finding && !it.recommendation && it.rawNotes) {
      label('NOTES');
      text(it.rawNotes, { gap: 6 });
    }
    y += 8;
  }

  // ---------- Pricing summary ----------
  const priced = issues.filter((it) => it.price !== '' && it.price != null && !isNaN(Number(it.price)));
  if (priced.length) {
    ensure(40 + priced.length * 16 + 30);
    label('PRICING SUMMARY');
    y += 2;
    doc.setFontSize(10);
    let total = 0;
    priced.forEach((it, i) => {
      const n = issues.indexOf(it) + 1;
      ensure(16);
      if (i % 2 === 0) {
        doc.setFillColor(243, 245, 249);
        doc.rect(LEFT, y, W, 16, 'F');
      }
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...BLACK);
      doc.text(doc.splitTextToSize(`${n}.  ${it.title || it.location || 'Issue'}`, W - 100)[0], LEFT + 6, y + 11);
      doc.text(money(it.price), RIGHT - 6, y + 11, { align: 'right' });
      total += Number(it.price);
      y += 16;
    });
    ensure(24);
    doc.setDrawColor(...NAVY);
    doc.setLineWidth(1);
    doc.line(LEFT, y + 2, RIGHT, y + 2);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(...NAVY);
    doc.text('TOTAL', LEFT + 6, y + 17);
    doc.text(money(total), RIGHT - 6, y + 17, { align: 'right' });
    y += 30;
  }

  // ---------- Closing ----------
  if (report.closing) {
    label('NOTES & TERMS');
    text(report.closing, { size: 9.5, gap: 6 });
  }

  // page numbers
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text(`${title}  ·  Page ${p} of ${pages}`, RIGHT, PAGE_H - 22, { align: 'right' });
  }
  return doc;
}

export function pdfFileName(report) {
  const base = (report.title || report.clientName || report.address || 'Field Report').replace(/[^\w\- ]+/g, '').trim().slice(0, 60);
  return `${base || 'Field Report'} ${report.date || ''}.pdf`.replace(/\s+/g, ' ');
}

function formatDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  if (!y) return d;
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
