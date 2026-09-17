/* ──────────────────────────────────────────────────────────────────────────
   Runtime for /home-redesign — the compiled design body's interactions.

   The Claude Design export drove the page through a canvas runtime: a React-ish
   component whose renderVals() fed {{ }} placeholders. This file replaces it
   with a small template binder plus the design's own behaviours, ported as-is
   except where noted. Built markup comes from scripts/build-home-redesign.mjs.

   Not in here on purpose:
     • the audit form — that is the live homepage's widget, /assets/audit-widget.js
     • the header — /assets/header.js
     • hover-driven wheel state and the 5-second auto-advance (see Whisper Wheel)
   ────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var SHARED = window.RWVals;
  var EASE = SHARED.EASE;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ── Template binder ────────────────────────────────────────────────────
     The build bakes state-1 values into the markup and stashes each template
     beside it (data-tpl for attributes, data-tpl-text for a sole text child),
     so the page paints correctly before this runs and re-renders after.       */
  var bindings = [];

  function collectBindings(root) {
    $$('[data-tpl]', root).forEach(function (el) {
      var map;
      try { map = JSON.parse(el.getAttribute('data-tpl')); } catch (e) { return; }
      Object.keys(map).forEach(function (attr) { bindings.push({ el: el, attr: attr, tpl: map[attr] }); });
    });
    $$('[data-tpl-text]', root).forEach(function (el) {
      bindings.push({ el: el, text: true, tpl: el.getAttribute('data-tpl-text') });
    });
  }

  function interpolate(tpl, vals) {
    return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, function (_m, key) {
      var v = vals[key];
      return v === undefined || v === null ? '' : String(v);
    });
  }

  function render(vals) {
    bindings.forEach(function (b) {
      var out = interpolate(b.tpl, vals);
      if (b.text) { if (b.el.textContent !== out) b.el.textContent = out; }
      else if (b.el.getAttribute(b.attr) !== out) b.el.setAttribute(b.attr, out);
    });
  }

  /* data-ev-click="pick1" -> resolved against the CURRENT vals at call time */
  function bindEvents(root) {
    $$('[data-ev-click]', root).forEach(function (el) {
      el.addEventListener('click', function (e) {
        var fn = C.vals[el.getAttribute('data-ev-click')];
        if (typeof fn === 'function') fn(e);
      });
    });
  }

  /* ── Whisper Wheel ──────────────────────────────────────────────────────
     Six factors; one selected. The design also moved the ring and swapped the
     panel on HOVER of any node or pill, and auto-advanced every 5s. Both are
     gone: hovering across the wheel made the ring jump between nodes and the
     labels flicker, and 5s is not long enough to read a factor's two
     paragraphs before they change underneath you. The wheel now changes only
     when the visitor asks it to — click or tap a node or pill, the arrows, or
     Enter/Space on a focused pill. Ambient motion (ripples, ticks, the cue
     arrow) still signals that it is interactive.                              */
  var C = {
    state: { selected: 1, activeFactor: 0 },
    vals: {},

    setState: function (patch, cb) {
      Object.assign(this.state, patch);
      this.vals = this.renderVals();
      render(this.vals);
      this.paintPressed();
      if (cb) cb();
    },

    // data values come from the shared module (also used by the build script);
    // this only adds the handlers, which cannot be serialised into markup
    renderVals: function () {
      var self = this;
      var v = SHARED.values(this.state);
      v.prevFactor = function () { self.step(-1); };
      v.nextFactor = function () { self.step(1); };
      for (var i = 1; i <= 6; i++) {
        v['pick' + i] = (function (n) { return function () { self.pickFactor(n); }; })(i);
      }
      return v;
    },

    paintRows: function (n) {
      // pills and progress segments come from renderVals; only the graphic swap is imperative
      $$('[data-factor-viz]').forEach(function (v) {
        v.style.display = v.getAttribute('data-factor-viz') === String(n) ? 'flex' : 'none';
      });
    },

    paintPressed: function () {
      var sel = String(this.state.selected || 1);
      $$('[data-factor-row]').forEach(function (p) {
        p.setAttribute('aria-pressed', p.getAttribute('data-factor-row') === sel ? 'true' : 'false');
      });
    },

    step: function (dir) {
      // step from the pending target, not state.selected, so rapid clicks compose
      var from = this._target || this.state.selected || 1;
      this.pickFactor(((from - 1 + dir + 6) % 6) + 1);
    },

    pickFactor: function (n) {
      var self = this;
      this._target = n;
      if (n === this.state.selected) return;
      var panel = $('[data-factor-panel]');
      var inner = panel && panel.firstElementChild;
      if (!panel || !inner || reduceMotion) {
        this.setState({ selected: n, activeFactor: n }, function () { self.paintRows(n); });
        return;
      }
      if (this._swapping) { this._pending = n; return; }   // remember the latest request
      this._swapping = true;
      panel.style.opacity = '1';
      panel.style.transform = 'none';
      var h0 = panel.offsetHeight;
      panel.style.height = h0 + 'px';
      panel.style.overflow = 'hidden';
      panel.style.transition = 'height .55s ' + EASE;
      inner.style.transition = 'opacity .2s ' + EASE + ', transform .2s ' + EASE;
      inner.style.opacity = '0';
      inner.style.transform = 'translateY(-5px)';
      clearTimeout(this._swapTimer);
      this._swapTimer = setTimeout(function () {
        self.setState({ selected: n, activeFactor: n }, function () {
          self.paintRows(n);
          panel.style.height = 'auto';
          var h1 = panel.offsetHeight;
          panel.style.height = h0 + 'px';
          void panel.offsetWidth;
          panel.style.height = h1 + 'px';
          inner.style.transition = 'none';
          inner.style.transform = 'translateY(7px)';
          // visibility must never depend on a single rAF: throttled frames (offscreen,
          // backgrounded, low-power) would otherwise leave the panel stuck at opacity 0
          var reveal = function () {
            inner.style.transition = 'opacity .45s ' + EASE + ', transform .45s ' + EASE;
            inner.style.opacity = '1';
            inner.style.transform = 'translateY(0)';
          };
          requestAnimationFrame(reveal);
          clearTimeout(self._revealTimer);
          self._revealTimer = setTimeout(reveal, 120);
          // a transition stuck in "running" overrides the inline value and pins computed
          // opacity at 0, so commit the final value outright once the fade should be done
          clearTimeout(self._commitTimer);
          self._commitTimer = setTimeout(function () {
            inner.getAnimations().forEach(function (a) { try { a.finish(); } catch (e) { a.cancel(); } });
            inner.style.transition = 'none';
            inner.style.opacity = '1';
            inner.style.transform = 'none';
          }, 620);
          clearTimeout(self._heightTimer);
          self._heightTimer = setTimeout(function () {
            panel.style.height = '';
            panel.style.overflow = '';
            panel.style.transition = '';
            self._swapping = false;
            if (self._pending && self._pending !== self.state.selected) {
              var q = self._pending; self._pending = null; self.pickFactor(q);
            } else {
              self._pending = null;
            }
          }, 450);
        });
      }, 210);
    },

    wheelKeyboard: function () {
      $$('[data-factor-row]').forEach(function (pill) {
        pill.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pill.click(); }
        });
      });
    },

    /* ── Ambient animation (ported unchanged) ──────────────────────────── */
    animateNumbers: function () {
      var ease = function (t) { return 1 - Math.pow(1 - t, 3); };
      var run = function (el) {
        var target = parseFloat(el.dataset.count);
        var dec = parseInt(el.dataset.dec || '0', 10);
        var pre = el.dataset.prefix || '', suf = el.dataset.suffix || '';
        var t0 = performance.now();
        var frame = function (now) {
          var p = Math.min(1, (now - t0) / 1100);
          el.textContent = pre + (target * ease(p)).toFixed(dec) + suf;
          if (p < 1) requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      };
      var nums = $$('[data-count]'), bars = $$('[data-bar]');
      if (reduceMotion) { bars.forEach(function (b) { b.style.width = b.dataset.bar + '%'; }); return; }
      nums.forEach(function (el) {
        el.textContent = (el.dataset.prefix || '') + (0).toFixed(parseInt(el.dataset.dec || '0', 10)) + (el.dataset.suffix || '');
      });
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          if (e.target.dataset.count !== undefined) run(e.target);
          else e.target.style.width = e.target.dataset.bar + '%';
          io.unobserve(e.target);
        });
      }, { threshold: 0.4 });
      nums.concat(bars).forEach(function (el) { io.observe(el); });
    },

    rankLoop: function () {
      if (reduceMotion) return;
      var rows = [1, 2, 3].map(function (n) { return $('[data-rank-row="' + n + '"]'); });
      var oldNum = $('[data-rank-old]'), newNum = $('[data-rank-new]');
      if (rows.some(function (r) { return !r; })) return;
      var up = false;
      var tick = function () {
        up = !up;
        rows[0].style.transform = up ? 'translateY(60px)' : 'translateY(0)';
        rows[1].style.transform = up ? 'translateY(60px)' : 'translateY(0)';
        rows[2].style.transform = up ? 'translateY(-120px)' : 'translateY(0)';
        if (oldNum) oldNum.style.opacity = up ? '0' : '1';
        if (newNum) newNum.style.opacity = up ? '1' : '0';
      };
      setTimeout(tick, 1200);
      setInterval(tick, 3400);
    },

    rankCardLoop: function () {
      var el = $('[data-rank-live]'), delta = $('[data-rank-delta]');
      if (!el) return;
      if (reduceMotion) { el.textContent = '4'; if (delta) delta.style.opacity = '1'; return; }
      var ease = function (t) { return 1 - Math.pow(1 - t, 3); };
      var from = 41, to = 4, dur = 3500;
      var glide = function () {
        var t0 = performance.now();
        var frame = function (now) {
          var p = Math.min(1, (now - t0) / dur);
          el.textContent = String(Math.round(from + (to - from) * ease(p)));
          if (p < 1) requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      };
      var cycle = function () {
        el.style.opacity = '1'; el.style.transform = 'none';
        glide();
        if (delta) {
          delta.style.opacity = '0'; delta.style.transform = 'translateY(4px)';
          setTimeout(function () { delta.style.opacity = '1'; delta.style.transform = 'translateY(0)'; }, 3400);
          setTimeout(function () { delta.style.opacity = '0'; }, 6900);
        }
        setTimeout(function () { el.style.opacity = '0'; }, 7150);
      };
      cycle();
      setInterval(cycle, 7600);
    },

    rankCardFit: function () {
      var card = $('[data-rank-card]');
      if (!card) return;
      var img = $('img[src*="hero-home"]');
      var box = img && img.parentElement;
      if (!box) return;
      var rank = card.querySelector('[data-rank-live]');
      var figure = rank && rank.parentElement;
      var delta = card.querySelector('[data-rank-delta]');
      var eyebrow = card.firstElementChild && card.firstElementChild.firstElementChild;
      var spark = card.querySelector('svg[viewBox="0 0 200 38"]');
      var note = card.lastElementChild;
      var apply = function () {
        var w = box.getBoundingClientRect().width;
        // The photo now lives in a ~500px hero column, so the card floats inside it down
        // to 440px (the design switched at 520, when the photo was a full-width band).
        // Narrower than that — phones — it hangs off the bottom edge instead.
        var narrow = w < 440;
        card.style.position = 'absolute';
        card.style.marginTop = '';
        if (narrow) {
          card.style.right = 'auto'; card.style.left = '50%'; card.style.transform = 'translateX(-50%)';
          card.style.bottom = '-30px'; card.style.width = 'min(206px,60%)'; card.style.padding = '13px 15px'; card.style.gap = '7px';
          if (figure) figure.style.fontSize = '30px';
          if (delta) { delta.style.fontSize = '13px'; delta.style.whiteSpace = 'nowrap'; delta.textContent = 'up 37'; }
          if (eyebrow) eyebrow.style.fontSize = '11px';
          if (spark) spark.style.maxHeight = '26px';
          if (note) note.style.fontSize = '12px';
        } else {
          card.style.left = 'auto'; card.style.transform = ''; card.style.right = '14px';
          card.style.bottom = '14px'; card.style.width = 'min(260px,54%)'; card.style.padding = '14px 16px'; card.style.gap = '8px';
          if (figure) figure.style.fontSize = '34px';
          if (delta) { delta.style.fontSize = '14px'; delta.style.whiteSpace = 'nowrap'; delta.textContent = 'up 37 positions'; }
          if (eyebrow) eyebrow.style.fontSize = '12px';
          if (spark) spark.style.maxHeight = '';
          if (note) note.style.fontSize = '12px';
        }
      };
      apply();
      new ResizeObserver(apply).observe(box);
    },

    runPulse: function () {
      var self = this;
      var row = $('[data-timeline]');
      var pulse = row && row.querySelector('[data-rail-pulse]');
      var marks = row ? $$('[data-marker]', row) : [];
      if (!pulse || marks.length < 2) return;
      var rowRect = row.getBoundingClientRect();
      var first = marks[0].getBoundingClientRect(), last = marks[marks.length - 1].getBoundingClientRect();
      // centre the dot on the rail using the marker's own measured centre
      pulse.style.top = (first.top + first.height / 2 - rowRect.top - 3.5).toFixed(1) + 'px';
      var x0 = first.left + first.width / 2 - rowRect.left, x1 = last.left + last.width / 2 - rowRect.left;
      if (this._pulseAnim) this._pulseAnim.cancel();
      this._pulseAnim = pulse.animate([
        { transform: 'translateX(' + x0 + 'px)', opacity: 0 },
        { transform: 'translateX(' + (x0 + (x1 - x0) * 0.12) + 'px)', opacity: 1, offset: 0.12 },
        { transform: 'translateX(' + (x0 + (x1 - x0) * 0.88) + 'px)', opacity: 1, offset: 0.88 },
        { transform: 'translateX(' + x1 + 'px)', opacity: 0 }
      ], { duration: 4600, iterations: Infinity, easing: EASE });
      if (!this._pulseResize) {
        this._pulseResize = function () { clearTimeout(self._pulseRt); self._pulseRt = setTimeout(function () { self.runPulse(); }, 160); };
        window.addEventListener('resize', this._pulseResize);
      }
    },

    timelineFx: function () {
      var self = this;
      var rails = $$('[data-rail]'), marks = $$('[data-marker]'), rates = $$('[data-rate]');
      var show = function () {
        marks.forEach(function (m, i) { setTimeout(function () { m.style.transform = 'scale(1)'; }, i * 140); });
        rails.forEach(function (r, i) { setTimeout(function () { r.style.transform = 'scaleX(1)'; }, 80 + i * 140); });
      };
      if (reduceMotion) {
        marks.forEach(function (m) { m.style.transform = 'scale(1)'; });
        rails.forEach(function (r) { r.style.transform = 'scaleX(1)'; });
        rates.forEach(function (r) { r.style.width = r.dataset.rate + '%'; });
        return;
      }
      var row = $('[data-timeline]');
      if (row) {
        var io = new IntersectionObserver(function (es) {
          if (!es[0].isIntersecting) return;
          show();
          setTimeout(function () { self.runPulse(); }, 900);
          io.unobserve(row);
        }, { threshold: 0.25 });
        io.observe(row);
      }
      if (rates.length) {
        // observe the TRACK, not the bar: a zero-width bar can never satisfy a threshold
        var io2 = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (!e.isIntersecting) return;
            $$('[data-rate]', e.target).forEach(function (b) { b.style.width = b.dataset.rate + '%'; });
            io2.unobserve(e.target);
          });
        }, { threshold: 0.25 });
        rates.forEach(function (r) { if (r.parentElement) io2.observe(r.parentElement); });
      }
    },

    parallax: function () {
      var px = $$('[data-parallax]');
      if (reduceMotion || !px.length) return;
      var queued = false;
      var frame = function () {
        queued = false;
        var mid = window.innerHeight / 2;
        px.forEach(function (el) {
          var r = el.getBoundingClientRect();
          var speed = parseFloat(el.getAttribute('data-parallax')) || 1;
          var off = Math.max(-26, Math.min(26, ((mid - (r.top + r.height / 2)) / mid) * 22 * speed));
          el.style.transform = 'translateY(' + off.toFixed(1) + 'px)';
        });
      };
      var onScroll = function () { if (!queued) { queued = true; requestAnimationFrame(frame); } };
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll);
      frame();
    },

    revealOnScroll: function () {
      if (reduceMotion) return;
      var els = $$('[data-reveal]');
      els.forEach(function (el) {
        el.style.opacity = '0'; el.style.transform = 'translateY(18px)';
        el.style.transition = 'opacity .7s ' + EASE + ', transform .7s ' + EASE;
      });
      els.forEach(function (el) {
        if (!el.hasAttribute('data-stagger')) return;
        Array.prototype.forEach.call(el.children, function (c) {
          c.style.opacity = '0'; c.style.transform = 'translateY(18px) scale(.985)';
          c.style.transition = 'opacity .65s ' + EASE + ', transform .65s ' + EASE;
        });
        el.style.opacity = '1'; el.style.transform = 'none'; el.style.transition = 'none';
      });
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e, i) {
          if (!e.isIntersecting) return;
          var el = e.target;
          if (el.hasAttribute('data-stagger')) {
            Array.prototype.forEach.call(el.children, function (c, j) {
              setTimeout(function () { c.style.opacity = '1'; c.style.transform = 'translateY(0) scale(1)'; }, j * 90);
            });
          } else {
            setTimeout(function () { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; }, i * 80);
          }
          io.unobserve(el);
        });
      }, { rootMargin: '0px 0px -10% 0px', threshold: 0.06 });
      els.forEach(function (el) { io.observe(el); });
    }
  };

  /* ── Boot ───────────────────────────────────────────────────────────────── */
  function boot() {
    collectBindings(document.body);
    C.vals = C.renderVals();
    render(C.vals);
    bindEvents(document.body);

    C.paintRows(1);
    C.paintPressed();
    C.wheelKeyboard();
    C.animateNumbers();
    C.rankLoop();
    C.rankCardLoop();
    C.revealOnScroll();
    C.parallax();
    C.timelineFx();
    C.rankCardFit();

    // In-page anchors scroll smoothly and clear the floating header. Audit CTAs are
    // .js-to-form / .js-to-audit, which audit-widget.js already handles (opens the
    // fullscreen takeover, or centres the card) — and it pushes a #focus history entry
    // that the replaceState below would otherwise overwrite.
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a || a.classList.contains('js-to-audit') || a.classList.contains('js-to-form')) return;
      var id = a.getAttribute('href').slice(1);
      var target = id && document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      var bar = $('.float-bar');
      var offset = bar ? bar.getBoundingClientRect().bottom + 16 : 0;
      window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - offset, behavior: reduceMotion ? 'auto' : 'smooth' });
      if (history.replaceState) history.replaceState(null, '', '#' + id);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
