// Bolt "Klientu rēķini" CSV → invoice rows

export const VAT = 0.21;
export const DT = /^\d\d\.\d\d\.\d{4} \d\d:\d\d$/;
export const r2 = x => Math.round((x + (x >= 0 ? 1e-9 : -1e-9)) * 100) / 100;

/**
 * Bytes → text. Bolt exports UTF-8; a file re-saved by Excel is in the Windows "ANSI" code page:
 * Windows-1251 on a Russian system (keeps Cyrillic, loses Latvian letters) or Windows-1257 on a Baltic one.
 * Pick the one whose decoding reads as real words.
 */
export function decode(bytes) {
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, ""), ansi: false, encoding: "utf-8" };
  } catch {
    const cyr = new TextDecoder("windows-1251").decode(bytes);
    const bal = new TextDecoder("windows-1257").decode(bytes);
    const cyrWords = (cyr.match(/[А-Яа-яЁё]{3,}/g) || []).length;
    const lvWords = (bal.match(/[A-Za-z][āēīūčšžņļķģ][a-z]/g) || []).length;
    return cyrWords > lvWords
      ? { text: cyr, ansi: true, encoding: "windows-1251" }
      : { text: bal, ansi: true, encoding: "windows-1257" };
  }
}

/** Excel replaces Latvian letters with "?" when it saves as ANSI; detect that so the user can re-download. */
export function looksDamaged(text) {
  return (text.match(/[A-Za-z]\?[a-z]/g) || []).length > 5;
}

/** "dd.mm.yyyy hh:mm" → Date whose UTC fields hold the local wall time (so Excel shows the same time). */
export function parseDate(s) {
  const m = String(s).trim().match(/^(\d\d)\.(\d\d)\.(\d{4})(?: (\d\d):(\d\d))?$/);
  if (!m) return null;
  return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)));
}

function splitDelimited(line, d) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
    } else if (c === '"' && cur === "") q = true;
    else if (c === d) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

// Excel re-saves can split a quoted address into two fields and drop empty ones:
// rebuild the row around the payment-type column and the fixed tail of 7 fields
function fixRow(r) {
  let i = -1;
  for (let k = 3; k < r.length - 1; k++) if (DT.test(r[k + 1].trim()) && !DT.test(r[k].trim())) { i = k; break; }
  if (i < 0 || r.length < 13) return null;
  // quotes are Excel's leftovers only when the address was split over several fields
  const parts = r.slice(2, i);
  const addr = parts.length > 1 ? parts.map(x => x.replace(/^"+|"+$/g, "").trim()).filter(Boolean).join(", ") : parts[0] || "";
  const mid = r.slice(i + 3, -7).concat(["", "", ""]).slice(0, 3);
  return [r[0], r[1], addr, r[i], r[i + 1], r[i + 2], ...mid, ...r.slice(-7)];
}

const num = s => parseFloat(String(s).replace(",", "."));

/**
 * Parse one CSV. Rows that cannot be read are pushed to `review` instead of being dropped silently.
 * Each row: inv, date, addr, pay, ride, recv, raddr, rreg, rvat, comp, caddr, creg, cvat,
 * net, vat, total (as in Bolt) plus taxable / nontax (the airport fee carries no VAT).
 */
export function parseCsv(text, fname = "", review = []) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const head = lines.shift() || "";
  if (!/R.{1,2}ina numurs/i.test(head)) throw new Error("tas nav Bolt „Klientu rēķini” CSV");
  const rows = [];
  for (const line of lines) {
    const raw = line.includes("\t") ? splitDelimited(line, "\t") : line.trim().slice(1, -1).split('","');   // Bolt does not escape inner quotes
    const r = fixRow(raw);
    if (!r) { review.push({ inv: raw[0] || "?", src: fname, why: "CSV rindu neizdevās nolasīt", text: line.slice(0, 160) }); continue; }
    const net = num(r[13]), vat = num(r[14]), total = num(r[15]);
    const standard = Math.abs(net * VAT - vat) <= 0.01;
    const taxable = standard ? net : r2(vat / VAT);
    rows.push({
      inv: r[0].trim(), date: parseDate(r[1]), addr: r[2],
      pay: /^Bolt/i.test(r[3]) ? "Bolt maksājums" : /^Uz/i.test(r[3]) ? "Uzņēmums" : r[3],
      ride: DT.test(r[4].trim()) ? parseDate(r[4]) : null, recv: r[5], raddr: r[6], rreg: r[7], rvat: r[8],
      comp: r[9], caddr: r[10], creg: r[11], cvat: r[12], net, vat, total, taxable, nontax: r2(net - taxable)
    });
  }
  return rows;
}
