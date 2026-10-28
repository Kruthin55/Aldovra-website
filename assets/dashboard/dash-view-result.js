/* Support View Result buttons rendered dynamically inside the profile modal. */
document.addEventListener("click", event => {
  const button = event.target.closest(".profile-verification-action[data-view-result]");
  if (!button) return;
  const request = (assessmentRequests || []).find(
    item => String(item.id) === String(button.dataset.viewResult)
  );
  if (!request) return;
  openResultModal(request);
});


/* Dashboard interactions for collapsible sections and student dropdown. */
document.addEventListener("keydown", event => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const header = event.target.closest(".assessment-category.is-collapsible .assessment-category-header");
  if (!header) return;
  event.preventDefault();
  const category = header.closest(".assessment-category");
  if (!category) return;
  category.classList.toggle("is-collapsed");
  header.setAttribute("aria-expanded", String(!category.classList.contains("is-collapsed")));
});

document.addEventListener("click", event => {
  const toggle = event.target.closest("#toggleExploreStudents");
  if (toggle) {
    const panel = document.getElementById("exploreStudentsDropdown");
    if (!panel) return;
    const open = panel.hasAttribute("hidden");
    panel.toggleAttribute("hidden", !open);
    toggle.setAttribute("aria-expanded", String(open));
    return;
  }

  const header = event.target.closest(".assessment-category.is-collapsible .assessment-category-header");
  if (header) {
    const category = header.closest(".assessment-category");
    if (!category) return;
    category.classList.toggle("is-collapsed");
    header.setAttribute("aria-expanded", String(!category.classList.contains("is-collapsed")));
  }
});

function updateAssessmentCategoryLayout() {
  const columns = document.querySelector(".assessment-columns");
  if (!columns) return;
  columns.querySelectorAll(".assessment-category").forEach(category => {
    const list = category.querySelector(".assessment-list");
    const count = category.querySelector(".assessment-category-count");
    if (!list || !count) return;
    const n = Number(count.textContent || 0);
    const empty = n === 0;
    category.classList.toggle("is-empty", empty);
    category.classList.toggle("is-collapsible", !empty);
    const header = category.querySelector(".assessment-category-header");
    if (header) {
      header.setAttribute("role", "button");
      header.setAttribute("tabindex", "0");
      header.setAttribute("aria-expanded", String(!category.classList.contains("is-collapsed")));
    }
  });
}
const assessmentListsObserver = new MutationObserver(() => updateAssessmentCategoryLayout());
function observeAssessmentCategoryLayout() {
  const columns = document.querySelector(".assessment-columns");
  if (columns) {
    assessmentListsObserver.observe(columns, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }
  updateAssessmentCategoryLayout();
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", observeAssessmentCategoryLayout, { once: true });
} else {
  observeAssessmentCategoryLayout();
}
