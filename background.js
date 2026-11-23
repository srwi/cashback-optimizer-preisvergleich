const ext = globalThis.browser ?? globalThis.chrome;

const CBO_URL = "https://cashback-optimizer.de/";
const CACHE_KEY = "cboCache";
const CACHE_VERSION = 2;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

let inFlightFetch = null;

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&euro;/g, "€")
    .replace(/&nbsp;/g, " ");
}

function stripTags(html) {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function foldUmlauts(str) {
  return str
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

/**
 * Normalizes shop names for matching between price comparison sites and cashback-optimizer.de.
 */
function normalizeShopName(name) {
  return foldUmlauts(name.toLowerCase())
    .replace(/^www\./, "")
    .replace(/\.(de|com|eu|at|ch|net|org|shop|info|biz)$/i, "")
    .replace(/[-_.\s]+/g, " ")
    .trim();
}

function stripGenericSuffixes(norm) {
  let current = norm;
  const suffixRe =
    /\s+(?:ag|gmbh|kg|ohg|ug|elektronik|electronics|shop|store|online|market|markt|deutschland|versand|group|gruppe|de|at|ch)$/;
  while (suffixRe.test(current)) {
    const next = current.replace(suffixRe, "").trim();
    if (next.length < 4) break;
    current = next;
  }
  return current;
}

function getShopMatchKeys(name) {
  const keys = new Set();
  const exact = name.toLowerCase().trim();
  if (exact) keys.add(exact);

  const norm = normalizeShopName(name);
  if (norm) {
    keys.add(norm);
    const compactNorm = norm.replace(/[^a-z0-9]/g, "");
    if (compactNorm) keys.add(compactNorm);

    const stripped = stripGenericSuffixes(norm);
    if (stripped) {
      keys.add(stripped);
      const compactStripped = stripped.replace(/[^a-z0-9]/g, "");
      if (compactStripped) keys.add(compactStripped);
    }
  }

  return [...keys];
}

/**
 * Parses the static HTML from cashback-optimizer.de without DOMParser
 * (works in both Chrome Service Workers and Firefox Event Pages).
 */
function parseCashbackOptimizerHtml(html) {
  const shopsStart = html.indexOf('<div class="shops">');
  if (shopsStart === -1) {
    throw new Error("Shops container not found in HTML.");
  }

  const shopsHtml = html.slice(shopsStart);
  const blocks = shopsHtml.split('<div class="shop-area">').slice(1);
  const shopsByKey = {};
  let shopCount = 0;

  for (const block of blocks) {
    const headerMatch = block.match(
      /<div class="shop-area-header filter-tag">([\s\S]*?)<\/div>/
    );
    if (!headerMatch) continue;

    const shopName = stripTags(headerMatch[1]);
    if (!shopName) continue;

    const entries = [];
    let currentType = "Sonstiges";
    let pendingItemName = null;

    // Extract all relevant fields in order
    const fieldRegex =
      /<div class="(type-area|item-name|item-value)">([\s\S]*?)<\/div>(?:\s*<\/div>)?/g;
    let match;
    while ((match = fieldRegex.exec(block)) !== null) {
      const cls = match[1];
      const rawContent = match[2];

      if (cls === "type-area") {
        currentType = stripTags(rawContent) || "Sonstiges";
        pendingItemName = null;
      } else if (cls === "item-name") {
        pendingItemName = stripTags(rawContent);
      } else if (cls === "item-value" && pendingItemName) {
        // Extract tooltip text separately so the main value stays clean
        const tooltipMatch = rawContent.match(
          /<span class="tooltip-text"[^>]*>([\s\S]*?)<\/span>/
        );
        const tooltip = tooltipMatch ? stripTags(tooltipMatch[1]) : "";
        const valueWithoutTooltip = rawContent.replace(
          /<span class="tooltip-text"[^>]*>[\s\S]*?<\/span>/g,
          ""
        );
        const value = stripTags(valueWithoutTooltip);

        if (value) {
          entries.push({
            type: currentType,
            provider: pendingItemName,
            value,
            tooltip
          });
        }
        pendingItemName = null;
      }
    }

    if (entries.length === 0) continue;

    const shopRecord = {
      name: shopName,
      entries
    };

    const exactKey = shopName.toLowerCase().trim();
    shopsByKey[exactKey] = shopRecord;
    for (const key of getShopMatchKeys(shopName)) {
      if (!shopsByKey[key]) {
        shopsByKey[key] = shopRecord;
      }
    }
    shopCount++;
  }

  return {
    version: CACHE_VERSION,
    updatedAt: Date.now(),
    shopCount,
    shopsByKey
  };
}

async function fetchAndCacheData() {
  if (inFlightFetch) {
    return inFlightFetch;
  }

  inFlightFetch = (async () => {
    const response = await fetch(CBO_URL, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} while fetching ${CBO_URL}`);
    }
    const html = await response.text();
    const parsed = parseCashbackOptimizerHtml(html);
    await ext.storage.local.set({ [CACHE_KEY]: parsed });
    return parsed;
  })();

  try {
    return await inFlightFetch;
  } finally {
    inFlightFetch = null;
  }
}

async function getCashbackData(forceRefresh = false) {
  if (!forceRefresh) {
    const stored = await ext.storage.local.get(CACHE_KEY);
    const cache = stored?.[CACHE_KEY];
    if (
      cache &&
      cache.version === CACHE_VERSION &&
      Date.now() - cache.updatedAt < CACHE_TTL_MS
    ) {
      return cache;
    }
  }
  return fetchAndCacheData();
}

ext.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_CASHBACK_DATA") {
    getCashbackData(Boolean(message.forceRefresh))
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // Keep message channel open for async response
  }
});
