// Invented September invoices in Bolt's CSV format, shown before the user loads real files
import { r2 } from "./lib/csv.js";

export function sampleCsv() {
  const head = '"Rēķina numurs","Datums","Pasūtījuma adrese","Maksājuma veids","Brauciena norises laiks","Saņēmējs","Saņēmēja adrese",' +
    '"Saņēmēja reģistrācijas numurs","Saņēmēja PVN numurs","Uzņēmuma nosaukums (vadītāja)","Uzņēmuma adrese (Iela, Numurs, Pasta kods, Valsts)",' +
    '"Uzņēmuma reģistrācijas numurs","Uzņēmuma NIM / PVN maksātāja numurs","Cena (bez PVN)","PVN","Cena kopā"';
  const addrs = ["Brīvības iela 100, Rīga", "Arrivals, Riga Airport (RIX)", "Krasta iela 46, Rīga", "Elizabetes iela 2, Rīga", "Lāčplēša iela 70, Rīga", "Ūnijas iela 8, Rīga"];
  const out = [head];
  let n = 1;
  for (let d = 30; d >= 1; d--) for (let k = 0; k < 1 + (d % 3); k++) {
    const total = r2(4 + ((d * 7 + k * 5) % 15) * 0.7);
    const airport = (d + k) % 9 === 0;            // airport rides carry a ~2 EUR fee without VAT
    const gross = airport ? total - 2 : total;
    const vat = r2(gross - r2(gross / 1.21)), net = r2(total - vat);
    const dd = String(d).padStart(2, "0"), hh = String(9 + ((d + k * 3) % 13)).padStart(2, "0");
    out.push([`PARAUGS-LV0000-${n++}`, `${dd}.09.2026 ${hh}:15`, airport ? addrs[1] : addrs[(d + k) % 6], (d + k) % 7 ? "Bolt maksājums" : "Uzņēmums",
      `${dd}.09.2026 ${hh}:05`, "Klients", "", "", "", "Paraugs SIA", "Rīga", "", "", net.toFixed(2), vat.toFixed(2), String(total)]
      .map(x => `"${x}"`).join(","));
  }
  return out.join("\n");
}
