// Browser-side checks for the login and registration forms.
document.addEventListener("DOMContentLoaded", function () {
  const forms = document.querySelectorAll("form[data-validate]");

  forms.forEach(function (form) {
    form.addEventListener("submit", function (event) {
      if (!form.checkValidity()) {
        event.preventDefault();
        form.reportValidity();
        return;
      }

      const password = form.querySelector('input[name="password"]');
      if (form.action.endsWith("/register") && password && password.value.length < 8) {
        event.preventDefault();
        password.setCustomValidity("Password must contain at least 8 characters.");
        password.reportValidity();
        password.addEventListener("input", function () { password.setCustomValidity(""); }, { once: true });
      }
    });
  });
});
