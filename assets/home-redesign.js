/* ──────────────────────────────────────────────────────────────────────────
   Runtime for /home-redesign.

   The Claude Design export drove the page through a canvas runtime: a React-ish
   component whose renderVals() fed {{ }} placeholders in the markup. This file
   replaces that runtime with ~150 lines of vanilla JS — a small template binder
   plus the component's own logic, ported as-is — so the page stands alone.

   Built markup comes from scripts/build-home-redesign.mjs.
   ────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  /* Preview-mode switches ---------------------------------------------------
     This page is shared for review, not run as the live homepage. Two knobs:

     RW_PREVIEW  true  -> audit submissions post to the CRM tagged
                          source:'homepage-redesign', and ad-platform conversion
                          events (Meta Lead, X) are NOT fired. Review traffic
                          would otherwise teach the ad optimizer from non-buyers.
                 false -> behaves exactly like the live homepage widget.

     REDIRECT_AFTER_SUBMIT
                 false -> stays on the page and shows the design's step-6
                          confirmation (what the redesign actually specifies).
                 true  -> restores the production funnel: qualified leads go to
                          /audit-booking, unqualified to /audit-report-coming.
     --------------------------------------------------------------------- */
  var RW_PREVIEW = true;
  var REDIRECT_AFTER_SUBMIT = false;

  var EASE = window.RWVals.EASE;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ── Template binder ────────────────────────────────────────────────────
     scripts/build-home-redesign.mjs bakes the state-1 values straight into the
     markup and stashes each template beside it:
       data-tpl='{"style":"{{ pillStyle1 }}"}'   -> attribute templates
       data-tpl-text="{{ pBody }}"               -> sole-text-child template
     So the page paints correctly before this file runs, and re-renders after.  */
  var bindings = [];

  function collectBindings(root) {
    $$('[data-tpl]', root).forEach(function (el) {
      var map;
      try { map = JSON.parse(el.getAttribute('data-tpl')); } catch (e) { return; }
      Object.keys(map).forEach(function (attr) {
        bindings.push({ el: el, attr: attr, tpl: map[attr] });
      });
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
      if (b.text) {
        if (b.el.textContent !== out) b.el.textContent = out;
      } else if (b.el.getAttribute(b.attr) !== out) {
        b.el.setAttribute(b.attr, out);
      }
    });
  }

  /* ── Event binder ───────────────────────────────────────────────────────
     data-ev-click="pick1" -> look the handler up in the CURRENT vals at call
     time, so handlers never go stale across re-renders.                      */
  function bindEvents(root) {
    ['click', 'mouseover', 'mouseout', 'focus', 'blur', 'input', 'change'].forEach(function (evt) {
      $$('[data-ev-' + evt + ']', root).forEach(function (el) {
        el.addEventListener(evt, function (e) {
          var fn = C.vals[el.getAttribute('data-ev-' + evt)];
          if (typeof fn === 'function') fn(e);
        });
      });
    });
  }

  /* ── The component, ported from the canvas export ───────────────────────── */
  var SHARED = window.RWVals;

  var C = {
    state: { selected: 1, activeFactor: 0 },
    vals: {},

    setState: function (patch, cb) {
      Object.assign(this.state, patch);
      this.vals = this.renderVals();
      render(this.vals);
      if (cb) cb();
    },

    /* Data values come from the shared module (also used by the build script);
       this only adds the handlers, which cannot be serialised into markup. */
    renderVals: function () {
      var self = this;
      var v = SHARED.values(this.state);
      v.hoverOff = function () { self.setState({ activeFactor: 0 }); };
      v.prevFactor = function () { self.step(-1); };
      v.nextFactor = function () { self.step(1); };
      v.optPick = function (e) { self.pickOption(e); };
      v.auditBack = function (e) { self.auditGo(Number(e.currentTarget.getAttribute('data-back-to')) || 1); };
      v.auditNext = function () { self.auditGo(Math.min(6, (self._auditStep || 1) + 1)); };
      for (var i = 1; i <= 6; i++) {
        v['hover' + i] = (function (n) { return function () { self.setState({ activeFactor: n }); }; })(i);
        v['pick' + i] = (function (n) { return function () { self.pauseFactors(); self.pickFactor(n); }; })(i);
      }
      return v;
    },

    /* ── Whisper Wheel ──────────────────────────────────────────────────── */
    paintRows: function (n) {
      // pills and progress segments come from renderVals; only the graphic swap is imperative
      $$('[data-factor-viz]').forEach(function (v) {
        v.style.display = v.getAttribute('data-factor-viz') === String(n) ? 'flex' : 'none';
      });
    },

    step: function (dir) {
      // step from the pending target, not state.selected, so rapid clicks compose
      var from = this._target || this.state.selected || 1;
      this.pauseFactors();
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
      if (this._swapping) {
        // remember the latest request instead of dropping it
        this._pending = n;
        return;
      }
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
              var q = self._pending;
              self._pending = null;
              self.pickFactor(q);
            } else {
              self._pending = null;
            }
          }, 450);
        });
      }, 210);
    },

    pauseFactors: function () {
      var self = this;
      this._paused = true;
      clearTimeout(this._resumeTimer);
      this._resumeTimer = setTimeout(function () { self._paused = false; }, 20000);
    },

    autoFactors: function () {
      var self = this;
      if (reduceMotion) return;
      var section = document.getElementById('system');
      var inView = false;
      if (section) {
        this._autoIo = new IntersectionObserver(function (es) { inView = es[0].isIntersecting; }, { threshold: 0.2 });
        this._autoIo.observe(section);
      }
      this._autoTimer = setInterval(function () {
        if (!inView || self._paused) return;
        self.pickFactor(((self.state.selected || 1) % 6) + 1);
      }, 5000);
    },

    /* ── Audit widget ───────────────────────────────────────────────────── */
    paintAudit: function (step) {
      $$('[data-audit-step]').forEach(function (el) {
        el.style.display = el.getAttribute('data-audit-step') === String(step) ? 'flex' : 'none';
      });
      $$('[data-audit-seg]').forEach(function (seg) {
        seg.style.background = Number(seg.getAttribute('data-audit-seg')) <= Math.min(5, step) ? '#4A6741' : '#E8E4E1';
      });
      var label = $('[data-audit-label]');
      if (label) label.textContent = step > 5 ? 'Done' : 'Step ' + step + ' of 5';
    },

    pickOption: function (e) {
      var self = this;
      var b = e.currentTarget;
      var group = b.getAttribute('data-opt-group');
      $$('[data-opt-group="' + group + '"]').forEach(function (o) {
        o.style.borderColor = '#E0DCDA';
        o.style.background = '#FFFFFF';
        o.style.boxShadow = 'none';
        o.removeAttribute('data-opt-selected');
        var d = o.querySelector('[data-opt-dot]');
        if (d) { d.style.borderColor = '#D5D0CC'; d.style.background = 'transparent'; d.innerHTML = ''; }
      });
      b.style.borderColor = '#4A6741';
      b.style.background = 'rgba(74,103,65,.09)';
      b.style.boxShadow = 'inset 0 0 0 1px #4A6741';
      b.setAttribute('data-opt-selected', '1');
      var dot = b.querySelector('[data-opt-dot]');
      if (dot) { dot.style.borderColor = '#4A6741'; dot.innerHTML = '<span style="width:9px;height:9px;border-radius:50%;background:#4A6741;display:block"></span>'; }
      // remember the answer for submit + let the revenue ladder follow portfolio size
      answers[group] = (b.textContent || '').replace(/\s+/g, ' ').trim();
      if (group === 'portfolio') renderRevenueBands(answers.portfolio);
      track('select_' + group, { value: answers[group], page: 'homepage-redesign' });
      var next = Number(b.getAttribute('data-opt-next'));
      setTimeout(function () { self.auditGo(next); }, 280);
    },

    auditGo: function (step) {
      this.paintAudit(step);
      var el = $('[data-audit-step="' + step + '"]');
      if (!el) return;
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      el.style.transition = 'opacity .4s ' + EASE + ', transform .4s ' + EASE;
      requestAnimationFrame(function () { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; });
      var input = el.querySelector('input');
      if (input) input.focus();
      this._auditStep = step;
    },

    /* ── Ambient animation ──────────────────────────────────────────────── */
    animateNumbers: function () {
      var ease = function (t) { return 1 - Math.pow(1 - t, 3); };
      var run = function (el) {
        var target = parseFloat(el.dataset.count);
        var dec = parseInt(el.dataset.dec || '0', 10);
        var pre = el.dataset.prefix || '';
        var suf = el.dataset.suffix || '';
        var t0 = performance.now();
        var step = function (now) {
          var p = Math.min(1, (now - t0) / 1100);
          el.textContent = pre + (target * ease(p)).toFixed(dec) + suf;
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      };
      var nums = $$('[data-count]');
      var bars = $$('[data-bar]');
      if (reduceMotion) {
        bars.forEach(function (b) { b.style.width = b.dataset.bar + '%'; });
        return;
      }
      nums.forEach(function (el) {
        el.textContent = (el.dataset.prefix || '') + (0).toFixed(parseInt(el.dataset.dec || '0', 10)) + (el.dataset.suffix || '');
      });
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          var el = e.target;
          if (el.dataset.count !== undefined) run(el);
          else el.style.width = el.dataset.bar + '%';
          io.unobserve(el);
        });
      }, { threshold: 0.4 });
      nums.concat(bars).forEach(function (el) { io.observe(el); });
    },

    rankLoop: function () {
      if (reduceMotion) return;
      var rows = [1, 2, 3].map(function (n) { return $('[data-rank-row="' + n + '"]'); });
      var oldNum = $('[data-rank-old]');
      var newNum = $('[data-rank-new]');
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
      this._rankTimer = setInterval(tick, 3400);
    },

    rankCardLoop: function () {
      var self = this;
      var el = $('[data-rank-live]');
      var delta = $('[data-rank-delta]');
      if (!el) return;
      if (reduceMotion) {
        el.textContent = '4';
        if (delta) delta.style.opacity = '1';
        return;
      }
      var ease = function (t) { return 1 - Math.pow(1 - t, 3); };
      var from = 41, to = 4, dur = 3500;
      var glide = function () {
        var t0 = performance.now();
        var frame = function (now) {
          var p = Math.min(1, (now - t0) / dur);
          el.textContent = String(Math.round(from + (to - from) * ease(p)));
          if (p < 1) self._cardRaf = requestAnimationFrame(frame);
        };
        self._cardRaf = requestAnimationFrame(frame);
      };
      var cycle = function () {
        el.style.opacity = '1';
        el.style.transform = 'none';
        glide();
        self._cardTimers = [];
        if (delta) {
          delta.style.opacity = '0';
          delta.style.transform = 'translateY(4px)';
          self._cardTimers.push(setTimeout(function () { delta.style.opacity = '1'; delta.style.transform = 'translateY(0)'; }, 3400));
          self._cardTimers.push(setTimeout(function () { delta.style.opacity = '0'; }, 6900));
        }
        self._cardTimers.push(setTimeout(function () { el.style.opacity = '0'; }, 7150));
      };
      cycle();
      this._cardTimer = setInterval(cycle, 7600);
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
        var r = box.getBoundingClientRect();
        // the photo is height-clamped so the card always has room to overlap; on narrow
        // screens it hangs off the bottom edge instead of sitting inside
        var narrow = r.width < 520;
        card.style.position = 'absolute';
        card.style.marginTop = '';
        if (narrow) {
          card.style.right = 'auto';
          card.style.left = '50%';
          card.style.transform = 'translateX(-50%)';
          card.style.bottom = '-30px';
          card.style.width = 'min(206px,60%)';
          card.style.padding = '13px 15px';
          card.style.gap = '7px';
          if (figure) figure.style.fontSize = '30px';
          if (delta) { delta.style.fontSize = '13px'; delta.style.whiteSpace = 'nowrap'; delta.textContent = 'up 37'; }
          if (eyebrow) eyebrow.style.fontSize = '11px';
          if (spark) spark.style.maxHeight = '26px';
          if (note) note.style.fontSize = '12px';
        } else {
          card.style.left = 'auto';
          card.style.transform = '';
          card.style.right = '-12px';
          card.style.bottom = '34px';
          card.style.width = 'min(300px,42%)';
          card.style.padding = '16px 18px';
          card.style.gap = '9px';
          if (figure) figure.style.fontSize = '38px';
          if (delta) { delta.style.fontSize = '15px'; delta.style.whiteSpace = 'nowrap'; delta.textContent = 'up 37 positions'; }
          if (eyebrow) eyebrow.style.fontSize = '13px';
          if (spark) spark.style.maxHeight = '';
          if (note) note.style.fontSize = '13px';
        }
      };
      apply();
      this._fitRo = new ResizeObserver(apply);
      this._fitRo.observe(box);
    },

    runPulse: function () {
      var self = this;
      var row = $('[data-timeline]');
      var pulse = row && row.querySelector('[data-rail-pulse]');
      var marks = row ? $$('[data-marker]', row) : [];
      if (!pulse || marks.length < 2) return;
      var rowRect = row.getBoundingClientRect();
      var first = marks[0].getBoundingClientRect();
      var last = marks[marks.length - 1].getBoundingClientRect();
      // centre the dot on the rail using the marker's own measured centre
      pulse.style.top = (first.top + first.height / 2 - rowRect.top - 3.5).toFixed(1) + 'px';
      var x0 = first.left + first.width / 2 - rowRect.left;
      var x1 = last.left + last.width / 2 - rowRect.left;
      if (this._pulseAnim) this._pulseAnim.cancel();
      this._pulseAnim = pulse.animate([
        { transform: 'translateX(' + x0 + 'px)', opacity: 0 },
        { transform: 'translateX(' + (x0 + (x1 - x0) * 0.12) + 'px)', opacity: 1, offset: 0.12 },
        { transform: 'translateX(' + (x0 + (x1 - x0) * 0.88) + 'px)', opacity: 1, offset: 0.88 },
        { transform: 'translateX(' + x1 + 'px)', opacity: 0 }
      ], { duration: 4600, iterations: Infinity, easing: EASE });
      if (!this._pulseResize) {
        this._pulseResize = function () {
          clearTimeout(self._pulseRt);
          self._pulseRt = setTimeout(function () { self.runPulse(); }, 160);
        };
        window.addEventListener('resize', this._pulseResize);
      }
    },

    timelineFx: function () {
      var self = this;
      var rails = $$('[data-rail]');
      var marks = $$('[data-marker]');
      var rates = $$('[data-rate]');
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
        // observe the TRACK, not the bar: the bar starts at width 0 and a zero-area
        // target can never satisfy an intersection threshold
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

    scrollFx: function () {
      var bar = $('[data-progress]');
      var nav = $('[data-nav]');
      var navInner = $('[data-nav-inner]');
      var px = $$('[data-parallax]');
      var queued = false;
      var frame = function () {
        queued = false;
        var doc = document.documentElement;
        var max = doc.scrollHeight - window.innerHeight;
        var y = window.scrollY || doc.scrollTop || 0;
        if (bar) bar.style.width = (max > 0 ? Math.min(100, (y / max) * 100) : 0) + '%';
        if (nav && navInner) {
          var on = y > 40;
          nav.style.boxShadow = on ? '0 2px 4px rgba(50,48,47,.03), 0 4px 12px rgba(50,48,47,.06)' : 'none';
          navInner.style.padding = on ? '10px 24px' : '16px 24px';
        }
        if (!reduceMotion) {
          var mid = window.innerHeight / 2;
          px.forEach(function (el) {
            var r = el.getBoundingClientRect();
            var speed = parseFloat(el.getAttribute('data-parallax')) || 1;
            var off = Math.max(-26, Math.min(26, ((mid - (r.top + r.height / 2)) / mid) * 22 * speed));
            el.style.transform = 'translateY(' + off.toFixed(1) + 'px)';
          });
        }
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
        el.style.opacity = '0';
        el.style.transform = 'translateY(18px)';
        el.style.transition = 'opacity .7s ' + EASE + ', transform .7s ' + EASE;
      });
      els.forEach(function (el) {
        if (!el.hasAttribute('data-stagger')) return;
        Array.prototype.forEach.call(el.children, function (c) {
          c.style.opacity = '0';
          c.style.transform = 'translateY(18px) scale(.985)';
          c.style.transition = 'opacity .65s ' + EASE + ', transform .65s ' + EASE;
        });
        el.style.opacity = '1';
        el.style.transform = 'none';
        el.style.transition = 'none';
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

  /* ── Audit form: answers, validation, submit ────────────────────────────── */
  var answers = {};
  var submitted = false;

  function track(name, params) {
    try { if (typeof rwTrack === 'function') rwTrack(name, params || {}); } catch (e) {}
  }

  /* Canada detection — zero-request, resolved once at load. Copied from
     assets/audit-widget.js so the gate means the same thing on both pages:
     1) explicit ?geo=ca|us, 2) a *-CA browser language, 3) a Canadian IANA
     timezone. Anything ambiguous falls back to USD. */
  var IS_CA = (function () {
    try {
      var q = (new URLSearchParams(window.location.search).get('geo') || '').toLowerCase();
      if (q) return q === 'ca';
      var langs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || ''];
      for (var i = 0; i < langs.length; i++) { if (/-ca$/i.test(String(langs[i]))) return true; }
      var tz = (Intl.DateTimeFormat().resolvedOptions().timeZone) || '';
      return /^America\/(St_Johns|Halifax|Glace_Bay|Moncton|Goose_Bay|Blanc-Sablon|Toronto|Nipigon|Thunder_Bay|Iqaluit|Pangnirtung|Atikokan|Winnipeg|Rainy_River|Resolute|Rankin_Inlet|Regina|Swift_Current|Edmonton|Cambridge_Bay|Yellowknife|Inuvik|Creston|Dawson_Creek|Fort_Nelson|Vancouver|Whitehorse|Dawson)$/.test(tz);
    } catch (e) { return false; }
  })();

  /* Revenue bands per listing count — annual gross portfolio revenue. The FIRST
     band in each ladder is the qualification floor: selecting it = below threshold
     = disqualified. These must stay identical to assets/audit-widget.js, or this
     page would qualify leads the live funnel rejects. */
  var REVENUE_BANDS = {
    '1': ['Under $40k', '$40k–$60k', '$60k–$85k', '$85k–$120k', '$120k–$175k', '$175k+'],
    '2-5': ['Under $60k', '$60k–$110k', '$110k–$175k', '$175k–$275k', '$275k–$450k', '$450k+'],
    '6-10': ['Under $150k', '$150k–$300k', '$300k–$475k', '$475k–$700k', '$700k–$1M', '$1M+'],
    '11-25': ['Under $200k', '$200k–$450k', '$450k–$750k', '$750k–$1.25M', '$1.25M–$2.5M', '$2.5M+'],
    '26-100': ['Under $400k', '$400k–$900k', '$900k–$1.5M', '$1.5M–$3M', '$3M–$6M', '$6M+'],
    '100+': ['Under $1M', '$1M–$3M', '$3M–$6M', '$6M–$12M', '$12M–$25M', '$25M+']
  };
  var REVENUE_BANDS_CAD = {
    '1': ['Under CA$55k', 'CA$55k–85k', 'CA$85k–120k', 'CA$120k–165k', 'CA$165k–240k', 'CA$240k+'],
    '2-5': ['Under CA$85k', 'CA$85k–150k', 'CA$150k–240k', 'CA$240k–380k', 'CA$380k–620k', 'CA$620k+'],
    '6-10': ['Under CA$200k', 'CA$200k–400k', 'CA$400k–650k', 'CA$650k–950k', 'CA$950k–1.4M', 'CA$1.4M+'],
    '11-25': ['Under CA$275k', 'CA$275k–620k', 'CA$620k–1M', 'CA$1M–1.7M', 'CA$1.7M–3.4M', 'CA$3.4M+'],
    '26-100': ['Under CA$550k', 'CA$550k–1.25M', 'CA$1.25M–2M', 'CA$2M–4M', 'CA$4M–8M', 'CA$8M+'],
    '100+': ['Under CA$1.4M', 'CA$1.4M–4M', 'CA$4M–8M', 'CA$8M–16M', 'CA$16M–35M', 'CA$35M+']
  };

  // The design labels its portfolio buttons "2 to 5"; the ladders key on "2-5".
  function ladderKey(label) {
    return String(label || '').replace(/\s*to\s*/i, '-').trim() || '2-5';
  }
  function bandsFor(listings) {
    var t = IS_CA ? REVENUE_BANDS_CAD : REVENUE_BANDS;
    return t[ladderKey(listings)] || t['2-5'];
  }

  function renderRevenueBands(listings) {
    var bands = bandsFor(listings);
    $$('[data-opt-group="revenue"]').forEach(function (b, i) {
      if (!bands[i]) { b.style.display = 'none'; return; }
      b.style.display = '';
      b.textContent = bands[i];
      b.setAttribute('data-band-index', String(i));
    });
  }

  function fieldsIn(step) {
    var el = $('[data-audit-step="' + step + '"]');
    return el ? $$('input', el) : [];
  }

  // Step 5's inputs carry no name or type — only placeholders — so classify on those.
  function fieldKind(input) {
    var ph = (input.getAttribute('placeholder') || '').toLowerCase();
    if (ph.indexOf('@') !== -1) return 'email';
    if (/airbnb|abnb|rooms|users\/show/.test(ph)) return 'url';
    if (/\d{3}/.test(ph) || /phone/.test(ph)) return 'phone';
    return 'name';
  }

  function markInvalid(input, bad) {
    input.style.borderColor = bad ? '#B4453C' : '#E0DCDA';
    input.setAttribute('aria-invalid', bad ? 'true' : 'false');
  }

  function digits(s) { return String(s || '').replace(/\D/g, ''); }

  function validateDetails() {
    var ok = true;
    var firstBad = null;
    fieldsIn(5).forEach(function (input) {
      var v = (input.value || '').trim();
      var kind = fieldKind(input);
      var bad = false;
      if (kind === 'email') {
        bad = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      } else if (kind === 'url') {
        // airbnb. covers every country domain; abnb.me is what the app's share sheet copies
        var low = v.toLowerCase();
        bad = !v || !(low.indexOf('airbnb.') !== -1 || low.indexOf('abnb.me') !== -1);
      } else if (kind === 'phone') {
        // North American numbers are exactly 10 digits, same rule as the live widget
        var n = digits(v).length;
        bad = !(n === 10 || (n >= 7 && n <= 15 && v.trim().charAt(0) === '+'));
      } else {
        bad = !v;
      }
      markInvalid(input, bad);
      if (bad) { ok = false; if (!firstBad) firstBad = input; }
    });
    if (firstBad) firstBad.focus();
    return ok;
  }

  function attribution() {
    try { return JSON.parse(localStorage.getItem('rw_attribution') || sessionStorage.getItem('rw_attribution') || '{}'); }
    catch (e) { return {}; }
  }

  function collectDetails() {
    var out = { airbnbUrl: '', name: '', email: '', phone: '' };
    var map = { url: 'airbnbUrl', name: 'name', email: 'email', phone: 'phone' };
    fieldsIn(5).forEach(function (input) {
      out[map[fieldKind(input)]] = (input.value || '').trim();
    });
    return out;
  }

  function submit() {
    if (submitted) return;
    if (!validateDetails()) return;

    var details = collectDetails();
    var bands = bandsFor(answers.portfolio);
    var selectedBand = $('[data-opt-group="revenue"][data-opt-selected]');
    var bandIndex = selectedBand ? Number(selectedBand.getAttribute('data-band-index')) : -1;
    // Qualification gate: the first band in each ladder is the disqualifying floor.
    // Selecting it (and only it) means the portfolio is below threshold.
    var qualified = bandIndex !== 0;

    // The CRM maps phone_code and phone_number separately; the design has one field.
    var phoneRaw = details.phone;
    var phoneCode = phoneRaw.charAt(0) === '+' ? (phoneRaw.match(/^\+\d{1,3}/) || ['+1'])[0] : '+1';
    var phoneNumber = phoneRaw.charAt(0) === '+' ? phoneRaw.slice(phoneCode.length).trim() : phoneRaw;

    var data = {
      listings: answers.portfolio || '',
      issue: answers.issue || '',
      pricing: answers.pricing || '',
      revenue: answers.revenue || (bandIndex >= 0 ? bands[bandIndex] : ''),
      currency: IS_CA ? 'CAD' : 'USD',
      airbnbUrl: details.airbnbUrl,
      name: details.name,
      email: details.email,
      phone: (phoneCode + ' ' + phoneNumber).trim(),
      phone_code: phoneCode,
      phone_number: phoneNumber,
      qualified: qualified,
      disqualifyReason: qualified ? '' : 'below_revenue_floor',
      source: RW_PREVIEW ? 'homepage-redesign' : 'homepage',
      submittedAt: new Date().toISOString(),
      attribution: attribution()
    };

    submitted = true;
    try { sessionStorage.setItem('rw_audit_lead', JSON.stringify(data)); } catch (e) {}

    if (!RW_PREVIEW) {
      // Live behaviour: Meta Lead browser-side, deduped server-side via event_id.
      if (qualified) {
        var eventId = 'lead_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
        try { sessionStorage.setItem('rw_lead_event_id', eventId); } catch (e) {}
        try { fbq('track', 'Lead', { content_name: 'Free Audit', content_category: 'Audit Lead' }, { eventID: eventId }); } catch (e) {}
        data.fbEventId = eventId;
        data.fbContentName = 'Free Audit';
      } else {
        try { fbq('trackCustom', 'UnqualifiedLead', { content_name: 'Free Audit', content_category: 'Audit Lead — Unqualified' }); } catch (e) {}
      }
    }

    track(qualified ? 'generate_lead' : 'generate_lead_unqualified', {
      page: 'homepage-redesign', listings: data.listings, issue: data.issue
    });

    // CRM webhook — fire and forget so the confirmation never waits on Make.com.
    fetch('/api/form-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: 'get_started', payload: data }),
      keepalive: true
    }).catch(function () {});

    if (REDIRECT_AFTER_SUBMIT) {
      window.location.href = qualified ? '/audit-booking' : '/audit-report-coming';
      return;
    }
    C.auditGo(6);
  }

  /* ── Bottom "Book a strategy call" form ────────────────────────────────────
     The design drew this card but left it inert. "Choose a time" means the
     calendar, so it captures the lead and hands off to /audit-booking, which
     reads the same sessionStorage key the live audit widget writes.           */
  function wireCallForm() {
    var card = $('#call');
    if (!card) return;
    var inputs = $$('input', card);
    var btn = $$('button', card).pop();
    if (!inputs.length || !btn) return;

    var kindOf = function (input) {
      var ph = (input.getAttribute('placeholder') || '').toLowerCase();
      if (ph.indexOf('email') !== -1) return 'email';
      if (ph.indexOf('url') !== -1 || ph.indexOf('airbnb') !== -1) return 'url';
      if (ph.indexOf('number') !== -1) return 'listings';
      return 'name';
    };

    inputs.forEach(function (input) {
      if (kindOf(input) === 'listings') { input.setAttribute('inputmode', 'numeric'); }
      input.addEventListener('input', function () { markInvalid(input, false); });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); btn.click(); }
      });
    });

    var sending = false;
    btn.addEventListener('click', function () {
      if (sending) return;
      var data = {};
      var ok = true;
      var firstBad = null;
      inputs.forEach(function (input) {
        var kind = kindOf(input);
        var v = (input.value || '').trim();
        var bad;
        if (kind === 'email') bad = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
        else if (kind === 'url') {
          var low = v.toLowerCase();
          bad = !v || !(low.indexOf('airbnb.') !== -1 || low.indexOf('abnb.me') !== -1);
        } else if (kind === 'listings') bad = !(parseInt(v, 10) >= 1);
        else bad = !v;
        markInvalid(input, bad);
        if (bad) { ok = false; if (!firstBad) firstBad = input; }
        data[kind] = v;
      });
      if (!ok) { if (firstBad) firstBad.focus(); return; }

      sending = true;
      btn.disabled = true;
      var original = btn.textContent;
      btn.textContent = 'Opening the calendar…';

      var payload = {
        name: data.name,
        email: data.email,
        airbnbUrl: data.url,
        listings: data.listings,
        doorCount: data.listings,
        qualified: true,
        source: RW_PREVIEW ? 'homepage-redesign-call' : 'homepage-call',
        submittedAt: new Date().toISOString(),
        attribution: attribution()
      };
      try { sessionStorage.setItem('rw_audit_lead', JSON.stringify(payload)); } catch (e) {}
      track('book_call_submit', { page: 'homepage-redesign', listings: data.listings });

      fetch('/api/form-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: 'get_started', payload: payload }),
        keepalive: true
      }).catch(function () {});

      // Don't make the visitor wait on Make.com to reach the calendar.
      setTimeout(function () { window.location.href = '/audit-booking'; }, 150);
      setTimeout(function () {
        // navigation blocked (offline, popup-less preview) — give the button back
        sending = false;
        btn.disabled = false;
        btn.textContent = original;
      }, 4000);
    });
  }

  /* ── Boot ───────────────────────────────────────────────────────────────── */
  function boot() {
    var root = document.body;
    collectBindings(root);
    C.vals = C.renderVals();
    render(C.vals);
    bindEvents(root);

    C.paintRows(1);
    C.paintAudit(1);
    renderRevenueBands(answers.portfolio || '2 to 5');
    C.animateNumbers();
    C.rankLoop();
    C.rankCardLoop();
    C.autoFactors();
    C.revealOnScroll();
    C.scrollFx();
    C.timelineFx();
    C.rankCardFit();

    // The design's step-5 "next" button is the real submit.
    $$('[data-ev-click="auditNext"]').forEach(function (btn) {
      btn.removeAttribute('data-ev-click');
      btn.addEventListener('click', submit);
    });
    // Enter anywhere in the details step submits.
    fieldsIn(5).forEach(function (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); submit(); }
      });
      input.addEventListener('input', function () { markInvalid(input, false); });
    });

    wireCallForm();

    // Smooth in-page scrolling that clears the sticky nav.
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute('href').slice(1);
      var target = id && document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      var nav = $('[data-nav]');
      var offset = nav ? nav.getBoundingClientRect().height + 12 : 0;
      var y = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: y, behavior: reduceMotion ? 'auto' : 'smooth' });
      if (history.replaceState) history.replaceState(null, '', '#' + id);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
