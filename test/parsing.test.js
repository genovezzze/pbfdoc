// Parsing and summary checks on invented data shaped like Bolt's real exports
import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { parseCsv, decode } from "../src/lib/csv.js";
import { parseInvoicePdf } from "../src/lib/pdf.js";
import { buildMonths } from "../src/lib/summary.js";
import { buildWorkbook } from "../src/lib/excel.js";

const HEAD = '"Rēķina numurs","Datums","Pasūtījuma adrese","Maksājuma veids","Brauciena norises laiks","Saņēmējs","Saņēmēja adrese","Saņēmēja reģistrācijas numurs","Saņēmēja PVN numurs","Uzņēmuma nosaukums (vadītāja)","Uzņēmuma adrese (Iela, Numurs, Pasta kods, Valsts)","Uzņēmuma reģistrācijas numurs","Uzņēmuma NIM / PVN maksātāja numurs","Cena (bez PVN)","PVN","Cena kopā"';
const row = (n, date, addr, pay, net, vat, total) =>
  `"X-LV1-${n}","${date}","${addr}","${pay}","${date}","Klients","","","","Paraugs SIA","Rīga","1","LV1","${net}","${vat}","${total}"`;

const csv = [HEAD,
  row(5, "03.08.2026 10:00", "Brīvības iela 1, Rīga", "Bolt maksājums", "6.61", "1.39", "8"),
  row(4, "02.08.2026 12:00", 'Club "Studio 69" entrance, Club "Studio 69"', "Bolt maksājums", "4.88", "1.02", "5.9"),
  row(3, "01.08.2026 09:00", "Arrivals, Riga Airport (RIX)", "Uzņēmums", "10.18", "1.72", "11.9")
].join("\n");

test("UTF-8 CSV with unescaped inner quotes and an airport fee", () => {
  const rows = parseCsv(decode(new TextEncoder().encode(csv)).text);
  assert.equal(rows.length, 3);
  assert.equal(rows[1].addr, 'Club "Studio 69" entrance, Club "Studio 69"');
  const airport = rows[2];
  assert.equal(airport.taxable, 8.19);     // 1.72 VAT / 21 %
  assert.equal(airport.nontax, 1.99);      // the rest has no VAT
  assert.equal(rows[0].nontax, 0);
});

test("Excel-resaved TSV whose address was split in two", () => {
  const tsv = ["Rēķina numurs\tDatums\tAdrese\tVeids\tLaiks\tSaņēmējs\ta\tb\tc\tUzņ\tadr\treg\tpvn\tneto\tpvn\tkopā",
    'X-LV1-7\t18.04.2026 19:46\t"A"" Entrance"\t" Shopping Centre Domina"""\tBolt maksājums\t18.04.2026 17:38\tH H\t\t\tParaugs SIA\t"Rīga"\t1\tLV1\t3.31\t0.69\t4'].join("\r\n");
  const [r] = parseCsv(tsv);
  assert.equal(r.addr, 'A" Entrance, Shopping Centre Domina');
  assert.equal(r.pay, "Bolt maksājums");
  assert.equal(r.total, 4);
});

test("months split into Monday–Sunday weeks; totals add up", () => {
  const rows = parseCsv(csv);
  const [M] = buildMonths(new Map(rows.map(r => [r.inv, r])), new Map(), 0.25);
  assert.deepEqual(M.weeks.map(w => w.num), [31, 32]);   // 1–2 Aug is ISO week 31, 3 Aug starts week 32
  assert.equal(M.E, 25.8);
  assert.equal(Math.round((M.H + M.L) * 100) / 100, M.net);
  assert.deepEqual(M.gaps, []);
});

const pdfText = n => [
  `Rēķins Nr. 1234567-LV1-${n}`, "Datums: 07.06.2026", "Pircējs:", "Klients A  Paraugs SIA", "Rīga, Iela 1", "Reģ. Nr.: 1",
  "Sākums: St. Peter's Church, Old Town Riga (07.06.2026 12:20)",
  "Summa  Kopējā summa", "Nosaukums  PVN 21%", "(EUR)  (EUR)",
  "Brauciena maksa  12.31  2.59  14.90",
  "Kopā (EUR):  12.31", "PVN 21%:  2.59", "Kopā, ieskaitot PVN (EUR):  14.90", "Ieturēts  •••• 8586:  14.90"];

test("ride invoice PDF without a CSV becomes a row of its own", () => {
  const p = parseInvoicePdf(pdfText(9));
  assert.equal(p.inv, "1234567-LV1-9");
  assert.equal(p.addr, "St. Peter's Church, Old Town Riga");
  assert.deepEqual([p.H, p.I, p.J, p.K], [12.31, 2.59, 0, 0]);
  assert.equal(p.card, true);
  assert.deepEqual(p.unknown, []);
  const [M] = buildMonths(new Map(), new Map([[p.inv, p]]), 0.25);
  assert.equal(M.n, 1);
  assert.equal(M.rows[0].srcLabel, "PDF");
  assert.equal(M.rows[0].pay, "Bolt maksājums");
  assert.equal(M.Q, 4.51);
});

test("workbook has the summary, one sheet per week and the full list", async () => {
  const rows = parseCsv(csv);
  const [M] = buildMonths(new Map(rows.map(r => [r.inv, r])), new Map(), 0.25);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await buildWorkbook(M, { rate: 0.25 }));
  assert.deepEqual(wb.worksheets.map(s => s.name), ["Kopsavilkums", "31_week", "32_week", "Visi rēķini"]);
  const w = wb.getWorksheet("31_week");
  assert.equal(w.getCell("C9").value, "Dokumenta Nr. no sistēmas");
  assert.equal(w.getCell("C10").value, "X-LV1-4");
  assert.equal(w.getCell("L11").value, 1.99);
  assert.equal(wb.getWorksheet("Visi rēķini").rowCount, 4);
});
