(function () {
  const menuButton = document.querySelector(".menu-toggle");
  if (menuButton) {
    menuButton.addEventListener("click", () => {
      const open = menuButton.getAttribute("aria-expanded") !== "true";
      menuButton.setAttribute("aria-expanded", String(open));
      document.querySelector(".nav-links")?.classList.toggle("is-open", open);
    });
  }

  const toastRoot = document.querySelector("#toast-root");
  window.aquaToast = (message, kind = "success") => {
    if (!toastRoot) return;
    const toast = document.createElement("div");
    toast.className = `toast toast-${kind}`;
    toast.textContent = message;
    toastRoot.append(toast);
    window.setTimeout(() => toast.remove(), 4000);
  };

  const token = localStorage.getItem(AquaApi.tokenKey);
  const loginLinks = document.querySelectorAll(".nav-auth");
  if (!token) {
    document.querySelectorAll("[data-research-link]").forEach((link) => link.classList.remove("role-visible"));
  } else {
    loginLinks.forEach((link) => {
      link.textContent = "Log out";
      link.href = "#logout";
    });
    AquaApi.get("/auth/me").then((user) => {
      localStorage.setItem("aqua_user", JSON.stringify(user));
      localStorage.setItem("aqua_role", user.role);
      const isResearcher = user.role === "researcher" || user.role === "admin";
      document.querySelectorAll("[data-research-link]").forEach((link) => {
        link.classList.toggle("role-visible", isResearcher);
      });

      const nav = document.querySelector(".nav-links");
      if (nav && !nav.querySelector(".nav-profile")) {
        const profile = document.createElement("span");
        profile.className = "nav-profile";
        const name = document.createElement("span");
        name.className = "nav-profile-name";
        name.textContent = user.name;
        const badge = document.createElement("span");
        badge.className = `role-badge role-badge-${isResearcher ? "researcher" : "citizen"}`;
        badge.textContent = isResearcher ? "Researcher" : "Citizen";
        profile.append(name, badge);
        const logout = nav.querySelector(".nav-auth");
        nav.insertBefore(profile, logout || null);
      }
    }).catch(() => {
      AquaApi.clearToken();
      localStorage.removeItem("aqua_user");
      localStorage.removeItem("aqua_role");
      document.querySelectorAll("[data-research-link]").forEach((link) => link.classList.remove("role-visible"));
      loginLinks.forEach((link) => {
        link.textContent = "Log in";
        link.href = "login.html";
      });
    });
  }

  loginLinks.forEach((link) => {
    if (!token) return;
    link.textContent = "Log out";
    link.href = "#logout";
    link.addEventListener("click", (event) => {
      event.preventDefault();
      AquaApi.clearToken();
      localStorage.removeItem("aqua_user");
      localStorage.removeItem("aqua_role");
      location.href = "index.html";
    });
  });

  if (document.querySelector("#home-report-count")) {
    AquaApi.get("/reports/?limit=1000").then((reports) => {
      document.querySelector("#home-report-count").textContent = reports.length.toLocaleString();
      document.querySelector("#home-location-count").textContent = new Set(reports.map((item) => `${item.lat.toFixed(2)},${item.lng.toFixed(2)}`)).size.toLocaleString();
    }).catch(() => {
      document.querySelector("#home-report-count").textContent = "—";
      document.querySelector("#home-location-count").textContent = "—";
      window.aquaToast("Live community totals couldn’t be loaded right now.", "error");
    });
  }
})();
