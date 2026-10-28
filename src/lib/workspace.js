// Collects uploaded files (any number, any order) into one set of invoices
import { decode, looksDamaged, parseCsv } from "./csv.js";
import { parseInvoicePdf, pdfLines } from "./pdf.js";

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
        rows.forEach(r => this.invoices.set(r.inv, r));
        entry.note = `${rows.length} rēķini`;
        if (ansi && looksDamaged(text)) {
          entry.cls = "warn";
          entry.note += ", Excel sabojājis burtus: lejupielādējiet CSV no Bolt vēlreiz";
        }
      }
    } catch (e) {
      entry.cls = "bad";
      entry.note = e.message || String(e);
    }
    this.files.push(entry);
    return entry;
  }
}
