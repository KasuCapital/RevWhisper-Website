// Arrow buttons for the case study strips (assets/cs-strip.css). The row scrolls by touch or trackpad
// without this; the buttons move it one screen at a time and dim at either end.
(function () {
  function init(strip) {
    var row = strip.querySelector('.cs-strip-row');
    var btns = strip.querySelectorAll('.cs-strip-btn');
    if (!row || !btns.length) return;
    function update() {
      var max = row.scrollWidth - row.clientWidth - 2;
      btns[0].disabled = row.scrollLeft <= 2;
      btns[1].disabled = row.scrollLeft >= max;
    }
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        var dir = Number(b.getAttribute('data-dir')) || 1;
        var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
        row.scrollBy({ left: dir * Math.max(row.clientWidth * 0.85, 300), behavior: reduce ? 'auto' : 'smooth' });
      });
    });
    row.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }
  function start() { document.querySelectorAll('[data-cs-strip]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
