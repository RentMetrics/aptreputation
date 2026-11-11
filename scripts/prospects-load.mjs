#!/usr/bin/env node
/**
 * Load the marketing list (apartment communities and who manages them) into
 * the admin portal.
 *
 *   node scripts/prospects-load.mjs                 # dry run: parse and count, write nothing
 *   node scripts/prospects-load.mjs --commit        # write to the dev deployment
 *   node scripts/prospects-load.mjs --commit --prod # write to production
 *   --only=Dallas                                   # only metro files whose name contains this
 *   --folder="Sept 2026"                            # default: newest <Month Year> folder
 *
 * Source: ~/Data/data-corpus/market-data-corpus/<Month Year>/*.zip, one
 * workbook per metro. Only the identity columns of the "Property Attributes"
 * sheet are read (name, address, phone, units, owner, management company).
 * Rents, concessions and occupancy are never read or uploaded.
 *
 * Re-running is safe: rows are matched on the source property ID, so names and
 * managers refresh while Google ratings and outreach notes are kept.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const XLSX = createRequire(import.meta.url)("xlsx");

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const COMMIT = args.includes("--commit");
const PROD = args.includes("--prod");
const ONLY = flag("only")?.toLowerCase();
const ROOT = join(process.env.DATA_CORPUS_DIR ?? join(homedir(), "Data", "data-corpus"), "market-data-corpus");

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
function folderOrdinal(name) {
  const m = name.trim().toLowerCase().match(/^([a-z]+)[\s_-]+(\d{4})$/);
  if (!m || m[1].length < 3) return -1;
  const mi = MONTHS.findIndex((month) => month.startsWith(m[1]));
  return mi === -1 ? -1 : Number(m[2]) * 12 + mi;
}

function pickFolder() {
  const named = flag("folder");
  if (named) {
    if (!existsSync(join(ROOT, named))) throw new Error(`No folder ${named} in ${ROOT}`);
    return join(ROOT, named);
  }
  const folders = readdirSync(ROOT).filter((f) => folderOrdinal(f) >= 0).sort((a, b) => folderOrdinal(b) - folderOrdinal(a));
  if (!folders.length) throw new Error(`No <Month Year> folders in ${ROOT}`);
  return join(ROOT, folders[0]);
}

const str = (x) => {
  const s = x === null || x === undefined ? "" : String(x).trim();
  return s || undefined;
};
const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : undefined);
const companyKey = (name) => (name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const NO_COMPANY = new Set(["", "n a", "na", "none", "unknown", "not available"]);

function entries(zip) {
  return execFileSync("unzip", ["-Z1", zip], { encoding: "utf8" })
    .split("\n")
    .filter((n) => n.toLowerCase().endsWith(".xlsx"));
}

const folder = pickFolder();
const zips = readdirSync(folder).filter((f) => f.toLowerCase().endsWith(".zip")).map((f) => join(folder, f));
// Each monthly download repeats earlier metros, so read every workbook once.
const seenFiles = new Set();
const seenIds = new Set();
const rows = [];
let skipped = 0;

for (const zip of zips) {
  for (const entry of entries(zip)) {
    if (seenFiles.has(entry)) continue;
    seenFiles.add(entry);
    if (ONLY && !entry.toLowerCase().includes(ONLY)) continue;
    // The national workbook repeats every metro file in one 450 MB sheet.
    if (/MonthlyTimeSeries_US\.xlsx$/i.test(entry)) continue;
    const buf = execFileSync("unzip", ["-p", zip, entry], { maxBuffer: 1024 * 1024 * 400 });
    const wb = XLSX.read(buf, { sheets: ["Property Attributes"] });
    const sheet = wb.Sheets["Property Attributes"];
    if (!sheet) continue;
    const table = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
    const header = (table[3] ?? []).map((h) => String(h ?? "").trim());
    const col = (name) => header.indexOf(name);
    const at = (row, name) => (col(name) === -1 ? null : row[col(name)]);
    let kept = 0;
    for (const row of table.slice(4)) {
      const sourceId = str(at(row, "Property ID"));
      const name = str(at(row, "Name"));
      const city = str(at(row, "City"));
      const state = str(at(row, "State"))?.toUpperCase();
      const metro = str(at(row, "Market"));
      if (!sourceId || !name || !city || !state || !metro) { skipped++; continue; }
      if (seenIds.has(sourceId)) continue;
      seenIds.add(sourceId);
      const management = str(at(row, "Management"));
      const owner = str(at(row, "Property Owner"));
      const units = num(at(row, "Total Units"));
      rows.push({
        sourceId,
        name,
        address: str(at(row, "Address")),
        city,
        state,
        zip: str(at(row, "ZIP Code")),
        phone: str(at(row, "Phone")),
        lat: num(at(row, "Latitude")),
        lng: num(at(row, "Longitude")),
        metro,
        units: units && units > 0 ? Math.round(units) : undefined,
        owner: NO_COMPANY.has(companyKey(owner)) ? undefined : owner,
        management: NO_COMPANY.has(companyKey(management)) ? undefined : management,
      });
      kept++;
    }
    process.stdout.write(`  ${entry.replace(/^.*MonthlyTimeSeries_|\.xlsx$/g, "")}: ${kept}\n`);
  }
}

// Rollups by metro, state and management company.
const groups = new Map();
const bump = (kind, key, name, units) => {
  if (!key) return;
  const id = `${kind}|${key}`;
  const g = groups.get(id) ?? { kind, key, name, properties: 0, units: 0 };
  g.properties++;
  g.units += units ?? 0;
  groups.set(id, g);
};
for (const r of rows) {
  bump("metro", r.metro, r.metro, r.units);
  bump("state", r.state, r.state, r.units);
  bump("management", companyKey(r.management), r.management, r.units);
}
const count = (kind) => [...groups.values()].filter((g) => g.kind === kind).length;
console.log(`\n${rows.length} properties from ${seenFiles.size} metro files in ${folder}`);
console.log(`${count("metro")} metros, ${count("state")} states, ${count("management")} management companies`);
console.log(`${rows.filter((r) => r.management).length} have a management company, ${rows.filter((r) => r.phone).length} a phone number, ${skipped} rows skipped (missing name or location)`);

if (!COMMIT) {
  console.log("\nDry run: nothing written. Add --commit to load the list.");
  process.exit(0);
}

function run(fn, payload) {
  const cli = ["convex", "run", ...(PROD ? ["--prod"] : []), fn, JSON.stringify(payload)];
  for (let attempt = 1; ; attempt++) {
    try {
      return execFileSync("npx", cli, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      if (attempt >= 3) throw new Error(`${fn} failed: ${String(e.stderr || e.message).slice(0, 500)}`);
    }
  }
}

console.log(`\nWriting to ${PROD ? "PRODUCTION" : "dev"}...`);
const SIZE = 250;
for (let i = 0; i < rows.length; i += SIZE) {
  run("prospects:importBatch", { rows: rows.slice(i, i + SIZE) });
  if ((i / SIZE) % 10 === 0) console.log(`  ${Math.min(i + SIZE, rows.length)} / ${rows.length}`);
}
const all = [...groups.values()];
for (let i = 0; i < all.length; i += 400) run("prospects:importGroups", { groups: all.slice(i, i + 400) });
console.log(`Done: ${rows.length} properties, ${all.length} rollups.`);
