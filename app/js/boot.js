// Runs before the page paints so the saved theme never flashes the wrong colours.
(function () {
  try {
    var raw = localStorage.getItem('mali-budget/v1');
    var theme = raw ? (JSON.parse(raw).settings || {}).theme : null;
    if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
    if (/[?&]shot=1/.test(location.search)) document.documentElement.classList.add('no-motion');
  } catch (e) { /* first run */ }
})();
