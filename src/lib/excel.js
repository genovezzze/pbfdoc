// One month → Excel workbook in the accountant's template layout
import ExcelJS from "exceljs";
import { VAT } from "./csv.js";
import { MONTHS, dm, reviewFor } from "./summary.js";

const TNR = "Times New Roman";
const thin = { style: "thin" };
const BOX = { top: thin, left: thin, bottom: thin, right: thin };
const FILL = argb => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const MANUAL = FILL("FFFFF2CC");     // J, K, M, N: from PDF or typed in by hand
const ESTIMATE = FILL("FFDDEBF7");   // Q: calculated commission, to compare with EDS
const COL = i => String.fromCharCode(64 + i);
const DATE_FMT = "dd.mm.yyyy hh:mm";

const HEAD = ["Nr.p.k.", "Darījuma datums", "Dokumenta Nr. no sistēmas", "Darījuma vieta", "Darījuma kopsumma", "Maksājuma veids", "Avots",
  "Summa bez PVN", "PVN 21%", "Dzēram-nauda", "Bolt konts", "Neapl. D.", "Atgrieš. Summa bez PVN", "Atgrieš. PVN 21%", "Kopā", "", "Komisiju kopsumma"];
// columns S..V: extra details from the CSV, kept to the right of the template so its layout stays as it was
const EXTRA = ["Brauciena laiks", "Saņēmējs", "Saņēmēja reģ. Nr.", "Saņēmēja PVN Nr."];
const WIDTHS = [7, 17, 24, 38, 12, 15, 9, 10, 9, 9, 9, 9, 10, 10, 10, 2, 11, 2, 17, 30, 14, 16];
const SKIP = new Set([16, 18]);   // spacer columns P and R

