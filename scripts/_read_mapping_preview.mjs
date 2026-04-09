import fs from "node:fs";
import xlsx from "xlsx";

const filePath = String.raw`c:\Users\FWLF0725\Downloads\Quantis_Mapping_2033SD.xlsx`;
const wb = xlsx.readFile(filePath, {cellDates: false});
console.log("SHEETS", wb.SheetNames.join(" | "));
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const rows = xlsx.utils.sheet_to_json(ws, {header:1, defval: null, raw:false});
  const nonEmpty = rows.filter(r => Array.isArray(r) && r.some(c => c !== null && String(c).trim() !== ""));
  console.log(`\n=== SHEET: ${name} ===`);
  console.log("ROW_COUNT", rows.length, "NON_EMPTY", nonEmpty.length);
  for (let i=0; i<Math.min(20, nonEmpty.length); i++) {
    const row = nonEmpty[i].map((c)=> (c===null?"":String(c).replace(/\s+/g," ").trim()));
    console.log(`${i+1}. ${JSON.stringify(row)}`);
  }
}
