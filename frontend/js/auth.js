(function () {
  function showMessage(form, message, isError = true) {
    const output = form.querySelector(".form-message");
    if (!output) return;
    output.textContent = message;
    output.classList.toggle("is-error", isError);
    output.classList.toggle("is-success", !isError);
  }
  const loginForm = document.querySelector("#login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = loginForm.querySelector("button[type=submit]");
      button.disabled = true;
      showMessage(loginForm, "Signing you in…", false);
      try {
        const data = new URLSearchParams(new FormData(loginForm));
        const result = await AquaApi.request("/auth/login", { method: "POST", body: data });
        AquaApi.setToken(result.access_token);
        localStorage.setItem("aqua_role", result.role);
        const user = await AquaApi.get("/auth/me");
        localStorage.setItem("aqua_user", JSON.stringify(user));
        localStorage.setItem("aqua_role", user.role);
        const destination = new URLSearchParams(location.search).get("next");
        const isResearcher = user.role === "researcher" || user.role === "admin";
        if (destination === "research.html" && !isResearcher) {
          location.href = "dashboard.html";
        } else if (destination && /^[a-z0-9-]+\.html$/i.test(destination)) {
          location.href = destination;
        } else {
          location.href = isResearcher ? "dashboard.html?view=researcher" : "dashboard.html";
        }
      } catch (error) {
        showMessage(loginForm, error.message);
        button.disabled = false;
      }
    });
  }
  const registerForm = document.querySelector("#register-form");
  if (registerForm) {
    registerForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = registerForm.querySelector("button[type=submit]");
      button.disabled = true;
      showMessage(registerForm, "Creating your account…", false);
      const form = new FormData(registerForm);
      try {
        await AquaApi.post("/auth/register", {
          name: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
          role: form.get("role")
        });
        showMessage(registerForm, "Your account is ready. Taking you to log in…", false);
        setTimeout(() => { location.href = "login.html"; }, 900);
      } catch (error) {
        showMessage(registerForm, error.message);
        button.disabled = false;
      }
    });
  }
})();
