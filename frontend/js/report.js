(function () {
  const form = document.querySelector("#report-form");
  if (!form) return;
  if (!localStorage.getItem(AquaApi.tokenKey)) {
    const prompt = document.createElement("div");
    prompt.className = "login-hint";
    prompt.innerHTML = 'You’ll need a free account to share your observation. <a href="login.html">Log in</a> or <a href="register.html">join the community</a>.';
    form.prepend(prompt);
  }
  const latInput = document.querySelector("#report-lat");
  const lngInput = document.querySelector("#report-lng");
  const locationStatus = document.querySelector("#location-status");
  const sourceType = document.querySelector("#source-type");
  const otherSourceField = document.querySelector("#other-source-field");
  const otherSourceInput = document.querySelector("#other-source");
  function updateOtherSourceVisibility() {
    const showOtherSource = sourceType.value === "Other";
    otherSourceField.classList.toggle("hidden", !showOtherSource);
    otherSourceInput.required = showOtherSource;
    if (!showOtherSource) otherSourceInput.value = "";
  }
  sourceType.addEventListener("change", updateOtherSourceVisibility);
  updateOtherSourceVisibility();

  const map = L.map("report-picker-map", { scrollWheelZoom: false }).setView([20, 0], 2);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  let pin = null;
  function setPin(lat, lng, zoom = true) {
    latInput.value = Number(lat).toFixed(6);
    lngInput.value = Number(lng).toFixed(6);
    if (pin) pin.setLatLng([lat, lng]);
    else pin = L.marker([lat, lng], { draggable: true }).addTo(map);
    pin.on("dragend", (event) => {
      const point = event.target.getLatLng();
      latInput.value = point.lat.toFixed(6);
      lngInput.value = point.lng.toFixed(6);
    });
    if (zoom) map.setView([lat, lng], 14);
    locationStatus.textContent = "Pin set — drag it to fine-tune the location.";
  }
  map.on("click", (event) => setPin(event.latlng.lat, event.latlng.lng, false));
  document.querySelector("#locate-me").addEventListener("click", () => {
    if (!navigator.geolocation) {
      locationStatus.textContent = "Location isn’t available in this browser. Tap the map instead.";
      return;
    }
    locationStatus.textContent = "Finding your location…";
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setPin(coords.latitude, coords.longitude),
      (error) => {
        const explanation = error.code === error.PERMISSION_DENIED ? "Location permission was denied." : "Couldn’t find your location.";
        locationStatus.textContent = `${explanation} You can tap the map to place a pin.`;
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  });
  [latInput, lngInput].forEach((input) => input.addEventListener("change", () => {
    if (latInput.value && lngInput.value) setPin(Number(latInput.value), Number(lngInput.value));
  }));
  let submittedReport = null;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!localStorage.getItem(AquaApi.tokenKey)) {
      location.href = `login.html?next=${encodeURIComponent("report.html")}`;
      return;
    }
    const button = form.querySelector("button[type=submit]");
    const message = form.querySelector(".form-message");
    button.disabled = true;
    message.textContent = "Sharing your observation…";
    message.className = "form-message";
    const data = new FormData(form);
    const body = Object.fromEntries(data.entries());
    body.lat = Number(body.lat);
    body.lng = Number(body.lng);
    Object.keys(body).forEach((key) => { if (body[key] === "") delete body[key]; });
    try {
      submittedReport = await AquaApi.post("/reports/", body);
      message.textContent = "Thanks — your observation is now part of the community map.";
      message.classList.add("is-success");
      document.querySelector("#report-success").classList.remove("hidden");
      document.querySelector("#report-success").scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (error) {
      message.textContent = error.message;
      message.classList.add("is-error");
      button.disabled = false;
    }
  });
  document.querySelector("#download-report-csv").addEventListener("click", () => {
    if (!submittedReport) return;
    const keys = ["Date", "Time", "Latitude", "Longitude", "Location", "Color", "Smell", "Taste", "Turbidity", "Algae / Green growth", "Unusual insects", "Source type", "Other source", "Notes", "Trust Score", "Status"];
    const createdAt = submittedReport.created_at;
    const created = new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(createdAt) ? createdAt : `${createdAt}Z`);
    const values = [created.toISOString().slice(0, 10), created.toISOString().slice(11, 19) + " UTC", submittedReport.lat, submittedReport.lng, submittedReport.location_name || "", submittedReport.color, submittedReport.smell, submittedReport.taste, submittedReport.turbidity, submittedReport.algae, submittedReport.insects, submittedReport.source_type, submittedReport.other_source || "", submittedReport.notes || "", submittedReport.trust_score, submittedReport.status];
    const safeCell = (value, untrustedText = false) => {
      const text = String(value);
      return `"${(untrustedText && /^\s*[=+\-@]/.test(text) ? "'" : "") + text.replaceAll('"', '""')}"`;
    };
    const csv = [keys, values].map((row, rowIndex) => row.map((value, columnIndex) =>
      safeCell(value, rowIndex === 1 && [4, 12, 13].includes(columnIndex))
    ).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `aquacollective-observation-${submittedReport.id}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  });
})();
