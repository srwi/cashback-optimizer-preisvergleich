const ext = globalThis.browser ?? globalThis.chrome;

let activeTooltip = null;
let hideTimeout = null;

function foldUmlauts(str) {
  return str
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

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

function cleanIdealoShopName(raw) {
  return raw
    .replace(/\s*-\s*Shop\s+aus\s+.*$/i, "")
    .replace(/\s*Logo$/i, "")
    .trim();
}

/**
 * Extracts the shop name from an Idealo offer row.
 */
function extractIdealoShopName(offerRow) {
  const logoLink = offerRow.querySelector(
    '.productOffers-listItemOfferShopV2LogoLink[data-shop-name], [data-shop-name]'
  );
  if (logoLink?.dataset?.shopName) {
    const cleaned = cleanIdealoShopName(logoLink.dataset.shopName);
    if (cleaned) return cleaned;
  }

  const logoImg = offerRow.querySelector(
    '.productOffers-listItemOfferShopV2LogoImage, [class*="Shop"][class*="Logo"] img, img[alt]'
  );
  if (logoImg?.alt) {
    const cleaned = cleanIdealoShopName(logoImg.alt);
    if (cleaned) return cleaned;
  }

  const shopTextEl = offerRow.querySelector(
    '.productOffers-listItemOfferShopName, [class*="OfferShopName"], [data-testid*="shop"]'
  );
  if (shopTextEl?.textContent) {
    const cleaned = cleanIdealoShopName(shopTextEl.textContent);
    if (cleaned) return cleaned;
  }

  const shopLink = offerRow.querySelector(
    'a[class*="Shop"][title], a[class*="Shop"][aria-label]'
  );
  if (shopLink) {
    const attr = shopLink.getAttribute("title") || shopLink.getAttribute("aria-label") || "";
    const cleaned = cleanIdealoShopName(attr.replace(/^zum\s+Shop\s+/i, ""));
    if (cleaned) return cleaned;
  }

  return null;
}

function findShopRecord(shopName, shopsByKey) {
  if (!shopName || !shopsByKey) return null;

  for (const key of getShopMatchKeys(shopName)) {
    if (shopsByKey[key]) return shopsByKey[key];
  }

  // Fallback: first word / main brand name (e.g. "OTTO Market" -> "otto")
  const norm = normalizeShopName(shopName);
  const firstWord = norm.split(" ")[0];
  if (firstWord && firstWord.length >= 3 && shopsByKey[firstWord]) {
    return shopsByKey[firstWord];
  }

  return null;
}

function getBadgeTypeClass(type) {
  const lower = type.toLowerCase();
  if (lower.includes("cashback")) return "cbo-badge--cashback";
  if (lower.includes("gutschein")) return "cbo-badge--voucher";
  if (lower.includes("rabatt")) return "cbo-badge--discount";
  return "cbo-badge--other";
}

function removeTooltip() {
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
  if (activeTooltip) {
    activeTooltip.remove();
    activeTooltip = null;
  }
}

function scheduleHideTooltip() {
  if (hideTimeout) clearTimeout(hideTimeout);
  hideTimeout = setTimeout(removeTooltip, 120);
}

function showTooltip(anchorEl, record) {
  removeTooltip();

  const tooltip = document.createElement("div");
  tooltip.className = "cbo-tooltip";

  const title = document.createElement("div");
  title.className = "cbo-tooltip-title";
  title.textContent = `${record.name} – Cashback & Rabatte`;
  tooltip.appendChild(title);

  const list = document.createElement("div");
  list.className = "cbo-tooltip-list";

  for (const entry of record.entries) {
    const item = document.createElement("div");
    item.className = "cbo-tooltip-item";

    const row = document.createElement("div");
    row.className = "cbo-tooltip-row";

    const typeTag = document.createElement("span");
    typeTag.className = `cbo-badge ${getBadgeTypeClass(entry.type)}`;
    typeTag.textContent = entry.type;

    const provider = document.createElement("span");
    provider.className = "cbo-tooltip-provider";
    provider.textContent = entry.provider;

    const value = document.createElement("span");
    value.className = "cbo-tooltip-value";
    value.textContent = entry.value;

    row.appendChild(typeTag);
    row.appendChild(provider);
    row.appendChild(value);
    item.appendChild(row);

    if (entry.tooltip) {
      const hint = document.createElement("div");
      hint.className = "cbo-tooltip-hint";
      hint.textContent = entry.tooltip;
      item.appendChild(hint);
    }

    list.appendChild(item);
  }

  tooltip.appendChild(list);

  const footer = document.createElement("div");
  footer.className = "cbo-tooltip-footer";
  footer.append("Daten von ");

  const sourceLink = document.createElement("a");
  sourceLink.href = "https://cashback-optimizer.de/";
  sourceLink.target = "_blank";
  sourceLink.rel = "noopener noreferrer";
  sourceLink.textContent = "cashback-optimizer.de";
  sourceLink.addEventListener("click", (e) => e.stopPropagation());

  footer.appendChild(sourceLink);
  footer.append(
    " – falls du sparen konntest, unterstütze die Seite gerne mit einer Spende."
  );
  tooltip.appendChild(footer);

  tooltip.addEventListener("mouseenter", () => {
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
  });
  tooltip.addEventListener("mouseleave", scheduleHideTooltip);

  document.body.appendChild(tooltip);
  activeTooltip = tooltip;

  // Position relative to the link (fixed so nothing gets clipped by overflow:hidden)
  const rect = anchorEl.getBoundingClientRect();
  const ttRect = tooltip.getBoundingClientRect();

  let top = rect.bottom + 6;
  if (top + ttRect.height > window.innerHeight - 8) {
    top = Math.max(8, rect.top - ttRect.height - 6);
  }

  let left = rect.left;
  if (left + ttRect.width > window.innerWidth - 12) {
    left = Math.max(8, window.innerWidth - ttRect.width - 12);
  }

  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${left}px`;
}

function formatGermanNumber(num) {
  return Number.isInteger(num)
    ? String(num)
    : num.toFixed(2).replace(/\.?0+$/, "").replace(".", ",");
}

function getBestSummaryLabel(entries) {
  let maxPct = null;
  let maxEur = null;

  for (const entry of entries) {
    const val = entry.value || "";
    const pctMatch = val.match(/(\d+(?:[.,]\d+)?)\s*%/);
    if (pctMatch) {
      const n = parseFloat(pctMatch[1].replace(",", "."));
      if (!Number.isNaN(n) && (maxPct === null || n > maxPct)) {
        maxPct = n;
      }
    }

    const eurMatch = val.match(/(\d+(?:[.,]\d+)?)\s*€/);
    if (eurMatch) {
      const n = parseFloat(eurMatch[1].replace(",", "."));
      if (!Number.isNaN(n) && (maxEur === null || n > maxEur)) {
        maxEur = n;
      }
    }
  }

  if (maxPct !== null) {
    return `bis ${formatGermanNumber(maxPct)}%`;
  }
  if (maxEur !== null) {
    return `bis ${formatGermanNumber(maxEur)} €`;
  }
  return "verfügbar";
}

function createCashbackLink(record) {
  const wrap = document.createElement("div");
  wrap.className = "cbo-shop-wrap";

  if (!record || record.entries.length === 0) {
    const empty = document.createElement("span");
    empty.className = "cbo-shop-empty";
    empty.textContent = "kein Cashback verfügbar";
    wrap.appendChild(empty);
    return wrap;
  }

  const count = record.entries.length;
  const link = document.createElement("a");
  link.className = "cbo-shop-link";
  link.href = `https://cashback-optimizer.de?filter=${encodeURIComponent(record.name)}`;
  link.target = "_blank";
  link.rel = "noopener noreferrer";

  const mainLabel = document.createElement("span");
  mainLabel.className = "cbo-shop-link-main";
  mainLabel.textContent = getBestSummaryLabel(record.entries);

  const subLabel = document.createElement("span");
  subLabel.className = "cbo-shop-link-sub";
  subLabel.textContent = `${count} ${count === 1 ? "Option" : "Optionen"}`;

  link.appendChild(mainLabel);
  link.appendChild(subLabel);

  link.addEventListener("mouseenter", () => showTooltip(link, record));
  link.addEventListener("mouseleave", scheduleHideTooltip);
  link.addEventListener("click", (e) => e.stopPropagation());

  wrap.appendChild(link);
  return wrap;
}

function extractGeizhalsShopName(offerRow) {
  const merchantEl = offerRow.querySelector("[data-merchant-name]");
  if (merchantEl?.dataset?.merchantName) {
    return merchantEl.dataset.merchantName.trim();
  }

  const caption = offerRow.querySelector(".merchant__logo-caption");
  if (caption?.textContent) {
    return caption.textContent.trim();
  }

  return null;
}

function extractBilligerShopName(offerRow) {
  const shopImg = offerRow.querySelector('img[alt^="Shop "]');
  if (shopImg?.alt) {
    return shopImg.alt.replace(/^Shop\s+/i, "").trim();
  }

  const infoBtn = offerRow.querySelector("[data-open-shop-info][aria-label]");
  if (infoBtn) {
    return infoBtn.getAttribute("aria-label").replace(/\s*Shop-Infos$/i, "").trim();
  }

  return null;
}

function extractGuenstigerShopName(offerRow) {
  if (offerRow.dataset?.sellertext) {
    return offerRow.dataset.sellertext.trim();
  }

  const logoImg = offerRow.querySelector(".sellerLogo img[alt]");
  if (logoImg?.alt) {
    return logoImg.alt.trim();
  }

  return null;
}

function syncDarkModeClass() {
  const bg = getComputedStyle(document.body).backgroundColor;
  const match = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return;
  const [, r, g, b] = match.map(Number);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  document.documentElement.classList.toggle("cbo-dark", luminance < 0.5);
}

function getSiteAdapter() {
  const host = location.hostname;

  if (/^(?:.*\.)?(geizhals\.(?:de|at)|gh\.de)$/.test(host)) {
    return {
      rowSelector: "div.offer",
      extractShopName: extractGeizhalsShopName,
      placeWidget(row, widget) {
        widget.classList.add("cbo-shop-wrap--geizhals");
        const clickout = row.querySelector(".offer__clickout");
        if (clickout) {
          clickout.insertAdjacentElement("afterend", widget);
          return;
        }
        const priceCell = row.querySelector(".offer__price");
        if (priceCell) priceCell.appendChild(widget);
      }
    };
  }

  if (host.includes("billiger.de")) {
    return {
      rowSelector: "[data-offer-row]",
      extractShopName: extractBilligerShopName,
      placeWidget(row, widget) {
        widget.classList.add("cbo-shop-wrap--billiger");
        const clickoutLink = row.querySelector(".clickout-link");
        if (clickoutLink) {
          clickoutLink.appendChild(widget);
          return;
        }
        const wrapper = row.querySelector(".clickout-wrapper");
        if (wrapper) wrapper.appendChild(widget);
      }
    };
  }

  if (host.includes("guenstiger.de")) {
    return {
      rowSelector: ".offerListHoverContainer",
      extractShopName: extractGuenstigerShopName,
      placeWidget(row, widget) {
        widget.classList.add("cbo-shop-wrap--guenstiger");
        const goToBtn = row.querySelector(".goToButton");
        if (goToBtn) {
          goToBtn.appendChild(widget);
          return;
        }
        const ctaCol = row.querySelector(".zumPriceContainer");
        if (ctaCol) ctaCol.appendChild(widget);
      }
    };
  }

  return {
    rowSelector: "li.productOffers-listItem",
    extractShopName: extractIdealoShopName,
    placeWidget(row, widget) {
      const ctaCol = row.querySelector('[data-offerlist-column="leadoutbutton"]');
      if (ctaCol) {
        ctaCol.appendChild(widget);
        return;
      }
      const shopBlock = row.querySelector(
        '.productOffers-listItemOfferShopV2Block, [data-offerlist-column="shop"]'
      );
      if (shopBlock) shopBlock.appendChild(widget);
    }
  };
}

function processOfferRows(shopsByKey, adapter) {
  const rows = document.querySelectorAll(adapter.rowSelector);

  for (const row of rows) {
    if (row.dataset.cboProcessed === "1") continue;
    row.dataset.cboProcessed = "1";

    const shopName = adapter.extractShopName(row);
    const record = findShopRecord(shopName, shopsByKey);

    const widget = createCashbackLink(record);
    adapter.placeWidget(row, widget);
  }
}

async function init() {
  try {
    const response = await ext.runtime.sendMessage({ type: "GET_CASHBACK_DATA" });
    if (!response?.ok || !response.data?.shopsByKey) {
      console.warn(
        "[Cashback Optimizer] Failed to load data:",
        response?.error
      );
      return;
    }

    const { shopsByKey } = response.data;
    const adapter = getSiteAdapter();
    syncDarkModeClass();
    processOfferRows(shopsByKey, adapter);

    const observer = new MutationObserver(() => {
      syncDarkModeClass();
      processOfferRows(shopsByKey, adapter);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("scroll", removeTooltip, { passive: true });
  } catch (err) {
    console.warn("[Cashback Optimizer] Error:", err);
  }
}

init();
