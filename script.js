// Small shared browser-side behaviour for the home page.
document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll("form[data-validate]").forEach(function (form) {
    form.addEventListener("submit", function (event) {
      if (!form.checkValidity()) {
        event.preventDefault();
        form.reportValidity();
      }
    });
  });
});
