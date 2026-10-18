(function () {
  const authPrompt = document.querySelector("#dashboard-auth-prompt");
  const citizenDashboard = document.querySelector("#citizen-dashboard");
  const researcherDashboard = document.querySelector("#researcher-dashboard");
  const token = localStorage.getItem(AquaApi.tokenKey);
  if (!token) {
    authPrompt.classList.remove("hidden");
    return;
  }
  initializeDashboard().catch((error) => {
    authPrompt.classList.remove("hidden");
    if (error.status === 401) {
      AquaApi.clearToken();
      localStorage.removeItem("aqua_user");
      localStorage.removeItem("aqua_role");
      return;
    }
    authPrompt.querySelector("h2").textContent = "Your dashboard couldn’t load.";
    authPrompt.querySelector("p").textContent = error.message;
    authPrompt.querySelector("a").classList.add("hidden");
  });

  async function initializeDashboard() {
    const user = await AquaApi.get("/auth/me");
    localStorage.setItem("aqua_user", JSON.stringify(user));
    localStorage.setItem("aqua_role", user.role);
    const isResearcher = user.role === "researcher" || user.role === "admin";
    document.querySelector("#dashboard-greeting").textContent = isResearcher
      ? "Researcher dashboard"
      : `Hello, ${user.name.split(" ")[0]}.`;

    if (isResearcher) {
      document.querySelector("#dashboard-eyebrow").textContent = "RESEARCH WORKSPACE";
      document.querySelector("#dashboard-description").textContent = "Explore aggregate observations and anonymized community data.";
      document.querySelector(".citizen-dashboard-actions").classList.add("hidden");
      researcherDashboard.classList.remove("hidden");
      const stats = await AquaApi.get("/research/stats");
      document.querySelector("#researcher-total").textContent = stats.total_reports.toLocaleString();
      document.querySelector("#researcher-verified").textContent = stats.verified_reports.toLocaleString();
      document.querySelector("#researcher-high-risk").textContent = stats.high_risk_reports.toLocaleString();
      document.querySelector("#researcher-trust").textContent = `${Math.round(stats.average_trust * 100)}%`;
      return;
    }

    const [reports, community] = await Promise.all([
      AquaApi.get("/reports/mine"),
      AquaApi.get("/reports/?limit=1000")
    ]);
    citizenDashboard.classList.remove("hidden");
    document.querySelector("#metric-total").textContent = reports.length;
    document.querySelector("#metric-verified").textContent = reports.filter((report) => report.status === "validated").length;
    document.querySelector("#metric-members").textContent = community.length;
    document.querySelector("#metric-places").textContent = new Set(reports.map((report) => `${report.lat.toFixed(2)},${report.lng.toFixed(2)}`)).size;
    renderReports(reports);
    renderCharts(reports);
    document.querySelector("#export-personal").addEventListener("click", () => downloadPersonal(reports));
  }
  function renderReports(reports) {
    const container = document.querySelector("#personal-report-list");
    if (!reports.length) {
      container.innerHTML = '<div class="empty-state"><span>⌁</span><h3>Your first observation is waiting.</h3><p>Help your community notice what is changing.</p><a class="button button-primary" href="report.html">Share an observation →</a></div>';
      return;
    }
    container.innerHTML = reports.map((report) => `<article class="personal-report"><span class="report-risk-mark mark-${safe(report.risk_level)}"></span><div class="personal-report-body"><h3>${safe(report.location_name || `${report.lat.toFixed(3)}, ${report.lng.toFixed(3)}`)}</h3><p>${safe(report.color)} water · ${safe(report.smell)} smell · ${safe(report.turbidity.toLowerCase())}</p><small>Algae: ${safe(report.algae)} · Insects: ${safe(report.insects)} · Source: ${safe(report.source_type === "Other" ? report.other_source || "Other" : report.source_type)} · ${new Date(report.created_at).toLocaleString()}</small></div><span class="status-pill status-${safe(report.status)}">${safe(report.status)}</span></article>`).join("");
  }
  function safe(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));
  }
  function renderCharts(reports) {
    if (!window.Chart) return;
    const monthCounts = new Map();
    reports.forEach((report) => {
      const date = new Date(report.created_at);
      const label = date.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
      monthCounts.set(label, (monthCounts.get(label) || 0) + 1);
    });
    const months = [...monthCounts.keys()].slice(-8);
    new Chart(document.querySelector("#activity-chart"), {
      type: "bar",
      data: { labels: months.length ? months : ["No activity"], datasets: [{ data: months.map((month) => monthCounts.get(month)), backgroundColor: "#0d9488", borderRadius: 7, maxBarThickness: 38 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: "#edf2f1" } }, x: { grid: { display: false } } } }
    });
    const colors = ["Clear", "Yellow", "Brown", "Green", "Other"];
    const colorCounts = colors.map((color) => reports.filter((report) => report.color === color).length);
    new Chart(document.querySelector("#quality-chart"), {
      type: "doughnut",
      data: { labels: colors, datasets: [{ data: colorCounts.some(Boolean) ? colorCounts : [1, 0, 0, 0, 0], backgroundColor: ["#52c6bb", "#f4c96c", "#a86f50", "#79b98b", "#a9b4b2"], borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: "67%", plugins: { legend: { position: "bottom", labels: { usePointStyle: true, padding: 16 } } } }
    });
  }
  function downloadPersonal(reports) {
    if (!reports.length) {
      window.aquaToast("You don’t have any observations to download yet.", "error");
      return;
    }
    const headers = ["Date", "Time", "Latitude", "Longitude", "Location", "Color", "Smell", "Taste", "Turbidity", "Algae / Green growth", "Unusual insects", "Source type", "Other source", "Notes", "Trust Score", "Status"];
    const quote = (value, untrustedText = false) => {
      const text = String(value ?? "");
      return `"${(untrustedText && /^\s*[=+\-@]/.test(text) ? "'" : "") + text.replaceAll('"', '""')}"`;
    };
    const rows = reports.map((report) => {
      const createdAt = report.created_at;
      const date = new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(createdAt) ? createdAt : `${createdAt}Z`);
      return [date.toISOString().slice(0, 10), date.toISOString().slice(11, 19) + " UTC", report.lat, report.lng, report.location_name, report.color, report.smell, report.taste, report.turbidity, report.algae, report.insects, report.source_type, report.other_source, report.notes, report.trust_score, report.status].map((value, index) => quote(value, [4, 12, 13].includes(index)));
    });
    const blobUrl = URL.createObjectURL(new Blob(["\ufeff", [headers.map(quote).join(","), ...rows.map((row) => row.join(","))].join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = blobUrl; link.download = "my-aquacollective-observations.csv"; link.click(); URL.revokeObjectURL(blobUrl);
  }
})();
