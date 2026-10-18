(function () {
  const access = document.querySelector("#research-access");
  const dashboard = document.querySelector("#research-dashboard");
  const accessTitle = access.querySelector("h2");
  const accessMessage = access.querySelector("p");
  const accessLink = access.querySelector("a");
  const token = localStorage.getItem(AquaApi.tokenKey);
  let myPublications = [];
  let allPublications = [];
  let editingPublicationId = null;

  if (!token) {
    accessLink.href = "login.html?next=research.html";
    return;
  }

  initializeResearchPage().catch((error) => {
    if (error.status === 401) {
      AquaApi.clearToken();
      localStorage.removeItem("aqua_user");
      localStorage.removeItem("aqua_role");
      accessTitle.textContent = "Please log in";
      accessMessage.textContent = "Log in with your researcher account to access this workspace.";
      accessLink.href = "login.html?next=research.html";
      return;
    }
    showAccessDenied();
  });

  async function initializeResearchPage() {
    const user = await AquaApi.get("/auth/me");
    localStorage.setItem("aqua_user", JSON.stringify(user));
    localStorage.setItem("aqua_role", user.role);
    if (user.role !== "researcher" && user.role !== "admin") {
      showAccessDenied();
      return;
    }

    access.classList.add("hidden");
    dashboard.classList.remove("hidden");
    document.querySelector("#research-export").addEventListener("click", () => exportDataset("csv"));
    document.querySelector("#research-export-json").addEventListener("click", () => exportDataset("json"));
    document.querySelector("#generate-summary").addEventListener("click", generateSummary);
    document.querySelector("#compare-form").addEventListener("submit", compareLocations);
    document.querySelector("#publish-form").addEventListener("submit", submitPublication);
    document.querySelector("#publish-cancel-edit").addEventListener("click", resetPublicationForm);
    document.querySelector("#jump-publish").addEventListener("click", () => {
      document.querySelector("#publish-section").scrollIntoView({ behavior: "smooth", block: "start" });
      document.querySelector('[name="title"]').focus({ preventScroll: true });
    });
    document.querySelector("#open-collaboration").addEventListener("click", () => {
      document.querySelector("#collaboration-panel").classList.toggle("hidden");
    });
    document.querySelector("#collaboration-form").addEventListener("submit", submitCollaborationRequest);
    document.querySelector("#publication-search").addEventListener("input", renderPublicationFeed);
    document.querySelector("#publication-tag").addEventListener("change", renderPublicationFeed);

    setupSavedViews();
    await Promise.all([loadStats(), loadPublications()]);
  }

  function showAccessDenied() {
    access.classList.remove("hidden");
    dashboard.classList.add("hidden");
    accessTitle.textContent = "Access denied";
    accessMessage.textContent = "Research tools and published work are only available to researcher and administrator accounts.";
    accessLink.href = "dashboard.html";
    accessLink.innerHTML = 'Return to your dashboard <span>→</span>';
  }

  async function loadStats() {
    const stats = await AquaApi.get("/research/stats");
    document.querySelector("#research-total").textContent = stats.total_reports.toLocaleString();
    document.querySelector("#research-verified").textContent = stats.verified_reports.toLocaleString();
    document.querySelector("#research-high-risk").textContent = stats.high_risk_reports.toLocaleString();
    document.querySelector("#research-trust").textContent = `${Math.round(stats.average_trust * 100)}%`;
  }

  async function loadPublications() {
    [allPublications, myPublications] = await Promise.all([
      AquaApi.get("/research/published"),
      AquaApi.get("/research/published/my")
    ]);
    renderMyPublications();
    populatePublicationTags();
    renderPublicationFeed();
  }

  async function exportDataset(format) {
    const button = document.querySelector(format === "csv" ? "#research-export" : "#research-export-json");
    const params = getFilterParams();
    button.disabled = true;
    try {
      const suffix = params.size ? `?${params.toString()}` : "";
      const filename = format === "csv" ? "aquacollective-anonymized.csv" : "aquacollective-anonymized.json";
      await AquaApi.download(`/research/export${format === "json" ? "/json" : ""}${suffix}`, filename);
      window.aquaToast(`Your ${format.toUpperCase()} dataset is ready.`);
    } catch (error) {
      window.aquaToast(error.message, "error");
    } finally {
      button.disabled = false;
    }
  }

  async function generateSummary() {
    const button = document.querySelector("#generate-summary");
    const output = document.querySelector("#summary-output");
    button.disabled = true;
    button.textContent = "Generating…";
    output.classList.remove("hidden");
    output.textContent = "Reviewing the community dataset…";
    try {
      const summary = await AquaApi.get("/research/summary");
      output.innerHTML = `<ul>${summary.insights.map((insight) => `<li>${escapeHtml(insight)}</li>`).join("")}</ul><small>${escapeHtml(summary.caveat || "Descriptive community data only.")}</small>`;
    } catch (error) {
      output.textContent = error.message;
    } finally {
      button.disabled = false;
      button.innerHTML = 'Generate summary <span>→</span>';
    }
  }

  async function compareLocations(event) {
    event.preventDefault();
    const output = document.querySelector("#compare-output");
    const locationA = document.querySelector("#compare-location-a").value.trim();
    const locationB = document.querySelector("#compare-location-b").value.trim();
    output.classList.remove("hidden");
    output.textContent = "Comparing observations…";
    try {
      const params = new URLSearchParams({ location_a: locationA, location_b: locationB });
      const result = await AquaApi.get(`/research/compare?${params}`);
      output.innerHTML = `<div class="compare-result-card">${formatLocationComparison(result.location_a)}</div><span class="compare-center-mark">≈</span><div class="compare-result-card">${formatLocationComparison(result.location_b)}</div><p class="compare-caveat">${escapeHtml(result.caveat)}</p>`;
    } catch (error) {
      output.textContent = error.message;
    }
  }

  function formatLocationComparison(location) {
    return `<span class="eyebrow">${escapeHtml(location.query)}</span><strong>${location.observation_count.toLocaleString()}</strong><small>observations</small><div><span>Higher concern</span><b>${location.high_concern_count}</b></div><div><span>Validated</span><b>${location.validated_count}</b></div><div><span>Average confidence</span><b>${Math.round(location.average_trust * 100)}%</b></div>`;
  }

  function setupSavedViews() {
    const select = document.querySelector("#saved-view-select");
    const removeButton = document.querySelector("#delete-view");
    const readViews = () => {
      try {
        const views = JSON.parse(localStorage.getItem("aqua_research_saved_views") || "[]");
        return Array.isArray(views) ? views : [];
      } catch (_) {
        return [];
      }
    };
    function renderViews(selectedId = "") {
      const views = readViews();
      select.innerHTML = '<option value="">Choose a saved view…</option>' + views.map((view) => `<option value="${escapeHtml(view.id)}">${escapeHtml(view.name)}</option>`).join("");
      select.value = selectedId;
      removeButton.disabled = !selectedId;
    }
    document.querySelector("#save-view").addEventListener("click", () => {
      const name = window.prompt("Name this saved filter view:");
      if (!name || !name.trim()) return;
      const views = readViews();
      const view = { id: crypto.randomUUID(), name: name.trim().slice(0, 60), filters: currentFilters() };
      views.push(view);
      localStorage.setItem("aqua_research_saved_views", JSON.stringify(views));
      renderViews(view.id);
      window.aquaToast("Filter view saved in this browser.");
    });
    select.addEventListener("change", () => {
      const view = readViews().find((item) => item.id === select.value);
      if (!view) {
        removeButton.disabled = true;
        return;
      }
      applyFilters(view.filters);
      removeButton.disabled = false;
    });
    removeButton.addEventListener("click", () => {
      const selectedId = select.value;
      const views = readViews().filter((view) => view.id !== selectedId);
      localStorage.setItem("aqua_research_saved_views", JSON.stringify(views));
      renderViews();
    });
    renderViews();
  }

  function currentFilters() {
    return {
      q: document.querySelector("#research-search").value,
      status: document.querySelector("#research-status").value,
      risk: document.querySelector("#research-risk").value
    };
  }

  function applyFilters(filters) {
    document.querySelector("#research-search").value = filters.q || "";
    document.querySelector("#research-status").value = filters.status || "";
    document.querySelector("#research-risk").value = filters.risk || "";
  }

  function getFilterParams() {
    const params = new URLSearchParams();
    const filters = currentFilters();
    if (filters.q.trim()) params.set("q", filters.q.trim());
    if (filters.status) params.set("status", filters.status);
    if (filters.risk) params.set("risk", filters.risk);
    return params;
  }

  async function submitPublication(event) {
    event.preventDefault();
    const form = document.querySelector("#publish-form");
    const button = document.querySelector("#publish-submit");
    const progress = document.querySelector("#publish-progress");
    const values = new FormData(form);
    const file = values.get("pdf");
    let fileUrl = editingPublicationId
      ? myPublications.find((publication) => publication.id === editingPublicationId)?.file_url || null
      : null;
    button.disabled = true;
    progress.textContent = "Preparing your research…";
    progress.className = "form-message";
    try {
      if (file && file.size > 0) {
        progress.textContent = "Uploading your PDF…";
        const uploadForm = new FormData();
        uploadForm.append("file", file);
        const uploaded = await AquaApi.post("/research/publish/file", uploadForm);
        fileUrl = uploaded.file_url;
      }
      const link = String(values.get("link") || "").trim() || null;
      const payload = {
        title: values.get("title"),
        abstract: values.get("abstract"),
        content: values.get("content"),
        location: String(values.get("location") || "").trim() || null,
        tags: String(values.get("tags") || "").split(",").map((tag) => tag.trim()).filter(Boolean),
        file_url: fileUrl,
        link,
        research_date: values.get("research_date")
      };
      if (editingPublicationId) {
        await AquaApi.put(`/research/published/${editingPublicationId}`, payload);
        window.aquaToast("Your research publication was updated.");
      } else {
        await AquaApi.post("/research/publish", payload);
        window.aquaToast("Your research is now published.");
      }
      resetPublicationForm();
      await loadPublications();
    } catch (error) {
      progress.textContent = error.message;
      progress.classList.add("is-error");
    } finally {
      button.disabled = false;
    }
  }

  function resetPublicationForm() {
    editingPublicationId = null;
    document.querySelector("#publish-form").reset();
    document.querySelector("#publish-form-title").textContent = "Publish research";
    document.querySelector("#publish-submit").innerHTML = 'Publish research <span>↗</span>';
    document.querySelector("#publish-cancel-edit").classList.add("hidden");
    const progress = document.querySelector("#publish-progress");
    progress.textContent = "";
    progress.className = "form-message";
  }

  function renderMyPublications() {
    const container = document.querySelector("#my-publication-feed");
    document.querySelector("#my-publication-count").textContent = `${myPublications.length} publication${myPublications.length === 1 ? "" : "s"}`;
    if (!myPublications.length) {
      container.innerHTML = '<div class="empty-state publication-empty"><span>✳</span><h3>Your research story starts here.</h3><p>Share your findings with the AquaCollective research community.</p></div>';
      return;
    }
    container.innerHTML = myPublications.map((publication) => `<div class="my-publication-item">${publicationCard(publication, true)}<div class="publication-owner-actions"><button class="button button-outline" data-edit-publication="${publication.id}">Edit</button><button class="button button-quiet danger-button" data-delete-publication="${publication.id}">Delete</button></div></div>`).join("");
    container.querySelectorAll("[data-edit-publication]").forEach((button) => button.addEventListener("click", () => editPublication(Number(button.dataset.editPublication))));
    container.querySelectorAll("[data-delete-publication]").forEach((button) => button.addEventListener("click", () => deletePublication(Number(button.dataset.deletePublication))));
    attachPublicationActions(container, myPublications);
  }

  function populatePublicationTags() {
    const tagSelect = document.querySelector("#publication-tag");
    const tags = [...new Set(allPublications.flatMap((publication) => publication.tags))].sort((a, b) => a.localeCompare(b));
    tagSelect.innerHTML = '<option value="">All tags</option>' + tags.map((tag) => `<option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`).join("");
  }

  function renderPublicationFeed() {
    const container = document.querySelector("#publication-feed");
    const query = document.querySelector("#publication-search").value.trim().toLocaleLowerCase();
    const tag = document.querySelector("#publication-tag").value.toLocaleLowerCase();
    const visible = allPublications.filter((publication) => {
      const searchable = [publication.title, publication.author_name, publication.abstract, publication.content, publication.location || "", ...publication.tags].join(" ").toLocaleLowerCase();
      return (!query || searchable.includes(query)) && (!tag || publication.tags.some((item) => item.toLocaleLowerCase() === tag));
    });
    document.querySelector("#publication-count").textContent = `${visible.length} result${visible.length === 1 ? "" : "s"}`;
    document.querySelector("#publication-empty").classList.toggle("hidden", visible.length > 0);
    container.innerHTML = visible.map((publication) => publicationCard(publication, false)).join("");
    attachPublicationActions(container, visible);
  }

  function publicationCard(publication, ownWork) {
    const tags = publication.tags.map((tag) => `<span class="research-tag">${escapeHtml(tag)}</span>`).join("");
    return `<article class="publication-card">
      <div class="publication-card-top"><span class="publication-type">${ownWork ? "YOUR RESEARCH" : "COMMUNITY RESEARCH"}</span><time>${formatDate(publication.research_date)}</time></div>
      <h3>${escapeHtml(publication.title)}</h3>
      <p class="publication-author">By ${escapeHtml(publication.author_name)}${publication.location ? ` · ${escapeHtml(publication.location)}` : ""}</p>
      <p class="publication-abstract">${escapeHtml(publication.abstract)}</p>
      <div class="research-tags">${tags}</div>
      <div class="publication-card-actions"><button class="text-link" data-view-publication="${publication.id}">View full research →</button>${publication.file_url ? `<button class="text-link" data-download-publication="${publication.id}">Download PDF ↓</button>` : ""}${publication.link ? `<a class="text-link" href="${safeExternalLink(publication.link)}" target="_blank" rel="noopener noreferrer">Open link ↗</a>` : ""}</div>
    </article>`;
  }

  function attachPublicationActions(container, publications) {
    container.querySelectorAll("[data-view-publication]").forEach((button) => button.addEventListener("click", () => {
      const publication = publications.find((item) => item.id === Number(button.dataset.viewPublication));
      if (publication) showPublicationDetail(publication);
    }));
    container.querySelectorAll("[data-download-publication]").forEach((button) => button.addEventListener("click", async () => {
      const publication = publications.find((item) => item.id === Number(button.dataset.downloadPublication));
      if (!publication || !publication.file_url) return;
      button.disabled = true;
      try {
        await AquaApi.download(publication.file_url, `${slug(publication.title)}.pdf`);
      } catch (error) {
        window.aquaToast(error.message, "error");
      } finally {
        button.disabled = false;
      }
    }));
  }

  function showPublicationDetail(publication) {
    const detail = document.querySelector("#publication-detail");
    detail.innerHTML = `<span class="eyebrow">PUBLISHED RESEARCH · ${formatDate(publication.research_date)}</span>
      <h2>${escapeHtml(publication.title)}</h2>
      <p class="publication-author">By ${escapeHtml(publication.author_name)}${publication.location ? ` · ${escapeHtml(publication.location)}` : ""}</p>
      <div class="research-tags">${publication.tags.map((tag) => `<span class="research-tag">${escapeHtml(tag)}</span>`).join("")}</div>
      <h3>Abstract</h3><p>${escapeHtml(publication.abstract)}</p>
      <h3>Full description and findings</h3><p class="publication-full-content">${escapeHtml(publication.content)}</p>
      <div class="publication-card-actions">${publication.file_url ? `<button class="button button-primary" id="detail-download">Download PDF <span>↓</span></button>` : ""}${publication.link ? `<a class="button button-outline" href="${safeExternalLink(publication.link)}" target="_blank" rel="noopener noreferrer">Open external link <span>↗</span></a>` : ""}</div>`;
    const dialog = document.querySelector("#publication-dialog");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    detail.querySelector("#detail-download")?.addEventListener("click", () =>
      AquaApi.download(publication.file_url, `${slug(publication.title)}.pdf`).catch((error) => window.aquaToast(error.message, "error"))
    );
  }

  function editPublication(id) {
    const publication = myPublications.find((item) => item.id === id);
    if (!publication) return;
    editingPublicationId = id;
    const form = document.querySelector("#publish-form");
    form.elements.title.value = publication.title;
    form.elements.abstract.value = publication.abstract;
    form.elements.content.value = publication.content;
    form.elements.location.value = publication.location || "";
    form.elements.research_date.value = publication.research_date;
    form.elements.tags.value = publication.tags.join(", ");
    form.elements.link.value = publication.link || "";
    document.querySelector("#publish-form-title").textContent = "Edit published research";
    document.querySelector("#publish-submit").innerHTML = 'Save changes <span>✓</span>';
    document.querySelector("#publish-cancel-edit").classList.remove("hidden");
    document.querySelector("#publish-section").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function deletePublication(id) {
    if (!window.confirm("Delete this publication? This can’t be undone.")) return;
    try {
      await AquaApi.delete(`/research/published/${id}`);
      window.aquaToast("Publication deleted.");
      await loadPublications();
    } catch (error) {
      window.aquaToast(error.message, "error");
    }
  }

  async function submitCollaborationRequest(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const message = document.querySelector("#collaboration-message");
    const values = new FormData(form);
    button.disabled = true;
    message.textContent = "Saving your collaboration request…";
    message.className = "form-message";
    try {
      await AquaApi.post("/research/collaborations", {
        recipient: String(values.get("recipient") || "").trim() || null,
        subject: values.get("subject"),
        message: values.get("message")
      });
      form.reset();
      message.textContent = "Your request has been saved to your researcher account.";
      message.classList.add("is-success");
    } catch (error) {
      message.textContent = error.message;
      message.classList.add("is-error");
    } finally {
      button.disabled = false;
    }
  }

  function formatDate(value) {
    const date = new Date(`${value}T00:00:00`);
    return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function slug(value) {
    return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "research";
  }

  function safeExternalLink(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:" ? escapeHtml(url.href) : "#";
    } catch (_) {
      return "#";
    }
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));
  }
})();
