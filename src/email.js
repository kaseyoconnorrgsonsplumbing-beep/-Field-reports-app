import { money, orderedIssues, priorityInfo } from './imageUtils';

export const DEFAULT_CC = 'chandra@rgsonsplumbing.com';
export const OFFICE_PHONE = '520-510-0315';

const firstName = (name) => (name || '').trim().split(/\s+/)[0] || '';

const hasPrice = (it) => it.price !== '' && it.price != null && !isNaN(Number(it.price));

/** Subject line: "Plumbing Inspection Report – 123 Main St – 3 items, 1 urgent" */
export function emailSubject(report) {
  const issues = orderedIssues(report);
  const urgent = issues.filter((i) => i.priority === 'urgent').length;
  const where = report.address || report.clientName || '';
  const base = report.title && !/report/i.test(where) ? report.title : `Plumbing Inspection Report${where ? ' – ' + where : ''}`;
  const counts = issues.length ? ` – ${issues.length} item${issues.length === 1 ? '' : 's'}${urgent ? `, ${urgent} urgent` : ''}` : '';
  return base + counts;
}

/** Plain-text body (mail links can't carry HTML). No signature — the mail app adds it. */
export function emailBody(report) {
  const issues = orderedIssues(report);
  const name = firstName(report.contactName);
  const lines = [];
  lines.push(`Hi${name ? ' ' + name : ''},`, '');
  lines.push(
    'Thanks for having us out. The full report is attached as a PDF — photos, findings, and pricing are all in there, and every issue is on its own page so it\'s easy to flip through.',
    '',
  );
  if (report.summary) lines.push('The short version: ' + report.summary.trim(), '');
  if (issues.length) {
    issues.forEach((it, n) => {
      const pr = priorityInfo(it.priority);
      const tag = pr ? ` (${pr.short})` : '';
      const price = hasPrice(it) ? ` — ${money(it.price)}` : '';
      lines.push(`${n + 1}. ${it.title || it.location || 'Issue'}${tag}${price}`);
    });
    const priced = issues.filter(hasPrice);
    if (priced.length) {
      const total = priced.reduce((s, it) => s + Number(it.price), 0);
      lines.push(`Total if we do everything: ${money(total)}`);
    }
    lines.push('');
  }
  lines.push(
    'You don\'t have to do it all at once — pick the items you want handled and we\'ll schedule around you. Pricing is good for 30 days and includes labor and standard materials; if we run into anything unexpected once we open things up, we\'ll stop and go over it with you before doing more work.',
    '',
    `Just reply here or call/text me at ${OFFICE_PHONE} and we'll get you on the schedule.`,
    '',
    'Thanks,',
  );
  return lines.join('\n');
}

/** mailto: link with To / CC / subject / body prefilled. */
export function mailtoLink(report, { to, cc }) {
  const q = new URLSearchParams();
  if (cc) q.set('cc', cc);
  q.set('subject', emailSubject(report));
  q.set('body', emailBody(report));
  // URLSearchParams encodes spaces as "+", which mail clients show literally — use %20
  return `mailto:${encodeURIComponent(to || '')}?${q.toString().replace(/\+/g, '%20')}`;
}
