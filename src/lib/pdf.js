// Bolt ride invoice PDF → tips, refunds, Bolt balance and (when there is no CSV) the invoice itself
import { parseDate, r2 } from "./csv.js";

/** Text lines of a PDF, top to bottom. `pdfjs` is the pdf.js module (browser or Node build). */
export async function pdfLines(pdfjs, data) {
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true }).promise;
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    // group text pieces into lines: pieces whose baselines are within 4pt belong together
    const its = tc.items.filter(it => it.str && it.str.trim())
      .map(it => ({ x: it.transform[4], y: it.transform[5], s: it.str.trim() })).sort((a, b) => b.y - a.y);
    const groups = [];
    for (const it of its) {
      const g = groups[groups.length - 1];
      if (g && Math.abs(g.y - it.y) <= 4) g.items.push(it); else groups.push({ y: it.y, items: [it] });
    }
    groups.forEach(g => lines.push(g.items.sort((a, b) => a.x - b.x).map(i => i.s).join("  ")));
  }
  await doc.destroy();
  return lines;
}

const AMT = /-?\d+[.,]\d{2}(?!\d)/g;
const amounts = l => (l.match(AMT) || []).map(s => parseFloat(s.replace(",", ".")));

/** Read one invoice from its text lines. Lines it cannot place go to `unknown` for a person to check. */
export function parseInvoicePdf(lines) {
  const all = lines.join("\n");
  const m = all.match(/\d{5,}-[A-Z]{2}\d+-\d+/);
  if (!m) return { error: lines.length ? "PDF nav atrasts rēķina numurs" : "PDF nav teksta (skenēts?)" };
  const dm = all.match(/Datums:?\s*(\d\d)\.(\d\d)\.(\d{4})/);
  const st = all.match(/S[āa]kums:?\s*(.*?)\s*\((\d\d\.\d\d\.\d{4} \d\d:\d\d)\)/);
  const bi = lines.findIndex(l => /^Pirc[ēe]js/i.test(l));
  const buyer = (bi >= 0 ? (lines[bi].replace(/^Pirc[ēe]js:?/i, "").trim() || lines[bi + 1] || "") : "").split(/\s{2,}/);
  const date = st ? parseDate(st[2]) : dm ? parseDate(`${dm[1]}.${dm[2]}.${dm[3]}`) : null;
  const res = {
    inv: m[0], date, month: date ? date.getUTCFullYear() * 100 + date.getUTCMonth() + 1 : 0,
    addr: st ? st[1].trim() : "", recv: buyer[0] || "", comp: buyer[1] || "",
    firmBuyer: (all.match(/Re[ģg]\.\s*Nr/gi) || []).length > 1, card: false,
    H: 0, I: 0, J: 0, K: 0, L: 0, M: 0, N: 0, unknown: [], seen: []
  };

  const start = lines.findIndex(l => /Nosaukums/i.test(l));
  const end = lines.findIndex((l, i) => i > start && /Kop[āa]\s*\(EUR\)/i.test(l));
  if (start >= 0 && end > start) {
    for (const l of lines.slice(start + 1, end)) {
      const nums = amounts(l);
      const name = l.replace(AMT, "").replace(/\s+/g, " ").trim();
      if (!nums.length || /^(\(EUR\)|Summa|PVN)/i.test(name)) continue;
      const [net, vat, total] = nums.length >= 3 ? nums : nums.length === 2 ? [nums[0], 0, nums[1]] : [nums[0], 0, nums[0]];
      res.seen.push(name);
      if (/brauciena maksa|ride|trip|atcel|cancel/i.test(name) && net >= 0) { res.H += net; res.I += vat; continue; }
      if (/dzeram|tip|чаев/i.test(name)) res.J += total;
      else if (/lidost|airport|neapliek/i.test(name)) res.L += total;
      else if (/atgrie|atmaks|refund|kompens|возврат/i.test(name) || net < 0) { res.M -= Math.abs(net); res.N -= Math.abs(vat); }
      else res.unknown.push(l.trim());
    }
  }
  // Payment lines under the totals: anything paid from the Bolt balance goes to "Bolt konts"
  for (const l of lines.slice(end > 0 ? end : 0)) {
    if (/Kop[āa]|PVN/i.test(l)) continue;
    const a = amounts(l);
    if (!a.length) continue;
    if (/bolt/i.test(l)) res.K -= Math.abs(a[a.length - 1]);
    else if (/ietur|apmaks|samaks|••|\*{2}|karte|card/i.test(l)) res.card = true;
    else res.unknown.push(l.trim());
  }
  for (const k of ["H", "I", "J", "K", "L", "M", "N"]) res[k] = r2(res[k]);
  return res;
}

/** An invoice known only from its PDF (no CSV loaded for it) becomes a row of its own. */
export function pdfRow(p) {
  return {
    inv: p.inv, date: p.date, addr: p.addr, ride: p.date, recv: p.recv, raddr: "", rreg: "", rvat: "",
    pay: p.card ? "Bolt maksājums" : p.firmBuyer ? "Uzņēmums" : "?", comp: p.comp, caddr: "", creg: "", cvat: "",
    net: r2(p.H + p.L), vat: p.I, total: r2(p.H + p.I + p.L), taxable: p.H, nontax: p.L, pdfOnly: true
  };
}
