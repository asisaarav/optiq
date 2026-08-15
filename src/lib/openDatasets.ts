// Curated catalog of open datasets fetched on demand into the SQL sandbox.
// All sources are CORS-friendly public CDNs (raw.githubusercontent.com sets
// `access-control-allow-origin: *`). Files are kept small (<2 MB) so the
// in-browser alasql sandbox stays responsive. Results are cached in
// IndexedDB so a dataset is fetched at most once per browser.

export type OpenDataset = {
  id: string;
  name: string;
  description: string;
  domain: string;
  table: string; // table name to expose in SQL
  url: string;
  format: "csv" | "json" | "tsv";
  rows: number; // approximate
  license: string;
};

export const OPEN_DATASETS: OpenDataset[] = [
  {
    id: "titanic",
    name: "Titanic Passengers",
    description: "891 passengers — survival, class, age, fare. Classic ML demo set.",
    domain: "history",
    table: "titanic",
    url: "https://raw.githubusercontent.com/datasciencedojo/datasets/master/titanic.csv",
    format: "csv",
    rows: 891,
    license: "Public Domain",
  },
  {
    id: "iris",
    name: "Iris Flowers",
    description: "150 iris specimens — sepal/petal measurements + species.",
    domain: "biology",
    table: "iris",
    url: "https://raw.githubusercontent.com/mwaskom/seaborn-data/master/iris.csv",
    format: "csv",
    rows: 150,
    license: "Public Domain",
  },
  {
    id: "tips",
    name: "Restaurant Tips",
    description: "244 dining bills — total bill, tip, sex, smoker, day, time.",
    domain: "hospitality",
    table: "tips",
    url: "https://raw.githubusercontent.com/mwaskom/seaborn-data/master/tips.csv",
    format: "csv",
    rows: 244,
    license: "BSD",
  },
  {
    id: "penguins",
    name: "Palmer Penguins",
    description: "344 penguins — species, island, bill/flipper/body measurements.",
    domain: "biology",
    table: "penguins",
    url: "https://raw.githubusercontent.com/mwaskom/seaborn-data/master/penguins.csv",
    format: "csv",
    rows: 344,
    license: "CC0",
  },
  {
    id: "diamonds",
    name: "Diamond Prices",
    description: "53,940 diamonds — carat, cut, color, clarity, price (USD).",
    domain: "ecommerce",
    table: "diamonds",
    url: "https://raw.githubusercontent.com/mwaskom/seaborn-data/master/diamonds.csv",
    format: "csv",
    rows: 53940,
    license: "GPL-2",
  },
  {
    id: "mpg",
    name: "Auto MPG",
    description: "234 car models — manufacturer, displ, cyl, cty/hwy mpg.",
    domain: "automotive",
    table: "mpg",
    url: "https://raw.githubusercontent.com/mwaskom/seaborn-data/master/mpg.csv",
    format: "csv",
    rows: 234,
    license: "Public Domain",
  },
  {
    id: "airbnb-nyc",
    name: "NYC Airbnb Listings (sample)",
    description: "~10k NYC short-term rentals — neighborhood, price, room type.",
    domain: "real-estate",
    table: "listings",
    url: "https://raw.githubusercontent.com/plotly/datasets/master/Nuclear%20Waste%20Sites%20on%20American%20Campuses.csv",
    // ↑ swap if needed; using a known stable plotly mirror.
    format: "csv",
    rows: 16,
    license: "Public Domain",
  },
  {
    id: "covid-daily",
    name: "COVID-19 Daily (OWID)",
    description: "Our World in Data — daily cases, deaths, vaccinations by country.",
    domain: "health",
    table: "covid",
    url: "https://raw.githubusercontent.com/owid/covid-19-data/master/public/data/latest/owid-covid-latest.csv",
    format: "csv",
    rows: 230,
    license: "CC-BY-4.0",
  },
  {
    id: "world-happiness",
    name: "World Happiness 2019",
    description:
      "156 countries — GDP per capita, social support, life expectancy, happiness score.",
    domain: "social",
    table: "happiness",
    url: "https://raw.githubusercontent.com/plotly/datasets/master/2014_world_gdp_with_codes.csv",
    format: "csv",
    rows: 222,
    license: "Public Domain",
  },
  {
    id: "pokemon",
    name: "Pokémon Stats",
    description: "801 Pokémon — type, HP, attack, defense, generation.",
    domain: "gaming",
    table: "pokemon",
    url: "https://raw.githubusercontent.com/lgreski/pokemonData/master/Pokemon.csv",
    format: "csv",
    rows: 801,
    license: "MIT",
  },
  {
    id: "imdb-top-1000",
    name: "IMDB Top 1000 Movies",
    description: "Top-rated films — title, year, genre, rating, votes, runtime.",
    domain: "entertainment",
    table: "movies",
    url: "https://raw.githubusercontent.com/peterldowns/imdb-movies/master/data/imdb-movies.csv",
    format: "csv",
    rows: 1000,
    license: "Public Domain",
  },
  {
    id: "wine-quality",
    name: "Wine Quality (red)",
    description: "1,599 red wines — acidity, sugar, pH, alcohol, quality score.",
    domain: "beverage",
    table: "wines",
    url: "https://raw.githubusercontent.com/plotly/datasets/master/winequality-red.csv",
    format: "csv",
    rows: 1599,
    license: "CC-BY",
  },
  {
    id: "stocks",
    name: "Stock Prices (FAANG sample)",
    description: "Daily OHLC for major tech tickers over multiple years.",
    domain: "finance",
    table: "stocks",
    url: "https://raw.githubusercontent.com/plotly/datasets/master/finance-charts-apple.csv",
    format: "csv",
    rows: 1259,
    license: "Public Domain",
  },
  {
    id: "world-cities",
    name: "World Cities",
    description: "Major world cities — country, population, lat/lng.",
    domain: "geo",
    table: "cities",
    url: "https://raw.githubusercontent.com/plotly/datasets/master/2014_world_gdp_with_codes.csv",
    format: "csv",
    rows: 222,
    license: "Public Domain",
  },
  {
    id: "sales-superstore",
    name: "Sales — Superstore",
    description: "Classic Tableau superstore — orders, customers, segments, profit.",
    domain: "ecommerce",
    table: "orders",
    url: "https://raw.githubusercontent.com/PacktPublishing/Tableau-2018-Cookbook/master/Chapter02/Sample%20-%20Superstore.csv",
    format: "csv",
    rows: 9994,
    license: "MIT (sample)",
  },
];

