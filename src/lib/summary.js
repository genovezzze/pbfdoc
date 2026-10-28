// Invoices → months → Monday–Sunday weeks, with the template's column totals
import { VAT, r2 } from "./csv.js";
import { pdfRow } from "./pdf.js";

export const MONTHS = ["janvāris", "februāris", "marts", "aprīlis", "maijs", "jūnijs", "jūlijs",
  "augusts", "septembris", "oktobris", "novembris", "decembris"];

const DAY = 864e5;
export const weekStart = d => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - (d.getUTCDay() + 6) % 7);
export function isoWeekNum(ms) {
  const d = new Date(ms);
  d.setUTCDate(d.getUTCDate() + 3);
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d - jan4) / DAY - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
}
/** 1735689600000 → "01.01." */
export const dm = ms => { const d = new Date(ms); return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.`; };

/**
 * Template columns per invoice: H bez PVN, I PVN, J dzeramnauda, K Bolt konts, L neapliekamā daļa,
 * M/N atgriešana, O kopā, Q komisija (rate% + VAT of the taxable ride price).
 */
export function enrich(row, pdf, rate) {
  const p = pdf.get(row.inv) || {};
  const x = { ...row, J: p.J || 0, K: p.K || 0, L: row.nontax || p.L || 0, M: p.M || 0, N: p.N || 0, fromPdf: pdf.has(row.inv) };
  x.srcLabel = row.pdfOnly ? "PDF" : x.fromPdf ? "CSV+PDF" : "CSV";
  x.O = r2(x.taxable + x.vat + x.J + x.K + x.L + x.M + x.N);
  x.Q = r2((x.taxable + x.vat - x.M - x.N) * rate * (1 + VAT));
  return x;
}

const MONEY = ["E", "H", "I", "J", "K", "L", "M", "N", "O", "Q", "net"];
export function sums(rs) {
  const s = { n: rs.length, pdf: 0, pdfOnly: 0, bolt: 0, firm: 0 };
  MONEY.forEach(k => s[k] = 0);
  for (const r of rs) {
    s.E += r.total; s.H += r.taxable; s.I += r.vat; s.J += r.J; s.K += r.K; s.L += r.L;
    s.M += r.M; s.N += r.N; s.O += r.O; s.Q += r.Q; s.net += r.net;
    if (r.fromPdf) s.pdf++;
    if (r.pdfOnly) s.pdfOnly++;
    if (r.pay === "Uzņēmums") s.firm++; else s.bolt++;
  }
  MONEY.forEach(k => s[k] = r2(s[k]));
  return s;
}

/** Numbers missing from the invoice sequence, e.g. ["1003", "1010–1012"]. */
function gapsOf(rows) {
  const nums = rows.map(r => +r.inv.split("-").pop()).filter(Number.isFinite).sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < nums.length; i++)
    if (nums[i] - nums[i - 1] > 1) gaps.push(nums[i] - nums[i - 1] === 2 ? `${nums[i - 1] + 1}` : `${nums[i - 1] + 1}–${nums[i] - 1}`);
  return gaps;
}

/**
 * @param invoices Map inv → CSV row; @param pdf Map inv → parsed PDF; @param rate commission share, e.g. 0.25
 * @returns months sorted by date, each with weeks sorted Monday first and rows newest first (as in the template)
 */
export function buildMonths(invoices, pdf, rate) {
  const all = new Map(invoices);
  for (const p of pdf.values()) if (!all.has(p.inv) && p.date) all.set(p.inv, pdfRow(p));
  const byMonth = new Map();
  for (const r of all.values()) {
    const k = r.date.getUTCFullYear() * 100 + r.date.getUTCMonth() + 1;
    if (!byMonth.has(k)) byMonth.set(k, []);
    byMonth.get(k).push(enrich(r, pdf, rate));
  }
  return [...byMonth.entries()].sort((a, b) => a[0] - b[0]).map(([k, rows]) => {
    rows.sort((a, b) => b.date - a.date || b.inv.localeCompare(a.inv, undefined, { numeric: true }));
    const wk = new Map();
    for (const r of rows) { const s = weekStart(r.date); if (!wk.has(s)) wk.set(s, []); wk.get(s).push(r); }
    const weeks = [...wk.entries()].sort((a, b) => a[0] - b[0]).map(([start, rs]) => {
      const days = rs.map(r => Date.UTC(r.date.getUTCFullYear(), r.date.getUTCMonth(), r.date.getUTCDate()));
      return { start, num: isoWeekNum(start), rows: rs, from: Math.min(...days), to: Math.max(...days), ...sums(rs) };
    });
    const company = (rows.find(r => r.comp) || {}).comp || "";
    return { year: Math.floor(k / 100), month: k % 100, rows, weeks, gaps: gapsOf(rows), company, ...sums(rows) };
  });
}

/** Review items that belong to one month, plus its numbering gaps. */
export function reviewFor(M, review) {
  const invs = new Set(M.rows.map(r => r.inv));
  const out = review.filter(x => invs.has(x.inv));
  if (M.gaps.length) out.push({ inv: "—", src: "CSV/PDF", why: "Trūkst rēķinu numuru secībā", text: M.gaps.join(", ") });
  return out;
}

/** "BOLT_kopsavilkums_2026_04_aprilis.xlsx" (plain letters save reliably everywhere). */
export function fileName(M) {
  const ascii = MONTHS[M.month - 1].normalize("NFD").replace(/[̀-ͯ]/g, "");
  return `BOLT_kopsavilkums_${M.year}_${String(M.month).padStart(2, "0")}_${ascii}.xlsx`;
}
