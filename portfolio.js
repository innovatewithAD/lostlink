// Search the report cards rendered by the Node.js server.
document.addEventListener("DOMContentLoaded", function () {
  const searchInput = document.querySelector("#reportSearch");
  const reportList = document.querySelector("#reportList");
  const emptySearch = document.querySelector("#emptySearch");

  if (!searchInput || !reportList) return;

  searchInput.addEventListener("input", function () {
    const searchText = searchInput.value.trim().toLowerCase();
    const cards = reportList.querySelectorAll(".item-card");
    let visibleCount = 0;

    cards.forEach(function (card) {
      const matches = card.textContent.toLowerCase().includes(searchText);
      card.hidden = !matches;
      if (matches) visibleCount += 1;
    });

    if (emptySearch) emptySearch.hidden = visibleCount !== 0 || cards.length === 0;
  });
});
