import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const STATE_PATH = path.join(process.cwd(), "data", "breaking-news-state.json");
const TELEGRAM_ENDPOINT = "https://breakingnews-five.vercel.app/api/telegram";
const ALERT_SECRET = process.env.ALERT_SECRET;

if (!ALERT_SECRET) {
  throw new Error("Missing ALERT_SECRET");
}

const feeds = [
  {
    name: "MOLDPRES",
    url: "https://moldpres.md/config/rss.php?lang=rom",
    kind: "moldova",
  },
  {
    name: "Google News — regiune",
    url: "https://news.google.com/rss/search?q=(Moldova%20OR%20Ukraine%20OR%20Romania%20OR%20Transnistria)%20(drone%20OR%20missile%20OR%20explosion%20OR%20attack%20OR%20earthquake%20OR%20evacuation%20OR%20blackout)%20when%3A1h&hl=en-US&gl=US&ceid=US%3Aen",
    kind: "region",
  },
  {
    name: "Google News — global",
    url: "https://news.google.com/rss/search?q=(earthquake%20OR%20tsunami%20OR%20missile%20OR%20explosion%20OR%20evacuation%20OR%20blackout%20OR%20%22state%20of%20emergency%22)%20when%3A1h&hl=en-US&gl=US&ceid=US%3Aen",
    kind: "global",
  },
];

const trustedGoogleSources = [
  "Reuters",
  "Associated Press",
  "AP News",
  "BBC",
  "AFP",
  "Agence France-Presse",
  "DW",
  "Deutsche Welle",
  "Euronews",
  "France 24",
];

const urgentTerms = [
  "dronă", "drone", "rachet", "missile", "exploz", "explosion", "atac", "attack",
  "bombard", "airstrike", "incendiu", "fire", "cutremur", "earthquake", "seism",
  "tsunami", "evacu", "evacuat", "urgență", "emergency", "blackout", "pană de curent",
  "power outage", "întrerupere de energie", "inunda", "flood", "viitur", "derai",
  "derail", "prăbuș", "collapse", "crash", "spațiul aerian", "airspace",
  "frontieră închis", "border closed", "victime", "deaths", "killed", "fatal",
  "alertă aeriană", "air raid", "stare de urgență", "state of emergency",
];

const veryUrgentTerms = [
  "explosion", "exploz", "missile", "rachet", "drone", "dronă", "earthquake",
  "cutremur", "tsunami", "air raid", "alertă aeriană", "state of emergency",
  "stare de urgență", "blackout", "pană de curent", "evacuation", "evacuare",
  "airspace closed", "spațiul aerian închis",
];

const routineTerms = [
  "sondaj", "poll", "declara", "statement", "opinion", "interview", "alegeri",
  "election", "campanie", "campaign", "partid", "party", "parlament", "parliament",
  "reuniune", "meeting", "vizită", "visit", "negocieri", "talks",
];

function decodeXml(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function tag(item, name) {
  const match = item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function sourceTag(item) {
  const match = item.match(/<source(?:\s[^>]*)?>([\s\S]*?)<\/source>/i);
  return match ? decodeXml(match[1]) : "";
}

function parseRss(xml) {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  return blocks.map((item) => ({
    title: tag(item, "title"),
    link: tag(item, "link"),
    pubDate: tag(item, "pubDate"),
    description: tag(item, "description"),
    source: sourceTag(item),
  }));
}

function normalize(text) {
  return text.toLocaleLowerCase("ro-RO");
}

function score(item, kind) {
  const text = normalize(`${item.title} ${item.description}`);
  let points = 0;

  for (const term of urgentTerms) {
    if (text.includes(term)) points += 1;
  }
  for (const term of veryUrgentTerms) {
    if (text.includes(term)) points += 2;
  }
  for (const term of routineTerms) {
    if (text.includes(term)) points -= 1;
  }

  if (kind === "moldova") points += 1;
  if (/(moldova|chișinău|chisinau|transnistr|ucraina|ukraine|romania)/i.test(text)) {
    points += 1;
  }

  return points;
}

function isTrusted(item, feed) {
  if (feed.kind === "moldova") return true;
  return trustedGoogleSources.some(
    (source) => item.source.toLowerCase() === source.toLowerCase(),
  );
}

function isRecent(item) {
  const when = Date.parse(item.pubDate);
  if (!Number.isFinite(when)) return false;
  const ageMs = Date.now() - when;
  return ageMs >= -5 * 60_000 && ageMs <= 20 * 60_000;
}

function keyFor(item) {
  return crypto
    .createHash("sha256")
    .update(`${item.title}\n${item.link}`)
    .digest("hex")
    .slice(0, 20);
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  } catch {
    return { sent: [] };
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  state.sent = state.sent.slice(-500);
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n");
}

async function sendTelegram(text) {
  const response = await fetch(TELEGRAM_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ALERT_SECRET}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw new Error(`Telegram endpoint failed: ${response.status} ${await response.text()}`);
  }
}

const state = loadState();
const sent = new Set(state.sent);
const candidates = [];

if (process.env.TEST_MODE === "1") {
  candidates.push({
    title: "TEST E2E — Alertă urgentă simulată pentru verificarea canalului",
    link: "https://breakingnews-five.vercel.app",
    pubDate: new Date().toUTCString(),
    description:
      "Acesta este un test controlat care trece prin același flux GitHub Actions → filtru → Vercel → Telegram.",
    source: "Breaking News Monitor Test",
    key: `test-${Date.now()}`,
    score: 99,
    feed: "E2E test",
  });
}

for (const feed of feeds) {
  try {
    const response = await fetch(feed.url, {
      headers: {
        "User-Agent": "breaking-news-monitor/1.0",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
    });

    if (!response.ok) {
      console.warn(`Feed failed (${feed.name}): ${response.status}`);
      continue;
    }

    const xml = await response.text();
    for (const item of parseRss(xml)) {
      if (!item.title || !item.link || !isRecent(item) || !isTrusted(item, feed)) {
        continue;
      }

      const itemScore = score(item, feed.kind);
      const threshold = feed.kind === "moldova" ? 4 : 5;
      if (itemScore < threshold) continue;

      const key = keyFor(item);
      if (sent.has(key)) continue;

      candidates.push({ ...item, key, score: itemScore, feed: feed.name });
    }
  } catch (error) {
    console.warn(`Feed error (${feed.name}):`, error);
  }
}

candidates.sort((a, b) => b.score - a.score);

for (const item of candidates.slice(0, 3)) {
  const source = item.source || item.feed;
  const message = [
    "🚨 ALERTĂ AUTOMATĂ",
    "",
    item.title,
    "",
    `Sursa: ${source}`,
    item.link,
    "",
    "Verificare automată la 5 minute. Pentru evenimente în desfășurare, urmărește și instrucțiunile autorităților.",
  ].join("\n");

  await sendTelegram(message);
  sent.add(item.key);
  console.log(`Sent: ${item.title}`);
}

state.sent = [...sent];
saveState(state);

console.log(`Checked ${feeds.length} feeds; sent ${Math.min(candidates.length, 3)} alert(s).`);
