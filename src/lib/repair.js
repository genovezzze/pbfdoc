// Excel on a Russian Windows saves CSV as Windows-1251, which has no Latvian letters: "Rīga" becomes "R?ga".
// The letters are gone from the file, so each damaged word is matched against known Latvian words
// ("R?ga" fits only "Rīga") taken from a built-in list of common address words and from the clean files loaded.

const LV = "āčēģīķļņšūžĀČĒĢĪĶĻŅŠŪŽõäöüÕÄÖÜ";   // Latvian, plus Estonian for Bolt's own company names
const LV_CLASS = `[${LV}]`;
const WORD = new RegExp(`[A-Za-z${LV}?]+`, "g");

// Common words in Riga-area addresses and Bolt pick-up points
const BUILT_IN = `Rīga Rīgas Rīgā Jūrmala Jūrmalas Mārupe Mārupes Mārupīte Ķekava Ķekavas Ādaži Ādažu Salaspils Babīte Babītes Piņķi Ulbroka
Tirdzniecības Galvenā Galvenais Ieeja ieeja centrs centra Iebrauktuve stāvvieta stāvlaukums pietura Autobusu Autoosta Dzelzceļa stacija Stacija
iela Iela gatve Gatve bulvāris Bulvāris prospekts laukums Laukums šoseja Šoseja dambis Dambis krastmala Krastmala līnija šķērslīnija
Krišjāņa Barona Brīvības Valdemāra Tērbatas Ģertrūdes Bruņinieku Ropažu Gunāra Astras Pulkveža Brieža Zemitāna Pērnavas Āgenskalna
Čiekurkalna Lāčplēša Dzirnavu Kalnciema Anniņmuižas Ūnijas Ieriķu Vienības Mūkusalas Ķīpsalas Lielvārdes Daugavgrīvas Biķernieku Purvciema
Ziepniekkalna Imantas Zolitūdes Zolitūde Pļavnieki Pļavnieku Mežaparks Mežaparka Ķengaraga Ķengarags Bābelītes Vecrīga Vecrīgā Merķeļa
Aspazijas Raiņa Cēsu Tallinas Ģimnāzijas Rūpniecības Ganību Skanstes Sporta Kārļa Ulmaņa Jāņa Dālderu Graudu Ūdens Zāļu Vāveru Bērzaunes
Gaujas Pētersalas Hospitāļu Stabu Čaka Ģertrūdes Avotu Matīsa Dzērbenes Kurzemes Vidzemes Latgales Zemgales priekšpilsēta Priekšpilsēta
Lidosta lidosta Ielidošana Izlidošana Dzīvokļi Viesnīca viesnīca Slimnīca slimnīca Universitāte Tirgus Centrāltirgus Stacijas Origo Domina
Spīdolas Dzintaru Mellužu Jaundubultu Majoru Bulduru Lielupes Dubultu Kauguru Asaru Slokas Vaivaru Ķemeru Krāslavas Rēzeknes Daugavpils
Mazā Lielā Vecā Jaunā Jūras Jūrmalas Bīskapa Kungu Šķūņu Kaļķu Grēcinieku Smilšu Mārstaļu Kalēju Audēju Teātra Doma Pils Rātslaukums
Mīlgrāvja Juglas Brekšu Berģu Bukultu Kleistu Dammes Zemgales Ķīšezera Šampētera Šampēteris Torņakalns Torņakalna Āgenskalns Pārdaugava
Strēlnieku Nometņu Baznīcas Iepirkšanās Artilērijas Smiļģa Arēna Arēnā Džohara Dudajeva Alūksnes Bērzpils Blaumaņa
Jēzusbaznīcas Pilsoņu Mēness Krāsotāju Pliensciema Dārzaugļu Emīla Dārziņa Ņujorka Krustabaznīcas Senču Pērses Kaukāza Tālivalža
Ilūkstes Baltā Kuldīgas Mālpils Nīcgales Katoļu Lubānas Aluņāna Līnija Rūdolfa Mārtiņa Gaiziņa Lēdmanes Rēznas Vērgales Prūšu
Sarkandaugavas Ķengaraga Ķīšezers Bolderājas Daugavgrīva Vecmīlgrāvis Mangaļsalas Ziemeļblāzmas Mežciema Dreiliņu Pļavnieku Dārzciema
Lastādijas Plieņciema Mērnieku Alunāna Stērstu
OÜ Lõuna Vana-Lõuna Tallinn
Jānis Kārlis Mārtiņš Pēteris Krišjānis Māris Uģis Ainārs Gunārs Artūrs Mārcis Krišs Ēriks Ēvalds Dāvis Dāniels Emīls Jēkabs Jurģis Ričards
Rūdolfs Konstantīns Jevgēņijs Vitālijs Iļja Ņikita Edvīns Kristiāns Valērijs Aleksandrs Arvīds Ivars Andrejs Jurijs Dmitrijs
Evelīna Elīna Kristīne Kristīna Līga Edīte Kristiāna Rūta Lāsma Undīne Valentīna Natālija Jeļena Oļga Diāna Lūcija Rēzija Patrīcija Beāte
Dārta Amēlija Emīlija Jūlija Katrīna Lība Līva Sāra Ērika Ņina Anžela Gaļina Laimdota Ināra Elvīra Žanna Ilze Evija Inese Dace Ance Alise
Bērziņš Bērziņa Kalniņš Kalniņa Ozoliņš Ozoliņa Liepiņš Liepiņa Krūmiņš Krūmiņa Eglītis Eglīte Zariņš Zariņa Vītols Vītola Kļaviņš Kļaviņa
Kārkliņš Kārkliņa Lapiņš Lapiņa Siliņš Siliņa Kalējs Kalēja Āboliņš Āboliņa Šteins Šteina Ķēniņš Ķēniņa Muižnieks Muižniece Dūmiņš Dūmiņa
Pētersons Pētersone Jēkabsons Jēkabsone Mārtiņsons Mārtiņsone Andersone Jansone Kaņepe Strods Stroda Zīverts Zīverte Gūtmanis Gūtmane
Valmieras Cēsis Ogres Ogre Siguldas Sigulda Jelgavas Jelgava Liepājas Ventspils Tukuma Ķīpsala Vēja Ziedoņa Plostu Ķiršu Ābeļu Bērzu Liepu`;

