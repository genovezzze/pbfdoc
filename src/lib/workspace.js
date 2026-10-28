// Collects uploaded files (any number, any order) into one set of invoices
import { decode, looksDamaged, parseCsv } from "./csv.js";
import { parseInvoicePdf, pdfLines } from "./pdf.js";
import { buildVocab, repairText, TEXT_FIELDS } from "./repair.js";

const fmt = x => x.toFixed(2).replace(".", ",");
const isPdf = (name, bytes) => /\.pdf$/i.test(name) || (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46);

export class Workspace {
  constructor(pdfjs) {
    this.pdfjs = pdfjs;
    this.invoices = new Map();   // inv → CSV row (a later CSV with the same invoice replaces the earlier one)
    this.pdf = new Map();        // inv → parsed PDF
    this.review = [];            // things a person should look at
    this.files = [];             // { name, note, cls: "" | "warn" | "bad" }
  }

  clear() {
    this.invoices.clear(); this.pdf.clear();
    this.review = []; this.files = [];
  }

  /** @param bytes Uint8Array of the file */
  async add(name, bytes) {
    const entry = { name, note: "", cls: "" };
    try {
      if (isPdf(name, bytes)) {
        if (!this.pdfjs) throw new Error("PDF lasītājs nav pieejams");
        const res = parseInvoicePdf(await pdfLines(this.pdfjs, bytes.slice()));
        if (res.error) throw new Error(res.error);
        res.src = name;
        this.pdf.set(res.inv, res);
        res.unknown.forEach(t => this.review.push({ inv: res.inv, src: name, why: "Neatpazīta rinda PDF, nav iekļauta", text: t }));
        if (!res.date) this.review.push({ inv: res.inv, src: name, why: "PDF nav atrasts datums, rēķins nav iekļauts nedēļās" });
        entry.note = [res.J && "dzeramn. " + fmt(res.J), res.K && "Bolt konts " + fmt(res.K), (res.M || res.N) && "atgr. " + fmt(res.M + res.N)]
          .filter(Boolean).join(", ") || "parasts brauciens";
      } else {
        const { text, ansi } = decode(bytes);
        const rows = parseCsv(text, name, this.review);
        const damaged = ansi && looksDamaged(text);
        for (const r of rows) {
          if (damaged) { r.raw = Object.fromEntries(TEXT_FIELDS.map(k => [k, r[k]])); r.srcFile = name; }
          this.invoices.set(r.inv, r);
        }
        entry.rows = rows.length;
        entry.damaged = damaged;
        entry.note = `${rows.length} rēķini`;
      }
    } catch (e) {
      entry.cls = "bad";
      entry.note = e.message || String(e);
    }
    this.files.push(entry);
    this.repair();
    return entry;
  }

  // Rebuild lost Latvian letters in damaged CSV rows; rerun after every file, since each clean file adds known words
  repair() {
    const rows = [...this.invoices.values()];
    const vocab = buildVocab([
      ...rows.filter(r => !r.raw).flatMap(r => TEXT_FIELDS.map(k => r[k])),
      ...[...this.pdf.values()].flatMap(p => [p.addr, p.recv, p.comp])
    ]);
    const stats = new Map();
    for (const r of rows) {
      if (!r.raw) continue;
      const s = stats.get(r.srcFile) || { fixed: 0, left: 0 };
      for (const k of TEXT_FIELDS) {
        const res = repairText(r.raw[k], vocab);
        r[k] = res.text; s.fixed += res.fixed; s.left += res.left;
      }
      stats.set(r.srcFile, s);
    }
    for (const f of this.files) {
      if (!f.damaged) continue;
      const s = stats.get(f.name) || { fixed: 0, left: 0 };
      f.cls = s.left ? "warn" : "";
      f.note = `${f.rows} rēķini, Excel bija sabojājis burtus: atjaunoti ${s.fixed} vārdi` +
        (s.left ? `, ${s.left} nav atjaunoti (labāk lejupielādējiet CSV no Bolt vēlreiz)` : "");
    }
  }
}