function weekSheet(wb, M, w, rate) {
  const ws = wb.addWorksheet(`${w.num}_week`, { views: [{ state: "frozen", xSplit: 2, ySplit: 9 }] });
  WIDTHS.forEach((v, i) => ws.getColumn(i + 1).width = v);
  ws.getCell("A1").value = M.company;
  const sun = w.start + 6 * 864e5;
  [[3, "BOLT darījumu kopsavilkums"], [4, `${M.year}.g.${MONTHS[M.month - 1]}`], [5, `${dm(w.start)}-${dm(sun)}`], [6, `${w.num} week`]]
    .forEach(([r, t]) => { ws.mergeCells(r, 1, r, 17); const c = ws.getCell(r, 1); c.value = t; c.alignment = { horizontal: "center" }; });
  for (let r = 1; r <= 6; r++) ws.getCell(r, 1).font = { name: TNR, bold: true, size: 11 };
  if (w.from !== w.start || w.to !== sun) {
    ws.getCell("A7").value = `Šajā failā dati par ${dm(w.from)}-${dm(w.to)} (pārējās dienas ir cita mēneša CSV)`;
    ws.getCell("A7").font = { name: TNR, italic: true, size: 9 };
  }

  ws.mergeCells("A8:A9"); ws.mergeCells("B8:B9"); ws.mergeCells("C8:O8"); ws.mergeCells("S8:V8");
  ws.getCell("A8").value = HEAD[0]; ws.getCell("B8").value = HEAD[1];
  ws.getCell("C8").value = "Informācija BOLT rēķinus"; ws.getCell("S8").value = "Papildu informācija";
  HEAD.slice(2).forEach((h, i) => ws.getCell(9, i + 3).value = h);
  EXTRA.forEach((h, i) => ws.getCell(9, 19 + i).value = h);
  for (const r of [8, 9]) for (let c = 1; c <= 22; c++) {
    if (SKIP.has(c)) continue;
    const cell = ws.getCell(r, c);
    cell.font = { name: TNR, size: 10, bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = BOX;
  }
  ws.getRow(9).height = 45;

  const first = 10;
  w.rows.forEach((x, n) => {
    const r = first + n;
    const v = [n + 1, x.date, x.inv, x.addr, x.total, x.pay, x.srcLabel, x.taxable, x.vat,
      x.J || null, x.K || null, x.L || null, x.M || null, x.N || null,
      { formula: `H${r}+I${r}+J${r}+K${r}+L${r}+M${r}+N${r}`, result: x.O }, null,
      { formula: `ROUND((H${r}+I${r}-M${r}-N${r})*${rate}*(1+${VAT}),2)`, result: x.Q }, null,
      x.ride, x.recv || null, x.rreg || null, x.rvat || null];
    v.forEach((val, i) => {
      const c = i + 1;
      if (SKIP.has(c)) return;
      const cell = ws.getCell(r, c);
      cell.value = val; cell.border = BOX; cell.font = { name: TNR, size: 10 };
      if (c === 2 || c === 19) cell.numFmt = DATE_FMT; else if (c === 5 || (c >= 8 && c <= 17)) cell.numFmt = "0.00";
      if ([10, 11, 13, 14].includes(c)) cell.fill = MANUAL;
      if (c === 17) cell.fill = ESTIMATE;
    });
  });

  const last = first + w.rows.length - 1, tot = last + 1;
  ws.getCell(tot, 4).value = "KOPĀ";
  ws.getCell(tot, 4).font = { name: TNR, bold: true, size: 10 };
  const key = { 5: "E", 8: "H", 9: "I", 10: "J", 11: "K", 12: "L", 13: "M", 14: "N", 15: "O", 17: "Q" };
  for (const c of Object.keys(key).map(Number)) {
    const cell = ws.getCell(tot, c);
    cell.value = { formula: `SUM(${COL(c)}${first}:${COL(c)}${last})`, result: w[key[c]] };
    cell.font = { name: TNR, bold: true, size: 10 }; cell.numFmt = "0.00"; cell.border = BOX;
  }
  return { sheet: ws.name, tot };
}

function summarySheet(s, M, refs, ratePct) {
  s.getCell("A1").value = M.company;
  s.getCell("A2").value = `BOLT darījumu kopsavilkums ${M.year}.g.${MONTHS[M.month - 1]}`;
  ["A1", "A2"].forEach(a => s.getCell(a).font = { name: TNR, bold: true, size: 12 });
  const head = ["Nedēļa", "Periods", "Rēķini", "t.sk. Bolt maks.", "t.sk. Uzņēmums", "Darījuma kopsumma", "Summa bez PVN", "PVN 21%",
    "Dzēram-nauda", "Bolt konts", "Neapl. D.", "Atgrieš. bez PVN", "Atgrieš. PVN", "Kopā", "Komisija"];
  const src = ["E", "H", "I", "J", "K", "L", "M", "N", "O", "Q"];
  head.forEach((h, i) => {
    const c = s.getCell(4, i + 1);
    c.value = h; c.font = { name: TNR, bold: true, size: 10 }; c.border = BOX;
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  s.getRow(4).height = 30;
  M.weeks.forEach((w, i) => {
    const vals = [`${w.num} week`, `${dm(w.from)}-${dm(w.to)}`, w.n, w.bolt, w.firm,
      ...src.map(k => ({ formula: `'${refs[i].sheet}'!${k}${refs[i].tot}`, result: w[k] }))];
    vals.forEach((v, j) => {
      const c = s.getCell(5 + i, j + 1);
      c.value = v; c.border = BOX; c.font = { name: TNR, size: 10 };
      if (j >= 5) c.numFmt = "0.00";
    });
  });
  const t = 5 + M.weeks.length;
  const monthKeys = ["n", "bolt", "firm", ...src];
  s.getCell(t, 1).value = "KOPĀ MĒNESĪ";
  for (let c = 3; c <= 15; c++) s.getCell(t, c).value = { formula: `SUM(${COL(c)}5:${COL(c)}${t - 1})`, result: M[monthKeys[c - 3]] };
  for (let c = 1; c <= 15; c++) {
    const x = s.getCell(t, c);
    x.font = { name: TNR, bold: true, size: 10 }; x.border = BOX;
    if (c >= 6) x.numFmt = "0.00";
  }

  s.getCell(t + 2, 1).value = "Pārbaude pret CSV:";
  s.getCell(t + 2, 1).font = { name: TNR, bold: true };
  [["Rēķinu skaits", M.n], ["Cena kopā", M.E], ["Cena bez PVN (= Summa bez PVN + Neapl. D.)", M.net], ["PVN", M.I]]
    .forEach(([k, v], i) => {
      s.getCell(t + 3 + i, 1).value = k;
      const c = s.getCell(t + 3 + i, 6); c.value = v; c.numFmt = "0.00";
    });
  s.getCell(t + 8, 1).value = `Komisija aprēķināta ${ratePct}% + PVN 21%, jāsalīdzina ar EDS. ` +
    `Dzeltenās kolonnas aizpildītas no PDF (${M.pdf} rēķini), pārējās jāieraksta ar roku.`;
  s.getCell(t + 8, 1).font = { name: TNR, italic: true, size: 9 };
  [14, 13, 8, 10, 10, 12, 12, 10, 10, 10, 10, 11, 11, 10, 10].forEach((v, i) => s.getColumn(i + 1).width = v);
}

// Every invoice with every field Bolt gives, in one flat list (easy to filter and search)
function allSheet(wb, M) {
  const a = wb.addWorksheet("Visi rēķini", { views: [{ state: "frozen", ySplit: 1 }] });
  const cols = [["Nedēļa", 9], ["Rēķina numurs", 22], ["Datums", 16, DATE_FMT], ["Pasūtījuma adrese", 38], ["Maksājuma veids", 15],
    ["Brauciena laiks", 16, DATE_FMT], ["Saņēmējs", 28], ["Saņēmēja adrese", 30], ["Saņēmēja reģ. Nr.", 14], ["Saņēmēja PVN Nr.", 16],
    ["Uzņēmums (vadītājs)", 22], ["Uzņēmuma adrese", 30], ["Uzņēmuma reģ. Nr.", 14], ["Uzņēmuma PVN Nr.", 16],
    ["Cena (bez PVN)", 11, "0.00"], ["PVN", 9, "0.00"], ["Cena kopā", 10, "0.00"], ["t.sk. apliekamā summa", 11, "0.00"], ["Neapl. D.", 9, "0.00"],
    ["Dzēram-nauda", 9, "0.00"], ["Bolt konts", 9, "0.00"], ["Atgrieš. bez PVN", 10, "0.00"], ["Atgrieš. PVN", 10, "0.00"], ["Komisija", 10, "0.00"], ["Avots", 9]];
  a.columns = cols.map(([header, width, numFmt]) => ({ header, width, style: numFmt ? { numFmt } : {} }));
  a.getRow(1).font = { name: TNR, bold: true, size: 10 };
  a.getRow(1).alignment = { wrapText: true, vertical: "middle" };
  for (const w of M.weeks) for (const x of w.rows)
    a.addRow([`${w.num} week`, x.inv, x.date, x.addr, x.pay, x.ride, x.recv, x.raddr, x.rreg, x.rvat, x.comp, x.caddr, x.creg, x.cvat,
      x.net, x.vat, x.total, x.taxable, x.L || null, x.J || null, x.K || null, x.M || null, x.N || null, x.Q, x.srcLabel]);
  a.autoFilter = { from: "A1", to: { row: 1, column: cols.length } };
}

/** @returns ArrayBuffer/Buffer of the .xlsx file */
export async function buildWorkbook(M, { rate, review = [] }) {
  const wb = new ExcelJS.Workbook();
  wb.calcProperties.fullCalcOnLoad = true;
  const summary = wb.addWorksheet("Kopsavilkums");
  const refs = M.weeks.map(w => weekSheet(wb, M, w, rate));
  summarySheet(summary, M, refs, Math.round(rate * 1000) / 10);
  allSheet(wb, M);
  const rev = reviewFor(M, review);
  if (rev.length) {
    const p = wb.addWorksheet("Pārbaudīt");
    p.columns = [{ header: "Rēķins", width: 24 }, { header: "Avots", width: 30 }, { header: "Kas jāpārbauda", width: 46 }, { header: "Teksts", width: 70 }];
    p.getRow(1).font = { name: TNR, bold: true };
    rev.forEach(x => p.addRow([x.inv, x.src, x.why, x.text || ""]));
  }
  return wb.xlsx.writeBuffer();
}
