// blog-post.js: hero graphic Replay button and number counters for posts built
// from blog/_post-template.html. With reduced motion on, graphics show their
// finished frame (see blog-graphics.css), counters show their final value and
// there is no Replay button.
(function(){
  var RM = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // <span class="count" data-to="27" data-suffix="%">27%</span>: the text is the final
  // value, so the number reads correctly without JavaScript.
  function runCounters(root){
    if (RM) return;
    root.querySelectorAll('.count').forEach(function(c){
      var to = Number(c.dataset.to), from = Number(c.dataset.from || 0);
      var pre = c.dataset.prefix || '', suf = c.dataset.suffix || '';
      var delay = Number(c.dataset.d || 0) * 1000, dur = Number(c.dataset.dur || 0.9) * 1000;
      if (!isFinite(to)) return;
      c.textContent = pre + from.toLocaleString() + suf;
      var t0 = performance.now() + delay;
      function step(now){
        var k = Math.min(1, Math.max(0, (now - t0) / dur)), ez = 1 - Math.pow(1 - k, 3);
        c.textContent = pre + Math.round(from + (to - from) * ez).toLocaleString() + suf;
        if (k < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }

  // The button sits beside the graphic, not inside it: the graphic is role="img",
  // which hides its children from screen readers.
  document.querySelectorAll('.post-hero').forEach(function(fig){
    var hx = fig.querySelector('.hx');
    if (!hx) return;
    var frame = hx.innerHTML;
    runCounters(hx);
    if (RM) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'post-replay';
    btn.textContent = 'Replay';
    btn.setAttribute('aria-label', 'Replay the graphic animation');
    btn.addEventListener('click', function(){
      hx.innerHTML = frame;
      runCounters(hx);
    });
    fig.appendChild(btn);
  });
})();
