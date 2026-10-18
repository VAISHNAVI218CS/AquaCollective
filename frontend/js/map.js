(function () {
  const mapElement = document.querySelector("#community-map");
  if (!mapElement) return;
  const map = L.map(mapElement, { scrollWheelZoom: false }).setView([20, 0], 2);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  const markerLayer = L.layerGroup().addTo(map);
  let heatLayer = null;
  let allReports = [];
  let activeFilter = "all";
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));
  const dateLabel = (value) => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  function getVisible() {
    if (activeFilter === "recent") {
      const cut = Date.now() - 7 * 24 * 60 * 60 * 1000;
      return allReports.filter((report) => new Date(report.created_at).getTime() >= cut);
    }
    if (activeFilter === "high") return allReports.filter((report) => report.risk_level === "high");
    return allReports;
  }
  function showVote(reportId, vote) {
    if (!localStorage.getItem(AquaApi.tokenKey)) {
      location.href = `login.html?next=${encodeURIComponent("map.html")}`;
      return;
    }
    AquaApi.post("/validations/", { report_id: reportId, vote })
      .then(() => AquaApi.get("/map/markers"))
      .then((reports) => { allReports = reports; render(); window.aquaToast("Thanks for adding your perspective."); })
      .catch((error) => window.aquaToast(error.message, "error"));
  }
  function popup(report) {
    const place = report.location_name ? escapeHtml(report.location_name) : `${report.lat.toFixed(3)}, ${report.lng.toFixed(3)}`;
    return `<div class="map-popup"><span class="status-pill status-${escapeHtml(report.risk_level)}">${escapeHtml(report.risk_level)} concern</span><h3>${place}</h3><p>${escapeHtml(report.color)} water · ${escapeHtml(report.turbidity.toLowerCase())}</p><p class="popup-detail">Smell: ${escapeHtml(report.smell)} · ${dateLabel(report.created_at)}</p><p class="popup-detail">Algae: ${escapeHtml(report.algae)} · Insects: ${escapeHtml(report.insects)}</p><p class="popup-detail">Source: ${escapeHtml(report.source_type === "Other" ? report.other_source || "Other" : report.source_type)}</p>${report.notes ? `<p>${escapeHtml(report.notes)}</p>` : ""}<div class="popup-vote"><button data-vote="${report.id}:agree">✓ Agree</button><button data-vote="${report.id}:disagree">↗ Disagree</button></div><small>Community confidence ${Math.round(report.trust_score * 100)}% · ${report.validation_count} checks</small></div>`;
  }
  function render() {
    const reports = getVisible();
    markerLayer.clearLayers();
    reports.forEach((report) => {
      const marker = L.circleMarker([report.lat, report.lng], {
        radius: 8, color: "#fff", weight: 2, fillOpacity: 0.9,
        fillColor: report.risk_level === "high" ? "#f97316" : report.risk_level === "medium" ? "#f4b544" : "#10b981"
      }).addTo(markerLayer);
      marker.bindPopup(popup(report), { maxWidth: 280 });
    });
    if (heatLayer) {
      heatLayer.setLatLngs(allReports.map((report) => [report.lat, report.lng, report.risk_level === "high" ? 0.9 : report.risk_level === "medium" ? 0.5 : 0.25]));
    }
    document.querySelector("#map-report-count").textContent = `${reports.length} observation${reports.length === 1 ? "" : "s"}`;
    const list = document.querySelector("#map-report-list");
    if (!reports.length) {
      list.innerHTML = '<div class="empty-state"><span>⌁</span><h3>No observations here yet</h3><p>Be the first to share a local water observation.</p><a href="report.html" class="text-link">Share an observation →</a></div>';
    } else {
      list.innerHTML = reports.slice(0, 14).map((report) => `<button class="report-list-item" data-report-location="${report.id}"><span class="report-risk-mark mark-${escapeHtml(report.risk_level)}"></span><span class="report-list-copy"><b>${escapeHtml(report.location_name || `${report.lat.toFixed(2)}, ${report.lng.toFixed(2)}`)}</b><small>${escapeHtml(report.color)} water · ${dateLabel(report.created_at)}</small></span><span class="report-chevron">→</span></button>`).join("");
    }
    list.querySelectorAll("[data-report-location]").forEach((button) => button.addEventListener("click", () => {
      const report = allReports.find((item) => item.id === Number(button.dataset.reportLocation));
      if (report) map.setView([report.lat, report.lng], 14);
      markerLayer.eachLayer((marker) => {
        if (report && marker.getLatLng().lat === report.lat && marker.getLatLng().lng === report.lng) marker.openPopup();
      });
    }));
    document.querySelectorAll("[data-vote]").forEach((button) => button.addEventListener("click", () => {
      const [id, vote] = button.dataset.vote.split(":");
      showVote(Number(id), vote);
    }));
  }
  document.querySelectorAll("[data-map-filter]").forEach((button) => button.addEventListener("click", () => {
    activeFilter = button.dataset.mapFilter;
    document.querySelectorAll("[data-map-filter]").forEach((item) => item.classList.toggle("active", item === button));
    render();
  }));
  document.querySelector("#map-toggle-heat")?.addEventListener("click", (event) => {
    if (!heatLayer) {
      heatLayer = L.heatLayer([], { radius: 30, blur: 22, maxZoom: 12 });
      heatLayer.setLatLngs(allReports.map((report) => [report.lat, report.lng, report.risk_level === "high" ? 0.9 : report.risk_level === "medium" ? 0.5 : 0.25]));
    }
    if (map.hasLayer(heatLayer)) {
      map.removeLayer(heatLayer);
      event.currentTarget.textContent = "Show activity heat";
      event.currentTarget.classList.remove("active");
    } else {
      heatLayer.addTo(map);
      event.currentTarget.textContent = "Hide activity heat";
      event.currentTarget.classList.add("active");
    }
  });
  document.querySelector("#map-export-all")?.addEventListener("click", () => {
    AquaApi.download("/research/export", "aquacollective-anonymized.csv")
      .then(() => window.aquaToast("Your community dataset is ready."))
      .catch((error) => window.aquaToast(error.message, "error"));
  });
  AquaApi.get("/map/markers").then((reports) => {
    allReports = reports;
    render();
    if (reports.length) {
      const bounds = L.latLngBounds(reports.map((report) => [report.lat, report.lng]));
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 12 });
    }
  }).catch((error) => {
    document.querySelector("#map-report-count").textContent = "Couldn’t load observations";
    document.querySelector("#map-report-list").innerHTML = `<div class="empty-state"><h3>Map unavailable</h3><p>${escapeHtml(error.message)}</p><button class="text-link" onclick="location.reload()">Try again →</button></div>`;
  });
  document.addEventListener("click", (event) => {
    if (event.target.matches(".leaflet-popup [data-vote]")) {
      const [id, vote] = event.target.dataset.vote.split(":");
      showVote(Number(id), vote);
    }
  });
})();
