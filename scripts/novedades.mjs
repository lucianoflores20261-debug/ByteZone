// Genera novedades.json leyendo feeds RSS en español (Gaming y Android).
// Uso: node scripts/novedades.mjs   (Node 18+, sin dependencias)
import { readFileSync, writeFileSync, existsSync } from 'fs';

const POR_FEED = 3;      // notas nuevas por feed en cada corrida
const MAX_TOTAL = 30;    // máximo de novedades guardadas (se van rotando las viejas)
const FEEDS = [
  // GAMING (español)
  { url: 'https://feeds.weblogssl.com/vidaextra',  cat: 'Gaming'  },
  { url: 'https://www.3djuegos.com/index.php?zona=rss', cat: 'Gaming' },
  // ANDROID (español)
  { url: 'https://feeds.weblogssl.com/xatakandroid', cat: 'Android' },
  { url: 'https://www.androidayuda.com/feed/',       cat: 'Android' },
];
const CATS = FEEDS.map(f => f.cat);

const decode = s => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const strip = s => decode(s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const slug = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);
const tag = (x, t) => (x.match(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`, 'i')) || [])[1] || '';
const httpsOnly = u => (/^https:\/\/[^\s()"'<>]+$/.test(u || '') ? u : '');

function imagen(item) {
  const m = item.match(/<(?:media:content|media:thumbnail|enclosure)[^>]*\burl=["']([^"']+)["']/i)
    || item.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? httpsOnly(decode(m[1])) : '';
}

const previas = (existsSync('novedades.json') ? JSON.parse(readFileSync('novedades.json', 'utf8')) : []).filter(a => CATS.includes(a.cat));
const nuevas = [];

for (const f of FEEDS) {
  try {
    const res = await fetch(f.url, { headers: { 'User-Agent': 'ZoneByteBot/1.0' }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const xml = await res.text();
    const idioma = strip(tag(xml, 'language'));
    if (idioma && !/^es/i.test(idioma)) throw new Error('feed no está en español (' + idioma + '), se omite');
    const host = new URL(f.url).hostname.replace(/^www\./, '').replace('feeds.weblogssl.com', 'Xataka / Weblogs');
    let n = 0;
    for (const item of xml.split(/<item[\s>]/i).slice(1)) {
      if (n >= POR_FEED) break;
      const title = strip(tag(item, 'title'));
      const link = httpsOnly(decode(strip(tag(item, 'link'))));
      if (!title || !link) continue;
      const resumen = strip(tag(item, 'description') || tag(item, 'content:encoded')).slice(0, 200);
      if (f.filtro && !f.filtro.test(title + ' ' + resumen)) continue;
      const d = new Date(strip(tag(item, 'pubDate')));
      const date = (isNaN(d) ? new Date() : d).toISOString().slice(0, 10);
      const s = slug(title);
      nuevas.push({
        id: 'auto-' + s, slug: 'n-' + s, page: 'nov',
        title, sub: host, desc: resumen, cat: f.cat, date,
        kw: ('novedad ' + f.cat).toLowerCase(), vid: '', feat: false, draft: false,
        cover: imagen(item),
        blocks: [
          { t: 'p', v: resumen },
          { t: 'btn', v: 'Leer la nota completa en ' + host, u: link, u2: '', t2: '', c: '' }
        ]
      });
      n++;
    }
    console.log(`OK  ${f.cat.padEnd(8)} ${n} notas  ${f.url}`);
  } catch (e) {
    console.error(`ERR ${f.cat.padEnd(8)} ${f.url} -> ${e.message}`);
  }
}

// Mezcla con las previas (sin duplicar), ordena por fecha y recorta
const mapa = new Map();
for (const a of [...nuevas, ...previas]) if (!mapa.has(a.id)) mapa.set(a.id, a);
const final = [...mapa.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX_TOTAL);

if (!final.length) { console.error('Sin datos: no se modifica novedades.json'); process.exit(0); }
writeFileSync('novedades.json', JSON.stringify(final, null, 1));
console.log(`novedades.json: ${final.length} novedades (${nuevas.length} leídas ahora)`);