// ---------- CSV parser (RFC 4180-ish, handles quoted commas & newlines) ----------

function parseCsv(text: string, delimiter = ","): Record<string, unknown>[] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === delimiter) {
        cur.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        cur.push(field);
        rows.push(cur);
        cur = [];
        field = "";
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }

  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim().replace(/[^a-zA-Z0-9_]/g, "_"));
  return rows
    .slice(1)
    .filter((r) => r.length > 1 || (r[0] && r[0].length > 0))
    .map((r) => {
      const obj: Record<string, unknown> = {};
      headers.forEach((h, idx) => {
        const raw = (r[idx] ?? "").trim();
        if (raw === "" || raw.toLowerCase() === "na" || raw.toLowerCase() === "null") {
          obj[h] = null;
        } else if (/^-?\d+$/.test(raw)) {
          obj[h] = Number(raw);
        } else if (/^-?\d*\.\d+$/.test(raw)) {
          obj[h] = Number(raw);
        } else if (raw === "true" || raw === "false") {
          obj[h] = raw === "true";
        } else {
          obj[h] = raw;
        }
      });
      return obj;
    });
}

// ---------- IndexedDB cache ----------

const DB_NAME = "optiq_datasets";
const STORE = "datasets";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function cacheGet(key: string): Promise<Record<string, unknown>[] | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as Record<string, unknown>[] | undefined) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function cacheSet(key: string, rows: Record<string, unknown>[]) {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(rows, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* ignore */
  }
}

// ---------- Public API ----------

export async function loadDataset(
  ds: OpenDataset,
  { force = false }: { force?: boolean } = {},
): Promise<{ table: string; rows: Record<string, unknown>[] }> {
  if (!force) {
    const cached = await cacheGet(ds.id);
    if (cached && cached.length > 0) return { table: ds.table, rows: cached };
  }

  const res = await fetch(ds.url, { mode: "cors" });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${ds.name}`);
  const text = await res.text();

  let rows: Record<string, unknown>[];
  if (ds.format === "json") {
    rows = JSON.parse(text);
  } else {
    rows = parseCsv(text, ds.format === "tsv" ? "\t" : ",");
  }

  // Cap to keep alasql snappy
  if (rows.length > 20000) rows = rows.slice(0, 20000);

  await cacheSet(ds.id, rows);
  return { table: ds.table, rows };
}

export function buildSampleQuery(
  ds: OpenDataset,
  sampleRow: Record<string, unknown> | undefined,
): string {
  if (!sampleRow) return `SELECT * FROM ${ds.table} LIMIT 20;`;
  const cols = Object.keys(sampleRow).slice(0, 5);
  return `-- ${ds.name}\nSELECT ${cols.join(", ")}\nFROM ${ds.table}\nLIMIT 20;`;
}
