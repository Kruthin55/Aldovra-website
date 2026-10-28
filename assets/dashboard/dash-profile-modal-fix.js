/* Keep the profile dialog outside transformed/narrow dashboard containers. */
(function () {
  const moveProfileDialogToBody = function () {
    const modal = document.getElementById("profileDetailsModal");
    if (modal && modal.parentElement !== document.body) {
      document.body.appendChild(modal);
    }
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", moveProfileDialogToBody, { once: true });
  } else {
    moveProfileDialogToBody();
  }
})();
