const ext = globalThis.browser ?? globalThis.chrome;

const statusEl = document.getElementById("status");
const refreshBtn = document.getElementById("refreshBtn");

async function loadStatus(forceRefresh = false) {
  refreshBtn.disabled = true;
  if (forceRefresh) {
    statusEl.textContent = "Lade Daten von cashback-optimizer.de…";
  }

  try {
    const response = await ext.runtime.sendMessage({
      type: "GET_CASHBACK_DATA",
      forceRefresh
    });

    if (!response?.ok) {
      statusEl.textContent = `Fehler: ${response?.error || "Unbekannt"}`;
      return;
    }

    const { shopCount, updatedAt } = response.data;
    const dateStr = new Date(updatedAt).toLocaleString("de-DE");
    statusEl.innerHTML = `<strong>${shopCount}</strong> Shops gecacht<br>Stand: ${dateStr}`;
  } catch (err) {
    statusEl.textContent = `Fehler: ${err.message}`;
  } finally {
    refreshBtn.disabled = false;
  }
}

refreshBtn.addEventListener("click", () => loadStatus(true));
loadStatus(false);
