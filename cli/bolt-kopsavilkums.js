#!/usr/bin/env node
// Command-line version: the same summary and Excel files as the web page, from files or folders on disk.
//
//   npm run cli -- ./faili                      every CSV and PDF in the folder
//   npm run cli -- aprilis.csv r1.pdf r2.pdf --rate 25 --out ./rezultats
import { readFile, readdir, stat, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Workspace } from "../src/lib/workspace.js";
import { MONTHS, buildMonths, fileName } from "../src/lib/summary.js";
import { buildWorkbook } from "../src/lib/excel.js";

// pdf.js only needs text here; stubs stop it from looking for the optional "canvas" package
globalThis.DOMMatrix ??= class DOMMatrix {};
globalThis.Path2D ??= class Path2D {};
const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.js")).default;

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : def; };
const rate = parseFloat(opt("--rate", "25")) / 100;
const outDir = resolve(opt("--out", "."));

if (!args.length || args.includes("--help")) {
  console.log("Lietošana: npm run cli -- <CSV/PDF faili vai mapes> [--rate 25] [--out mape]");
  process.exit(args.length ? 0 : 1);
}

async function expand(p) {
  const s = await stat(p);
  if (!s.isDirectory()) return [p];
  const names = await readdir(p);
  return (await Promise.all(names.filter(n => /\.(csv|txt|pdf)$/i.test(n)).map(n => expand(join(p, n))))).flat();
}

const files = (await Promise.all(args.map(expand))).flat();
const ws = new Workspace(pdfjs);
for (const f of files) {
  const e = await ws.add(f.split(/[\\/]/).pop(), new Uint8Array(await readFile(f)));
  if (e.cls) console.warn(`! ${e.name}: ${e.note}`);
}
console.log(`Ielādēts: ${ws.invoices.size} rēķini no CSV, ${ws.pdf.size} PDF (${files.length} faili)`);

await mkdir(outDir, { recursive: true });
for (const M of buildMonths(ws.invoices, ws.pdf, rate)) {
  const out = join(outDir, fileName(M));
  await writeFile(out, Buffer.from(await buildWorkbook(M, { rate, review: ws.review })));
  console.log(`${out}  ${MONTHS[M.month - 1]} ${M.year}: ${M.n} rēķini, ${M.weeks.length} nedēļas, kopā ${M.E.toFixed(2)} EUR` +
    (M.gaps.length ? `, trūkst numuru: ${M.gaps.join(", ")}` : ""));
}
if (ws.review.length) console.log(`Jāpārbauda: ${ws.review.length} (skatīt Excel lapu „Pārbaudīt”)`);
