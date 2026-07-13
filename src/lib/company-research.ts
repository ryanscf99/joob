/**
 * Public company research for jOOB application pack.
 * Sources: DuckDuckGo lite (when available), Wikipedia, direct page fetches.
 */

export interface WebHit {
  title: string;
  url: string;
  snippet: string;
  query: string;
}

export interface CompanyResearchBundle {
  company: string;
  queries: string[];
  hits: WebHit[];
  wikiExtract?: string | null;
  fetchedAt: string;
  note: string;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export function decodeEntities(s: string): string {
  if (!s) return "";
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) =>
      String.fromCharCode(parseInt(h, 16))
    );
}

export function cleanCompanyName(name: string): string {
  return decodeEntities(name || "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

async function fetchText(url: string, ms = 12000): Promise<string | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,zh-Hant;q=0.8,zh;q=0.7",
        "User-Agent": UA,
      },
      signal: controller.signal,
      cache: "no-store",
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function unwrapDdgUrl(href: string): string | null {
  if (!href) return null;
  let h = decodeEntities(href.trim());
  if (h.startsWith("//")) h = "https:" + h;
  try {
    const u = new URL(h, "https://duckduckgo.com");
    const uddg = u.searchParams.get("uddg");
    if (uddg) {
      try {
        return decodeURIComponent(uddg);
      } catch {
        return uddg;
      }
    }
    if (u.hostname.includes("duckduckgo.com")) return null;
    if (u.protocol === "http:" || u.protocol === "https:") return u.href;
  } catch {
    if (/^https?:\/\//i.test(h)) return h;
  }
  return null;
}

async function searchDuckDuckGoLite(
  query: string,
  limit = 6
): Promise<WebHit[]> {
  const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
  const html = await fetchText(url, 14000);
  if (!html) return [];
  // Captcha / anomaly page
  if (/anomaly-modal|challenge-form|bots use DuckDuckGo/i.test(html)) {
    return [];
  }

  const hits: WebHit[] = [];
  const seen = new Set<string>();
  const linkRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;

  while ((m = linkRe.exec(html)) && hits.length < limit) {
    const attrs = m[1] || "";
    const inner = m[2] || "";
    const hrefM = attrs.match(/href\s*=\s*["']([^"']+)["']/i);
    if (!hrefM) continue;
    const rawHref = hrefM[1];
    if (!/uddg=|https?:|\/\//i.test(rawHref)) continue;

    const target = unwrapDdgUrl(rawHref);
    if (!target || seen.has(target)) continue;
    if (
      /duckduckgo\.com\/y\.js|bing\.com\/aclick|doubleclick|googleadservices|javascript:/i.test(
        target
      )
    )
      continue;

    const title = stripHtml(inner).slice(0, 180);
    if (title.length < 2 || /^[\d.\s]+$/.test(title)) continue;

    const after = html.slice(
      m.index + m[0].length,
      m.index + m[0].length + 700
    );
    const snippet = stripHtml(after).slice(0, 340);

    seen.add(target);
    hits.push({ title, url: target, snippet, query });
  }
  return hits;
}

/** Wikipedia opensearch → page summary */
async function wikiSearchExtract(
  name: string,
  lang: "en" | "zh"
): Promise<{ extract: string; title: string; url: string } | null> {
  const cleaned = cleanCompanyName(name)
    .replace(/有限公司|股份有限公司|一人有限公司/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < 2) return null;

  try {
    const openUrl = `https://${lang}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(cleaned)}&limit=6&namespace=0&format=json`;
    const openRes = await fetch(openUrl, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!openRes.ok) return null;
    const openData = (await openRes.json()) as [
      string,
      string[],
      string[],
      string[],
    ];
    const titles = openData[1] || [];
    const urls = openData[3] || [];

    for (let i = 0; i < titles.length; i++) {
      const t = titles[i];
      const pageUrl = urls[i];
      if (!t) continue;
      const sumUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t.replace(/ /g, "_"))}`;
      const sumRes = await fetch(sumUrl, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(7000),
      });
      if (!sumRes.ok) continue;
      const data = (await sumRes.json()) as {
        extract?: string;
        type?: string;
        title?: string;
        content_urls?: { desktop?: { page?: string } };
      };
      if (data.type === "disambiguation") continue;
      const extract = data.extract || "";
      if (extract.length < 50) continue;

      // Relevance: tokens from company name should appear in title or extract
      const tokens = cleaned
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fff\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3)
        .slice(0, 5);
      const hay = `${data.title || t} ${extract}`.toLowerCase();
      const hits = tokens.filter((w) => hay.includes(w)).length;
      if (tokens.length >= 2 && hits === 0) continue;

      // Avoid wrong geography for Macau employers
      if (
        /macau|macao|澳門|cotai|sands|galaxy|wynn|melco/i.test(cleaned) &&
        /canada|toronto|cineplex|california|united kingdom|london only/i.test(
          extract
        ) &&
        !/macau|macao|澳門|cotai|hong kong|香港/i.test(extract)
      ) {
        continue;
      }

      return {
        extract: extract.slice(0, 1200),
        title: data.title || t,
        url:
          data.content_urls?.desktop?.page ||
          pageUrl ||
          `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(t)}`,
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Pull title + meta description + first text from a public page */
async function enrichFromUrl(
  url: string,
  query: string
): Promise<WebHit | null> {
  try {
    const html = await fetchText(url, 10000);
    if (!html || html.length < 200) return null;
    const titleM = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const descM =
      html.match(
        /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
      ) ||
      html.match(
        /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i
      ) ||
      html.match(
        /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i
      );
    const title = titleM ? stripHtml(titleM[1]).slice(0, 180) : url;
    let snippet = descM ? decodeEntities(descM[1]).slice(0, 400) : "";
    if (snippet.length < 40) {
      // first substantial paragraph-like text
      const body = stripHtml(html).slice(0, 1200);
      snippet = body.slice(0, 360);
    }
    if (title.length < 2 && snippet.length < 20) return null;
    return { title, url, snippet, query };
  } catch {
    return null;
  }
}

/** Guess public URLs worth fetching for a Macau firm */
function candidateOfficialUrls(
  company: string,
  companyZh: string,
  externalUrl?: string | null
): string[] {
  const urls: string[] = [];
  if (externalUrl) {
    try {
      const u = new URL(externalUrl);
      urls.push(u.origin + "/");
      // Jobscall employer page is already useful public info
      if (
        u.hostname.includes("jobscall") ||
        u.hostname.includes("hello-jobs")
      )
        urls.push(externalUrl);
    } catch {
      /* ignore */
    }
  }

  const slug = cleanCompanyName(company)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);

  // Common patterns — only try a few
  if (slug.length >= 4) {
    urls.push(`https://www.${slug}.com/`);
    urls.push(`https://${slug}.com/`);
    urls.push(`https://${slug}.mo/`);
    urls.push(`https://www.${slug}.mo/`);
  }

  // Known short brands
  const map: Record<string, string[]> = {
    sands: ["https://www.sandschina.com/", "https://www.venetianmacao.com/"],
    galaxy: [
      "https://www.galaxyentertainment.com/en",
      "https://www.galaxymacau.com/",
    ],
    wynn: ["https://www.wynnmacau.com/", "https://www.wynnpalace.com/"],
    melco: ["https://www.melco-resorts.com/"],
    mgm: ["https://www.mgm.mo/"],
    sjm: ["https://www.sjmholdings.com/"],
  };
  const low = company.toLowerCase() + companyZh;
  for (const [k, list] of Object.entries(map)) {
    if (low.includes(k) || companyZh.includes(k)) urls.push(...list);
  }

  // A&P style
  if (/a\s*&\s*p|ap\s*investment|投資基金/i.test(company + companyZh)) {
    urls.push("https://apfund.mo/", "https://apfund.mo/about/");
  }

  return [...new Set(urls)].slice(0, 8);
}

export function buildResearchQueries(
  company: string,
  companyZh?: string
): string[] {
  const base = cleanCompanyName(company);
  const zh = cleanCompanyName(companyZh || "");
  const name = base || zh;
  if (!name) return [];

  // Avoid bare "&" breaking search engines
  const searchName = name.replace(/&/g, " and ");
  const short = searchName
    .replace(/\b(limited|ltd|lda|company|co\.?|inc\.?)\b/gi, "")
    .replace(/有限公司|股份有限公司|公司/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const alt = zh && zh !== base ? zh.replace(/&/g, " and ") : "";
  return [
    ...new Set(
      [
        `"${searchName}" Macau`,
        `"${short}" Macao`,
        `${short} Macau company OR fund OR group`,
        `${short} Macau news`,
        `${short} careers OR hiring Macau`,
        `${short} chairman OR CEO OR director`,
        alt ? `${alt} 澳門` : "",
        alt ? `${alt} 招聘` : "",
      ].filter((s) => s.length >= 4)
    ),
  ];
}

export async function researchCompanyWeb(
  company: string,
  companyZh?: string,
  opts?: { externalUrl?: string | null }
): Promise<CompanyResearchBundle> {
  const companyClean = cleanCompanyName(company);
  const companyZhClean = cleanCompanyName(companyZh || "");
  const display = companyClean || companyZhClean;
  const queries = buildResearchQueries(companyClean, companyZhClean);
  const hits: WebHit[] = [];
  const seen = new Set<string>();

  const addHit = (h: WebHit | null | undefined) => {
    if (!h?.url || seen.has(h.url)) return;
    seen.add(h.url);
    hits.push({
      title: decodeEntities(h.title),
      url: h.url,
      snippet: decodeEntities(h.snippet),
      query: h.query,
    });
  };

  // 1) DuckDuckGo multi-query (may be empty if captcha)
  const ddgJobs = queries.slice(0, 5).map((q) =>
    searchDuckDuckGoLite(q, 5).catch(() => [] as WebHit[])
  );

  // 2) Wikipedia EN + ZH
  const wikiJobs = [
    wikiSearchExtract(companyClean || companyZhClean, "en"),
    wikiSearchExtract(companyZhClean || companyClean, "zh"),
    wikiSearchExtract(companyClean, "en"),
  ];

  // 3) Direct official / listing pages
  const candidates = candidateOfficialUrls(
    companyClean,
    companyZhClean,
    opts?.externalUrl
  );
  const directJobs = candidates.map((u) =>
    enrichFromUrl(u, "direct:" + u).catch(() => null)
  );

  const [wikiResults, ddgBatches, directHits] = await Promise.all([
    Promise.all(wikiJobs),
    Promise.all(ddgJobs),
    Promise.all(directJobs),
  ]);

  let wikiExtract: string | null = null;
  for (const w of wikiResults) {
    if (!w) continue;
    if (!wikiExtract) wikiExtract = w.extract;
    addHit({
      title: w.title + " — Wikipedia",
      url: w.url,
      snippet: w.extract.slice(0, 320),
      query: "wikipedia",
    });
  }

  for (const batch of ddgBatches) {
    for (const h of batch) addHit(h);
  }
  for (const h of directHits) addHit(h);

  // 4) Enrich top DDG URLs with live page meta (better public blurbs)
  const toEnrich = hits
    .filter((h) => !h.query.startsWith("direct:") && h.snippet.length < 80)
    .slice(0, 4);
  const enriched = await Promise.all(
    toEnrich.map((h) => enrichFromUrl(h.url, h.query))
  );
  for (let i = 0; i < toEnrich.length; i++) {
    const e = enriched[i];
    if (!e || e.snippet.length < 30) continue;
    const idx = hits.findIndex((x) => x.url === toEnrich[i].url);
    if (idx >= 0) {
      hits[idx] = {
        ...hits[idx],
        title: e.title || hits[idx].title,
        snippet: e.snippet,
      };
    }
  }

  return {
    company: display,
    queries,
    hits: hits.slice(0, 22),
    wikiExtract,
    fetchedAt: new Date().toISOString(),
    note:
      hits.length > 0 || wikiExtract
        ? "Public information gathered from the open web (search results, Wikipedia, and/or company pages). Always verify before using in applications."
        : "Could not retrieve public web pages for this name right now (search may be blocked). Try the company website or commercial registry manually.",
  };
}
