// Web page: drop files → weekly summary on screen → Excel download
import "./style.css";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.js?url";
import { r2 } from "./lib/csv.js";
import { MONTHS, buildMonths, dm, fileName } from "./lib/summary.js";
import { buildWorkbook } from "./lib/excel.js";
import { Workspace } from "./lib/workspace.js";
import { sampleCsv } from "./sample.js";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = x => (x || 0).toLocaleString("lv-LV", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rate = () => (parseFloat($("rate").value) || 0) / 100;

const ws = new Workspace(pdfjs);
let sample = true;
let months = [];
const selected = new Map();   // year*100+month → chosen week index, -1 = whole month

function render() {
  months = buildMonths(ws.invoices, ws.pdf, rate());

  // with many files, list only the ones that need attention and count the rest
  const chip = f => `<span class="chip ${f.cls}" title="${esc(f.note)}">${esc(f.name)}${f.note ? " · " + esc(f.note) : ""}</span>`;
  const flagged = ws.files.filter(f => f.cls), fine = ws.files.filter(f => !f.cls);
  $("files").innerHTML = ws.files.length <= 8 ? ws.files.map(chip).join("")
    : flagged.map(chip).join("") + `<span class="chip">${fine.length} faili bez kļūdām</span>`;

  $("months").innerHTML = months.map(monthCard).join("") || `<p class="muted">Vēl nav ielādēts neviens fails.</p>`;
  document.querySelectorAll("[data-dl]").forEach(b => b.onclick = () => download(months[+b.dataset.dl], b));
  document.querySelectorAll("[data-seg]").forEach(b => b.onclick = () => {
    const [mi, wi] = b.dataset.seg.split(":").map(Number);
    selected.set(months[mi].year * 100 + months[mi].month, wi);
    render();
  });

  const items = ws.review.concat(months.flatMap(M => M.gaps.length
    ? [{ inv: "—", src: `${MONTHS[M.month - 1]} ${M.year}`, why: "Trūkst rēķinu numuru secībā (trūkst CSV rindas vai PDF)", text: M.gaps.join(", ") }] : []));
  $("review").innerHTML = items.length ? `<section class="review"><h2>Jāpārbauda (${items.length})</h2><ul>${items.slice(0, 60).map(x =>
    `<li><code>${esc(x.inv)}</code> ${esc(x.why)}${x.text ? `: <code>${esc(x.text)}</code>` : ""} <span class="muted">(${esc(x.src)})</span></li>`).join("")}</ul>
    ${items.length > 60 ? `<p class="muted">… un vēl ${items.length - 60}. Pilns saraksts ir Excel lapā „Pārbaudīt”.</p>` : ""}</section>` : "";
}

const cell = (v, cls = "") => `<td class="${cls}${v ? "" : " zero"}">${fmt(v)}</td>`;
const dash = (v, cls = "") => `<td class="${cls}${v ? "" : " zero"}">${v ? fmt(v) : "–"}</td>`;
const dt = d => d ? `${dm(d.getTime())}${d.getUTCFullYear()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}` : "";

function monthCard(M, mi) {
  const csvOk = Math.abs(r2(M.H + M.L) - M.net) < 0.011;
  const checks = [
    M.pdfOnly === M.n ? `<span class="pill warn">Nav CSV par šo mēnesi, dati tikai no PDF</span>`
      : csvOk ? `<span class="pill ok">Summa bez PVN + Neapl. D. sakrīt ar CSV</span>`
      : `<span class="pill bad">Nesakrīt ar CSV: ${fmt(M.H + M.L)} pret ${fmt(M.net)}</span>`,
    M.gaps.length ? `<span class="pill warn">Trūkst numuru: ${esc(M.gaps.slice(0, 5).join(", "))}${M.gaps.length > 5 ? "…" : ""}</span>`
      : `<span class="pill ok">Numuri pēc kārtas, bez izlaidumiem</span>`,
    `<span class="pill ${M.pdf ? "ok" : "warn"}">PDF pievienoti: ${M.pdf} no ${M.n}</span>`,
    M.pdfOnly && M.pdfOnly < M.n ? `<span class="pill warn">${M.pdfOnly} rēķini tikai no PDF, bez CSV</span>` : ""
  ].join("");
  const weekRows = M.weeks.map(w => `<tr><td>${w.num}. ned.</td><td>${dm(w.from)}–${dm(w.to)}</td><td>${w.n}</td>${cell(w.E)}${cell(w.H)}${cell(w.I)}` +
    `${cell(w.J, "manual")}${cell(w.K, "manual")}${cell(w.L)}${cell(w.M + w.N, "manual")}${cell(w.O)}${cell(w.Q, "estimate")}</tr>`).join("");
  // the invoice list in the template's own columns, one week at a time (tabs) or the whole month
  let sel = selected.get(M.year * 100 + M.month) ?? 0;
  if (sel >= M.weeks.length) sel = 0;
  const shown = sel === -1 ? M.rows : M.weeks[sel].rows;
  const shownSum = sel === -1 ? M : M.weeks[sel];
  const tabs = `<div class="seg" role="tablist">${M.weeks.map((w, wi) =>
    `<button type="button" role="tab" aria-selected="${wi === sel}" data-seg="${mi}:${wi}">${w.num}. ned. <span>${dm(w.from)}–${dm(w.to)}</span></button>`).join("")}` +
    `<button type="button" role="tab" aria-selected="${sel === -1}" data-seg="${mi}:-1">Viss mēnesis</button></div>`;
  const invoices = `<div class="tbl invoices"><table>
    <thead><tr><th>Nr.p.k.</th><th class="tx">Darījuma datums</th><th class="tx">Dokumenta Nr. no sistēmas</th><th class="tx">Darījuma vieta</th><th>Darījuma kopsumma</th>
    <th class="tx">Maksājuma veids</th><th class="tx">Avots</th><th>Summa bez PVN</th><th>PVN 21%</th><th>Dzēram-nauda</th><th>Bolt konts</th><th>Neapl. D.</th>
    <th>Atgrieš. bez PVN</th><th>Atgrieš. PVN 21%</th><th>Kopā</th><th>Komisiju kopsumma</th></tr></thead>
    <tbody>${shown.map((x, i) => `<tr><td>${i + 1}</td><td class="tx">${dt(x.date)}</td><td class="tx doc">${esc(x.inv)}</td><td class="tx addr">${esc(x.addr)}</td>` +
      `${dash(x.total)}<td class="tx">${esc(x.pay)}</td><td class="tx">${x.srcLabel}</td>${dash(x.taxable)}${dash(x.vat)}${dash(x.J, "manual")}${dash(x.K, "manual")}` +
      `${dash(x.L)}${dash(x.M, "manual")}${dash(x.N, "manual")}${dash(x.O)}${dash(x.Q, "estimate")}</tr>`).join("")}</tbody>
    <tfoot><tr><td>Kopā</td><td></td><td class="tx">${shown.length} rēķini</td><td></td>${cell(shownSum.E)}<td></td><td></td>${cell(shownSum.H)}${cell(shownSum.I)}` +
      `${cell(shownSum.J)}${cell(shownSum.K)}${cell(shownSum.L)}${cell(shownSum.M)}${cell(shownSum.N)}${cell(shownSum.O)}${cell(shownSum.Q)}</tr></tfoot>
  </table></div>`;
  return `<section class="month">
    <div class="month-head">
      <div class="left"><div class="eyebrow">${esc(M.company)}</div>
        <h2>${M.year}. g. ${MONTHS[M.month - 1]}${sample ? '<span class="tag">Paraugs</span>' : ""}</h2></div>
      <button class="btn" type="button" data-dl="${mi}">Lejupielādēt Excel</button>
    </div>
    <div class="figs">
      <div class="fig"><span>Rēķini</span><b>${M.n}</b></div>
      <div class="fig"><span>Kopsumma, EUR</span><b>${fmt(M.E)}</b></div>
      <div class="fig"><span>Bez PVN</span><b>${fmt(M.H)}</b></div>
      <div class="fig"><span>PVN 21%</span><b>${fmt(M.I)}</b></div>
      <div class="fig"><span>Neapl. D.</span><b>${fmt(M.L)}</b></div>
      <div class="fig"><span>Komisija</span><b>${fmt(M.Q)}</b></div>
    </div>
    <div class="checks">${checks}</div>
    <div class="tbl"><table>
      <thead><tr><th>Nedēļa</th><th>Dienas</th><th>Rēķini</th><th>Kopsumma</th><th>Bez PVN</th><th>PVN</th><th>Dzeramn.</th><th>Bolt konts</th><th>Neapl. D.</th><th>Atgriešana</th><th>Kopā</th><th>Komisija</th></tr></thead>
      <tbody>${weekRows}</tbody>
      <tfoot><tr><td>Mēnesī</td><td></td><td>${M.n}</td>${cell(M.E)}${cell(M.H)}${cell(M.I)}${cell(M.J)}${cell(M.K)}${cell(M.L)}${cell(M.M + M.N)}${cell(M.O)}${cell(M.Q)}</tr></tfoot>
    </table></div>
    <h3>Rēķini</h3>
    ${tabs}
    ${invoices}
    <div class="status" id="dlst${mi}"></div>
  </section>`;
}

async function download(M, btn) {
  const st = $("dlst" + btn.dataset.dl);
  st.className = "status"; st.textContent = "Gatavo failu…"; btn.disabled = true;
  try {
    const buf = await buildWorkbook(M, { rate: rate(), review: ws.review });
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName(M);
    document.body.appendChild(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href); }, 10000);
    st.className = "status ok"; st.textContent = `Saglabāts: ${a.download}`;
  } catch (e) {
    st.className = "status bad"; st.textContent = "Neizdevās izveidot failu: " + (e?.message || e);
  } finally { btn.disabled = false; }
}

async function addFiles(list) {
  if (sample) { ws.clear(); sample = false; }
  const files = [...list];
  $("status").className = "status";
  for (const [i, f] of files.entries()) {
    $("status").textContent = `Apstrādā ${i + 1} no ${files.length}: ${f.name}`;
    await ws.add(f.name, new Uint8Array(await f.arrayBuffer()));
  }
  $("status").className = "status ok";
  $("status").textContent = `Ielādēts kopā: ${ws.invoices.size} rēķini no CSV, ${ws.pdf.size} PDF.`;
  render();
}

const drop = $("drop");
$("pick").onchange = e => { if (e.target.files.length) addFiles(e.target.files); e.target.value = ""; };
drop.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("pick").click(); } });
["dragenter", "dragover"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", e => { if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });
$("rate").oninput = render;
$("clear").onclick = () => { ws.clear(); sample = false; $("status").textContent = ""; render(); };

// invented rows so the page shows what it does before files are added
ws.add("paraugs.csv", new TextEncoder().encode(sampleCsv())).then(() => {
  ws.files[0].note = "izdomāti dati, tiks aizstāti ar jūsu failiem";
  render();
});