/** Vocabulary: word → count, from text known to be undamaged. */
export function buildVocab(texts) {
  const v = new Map();
  const add = w => { if (new RegExp(LV_CLASS).test(w)) v.set(w, (v.get(w) || 0) + 1); };
  BUILT_IN.split(/\s+/).forEach(add);
  for (const t of texts) for (const w of String(t || "").match(WORD) || []) if (!w.includes("?")) add(w);
  return v;
}

const isDamagedWord = w => w.includes("?") && /[A-Za-z]/.test(w);

/** Replace damaged words that fit exactly one known word (or one far more common than the rest). */
export function repairText(text, vocab) {
  if (!text || !text.includes("?")) return { text, fixed: 0, left: 0 };
  let fixed = 0, left = 0;
  const out = text.replace(WORD, w => {
    if (!isDamagedWord(w)) return w;
    const re = new RegExp("^" + w.replace(/[.*+^${}()|[\]\\]/g, "\\$&").replace(/\?/g, LV_CLASS) + "$");
    const hits = [...vocab.entries()].filter(([k]) => re.test(k)).sort((a, b) => b[1] - a[1]);
    // one match, one clear favourite, or the same word in different letter case
    const sameWord = hits.length > 1 && hits.every(([k]) => k.toLowerCase() === hits[0][0].toLowerCase());
    if (hits.length === 1 || sameWord || (hits.length > 1 && hits[0][1] >= 3 * hits[1][1])) { fixed++; return hits[0][0]; }
    left++;
    return w;
  });
  return { text: out, fixed, left };
}

export const TEXT_FIELDS = ["addr", "recv", "raddr", "comp", "caddr"];
