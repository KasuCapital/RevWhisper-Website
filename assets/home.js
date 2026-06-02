(function() {
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── 1. Global scroll-reveal observer ── */
  var revealIO = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');

        /* Revenue Gap counter trigger */
        if (entry.target.id === 'rg-section' && !entry.target.dataset.counted) {
          entry.target.dataset.counted = '1';
          animateRevenueGap();
          /* Trigger divider line draw */
          var rgDiv = document.querySelector('.rg-divider');
          if (rgDiv) setTimeout(function(){ rgDiv.classList.add('rg-anim'); }, 600);
        }
      }
    });
  }, { threshold: 0.07, rootMargin: '0px 0px -28px 0px' });

  document.querySelectorAll('.r').forEach(function(el) {
    /* Skip .hiw-vstep elements — they get custom stagger below */
    if (!el.classList.contains('hiw-vstep')) {
      revealIO.observe(el);
    }
  });

  /* ── 2. Logo carousel duplication ── */
  var track = document.querySelector('.logo-track');
  if (track) track.innerHTML += track.innerHTML;

  /* ── 3. Revenue Gap animated counter ── */
  function renderDigits(n, settle) {
    var digitsEl = document.getElementById('rg-digits');
    if (!digitsEl) return;
    var str = n.toLocaleString('en-US');
    var html = '';
    for (var i = 0; i < str.length; i++) {
      if (settle) {
        html += '<span class="rg-digit" style="animation:digitSettle .6s cubic-bezier(.16,1,.3,1) ' + (i * 0.05) + 's both">' + str[i] + '</span>';
      } else {
        html += '<span class="rg-digit">' + str[i] + '</span>';
      }
    }
    digitsEl.innerHTML = html;
  }
  /* Init with 0 */
  renderDigits(0, false);

  function animateRevenueGap() {
    var glowEl = document.getElementById('rg-glow');
    /* Reduced motion: skip straight to final value */
    if (reducedMotion) {
      renderDigits(25892, false);
      if (glowEl) glowEl.classList.add('show');
      return;
    }
    var end = 25892, dur = 2800, step = 16, totalSteps = dur / step;
    var currentStep = 0;
    var timer = setInterval(function() {
      currentStep++;
      var progress = 1 - Math.pow(1 - currentStep / totalSteps, 3);
      if (currentStep >= totalSteps) {
        clearInterval(timer);
        renderDigits(end, true);
        if (glowEl) glowEl.classList.add('show');
      } else {
        renderDigits(Math.floor(end * progress), false);
      }
    }, step);
  }

  /* ── 4. Solution bento grid animations ── */
  (function() {
    var bentoFired = false;

    function animateRankScore(el, startVal, endVal, duration) {
      var startTime = null;
      function tick(timestamp) {
        if (!startTime) startTime = timestamp;
        var progress = Math.min((timestamp - startTime) / duration, 1);
        var eased = 1 - Math.pow(1 - progress, 3);
        var current = startVal + (endVal - startVal) * eased;
        el.textContent = current.toFixed(1);
        if (progress < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }

    function animateRanking(grid) {
      var wrap = grid.querySelector('.bt-rank-list');
      if (!wrap) return;
      var rows = wrap.querySelectorAll('.bt-rank-row');
      var yourRow = wrap.querySelector('.bt-rank-row.yours');

      // Phase 1: Stagger fade-in of rows (0-240ms)
      rows.forEach(function(row, i) {
        setTimeout(function() { row.classList.add('show'); }, i * 80);
      });

      // Phase 1b: Fill initial score bars and tick counters (200-600ms)
      setTimeout(function() {
        rows.forEach(function(row) {
          var barFill = row.querySelector('.bt-rank-bar-fill');
          if (barFill) barFill.style.width = barFill.dataset.width + '%';
          var scoreEl = row.querySelector('.bt-rank-score');
          if (scoreEl) {
            var target = row.classList.contains('yours')
              ? parseFloat(scoreEl.dataset.initial || scoreEl.dataset.target)
              : parseFloat(scoreEl.dataset.target);
            animateRankScore(scoreEl, 0, target, 400);
          }
        });
      }, 200);

      // Phase 3: Boost your property's score (1100ms)
      setTimeout(function() {
        var yourBar = yourRow.querySelector('.bt-rank-bar-fill');
        var yourScore = yourRow.querySelector('.bt-rank-score');
        yourBar.style.width = yourBar.dataset.width2 + '%';
        var initial = parseFloat(yourScore.dataset.initial);
        var final2 = parseFloat(yourScore.dataset.target);
        animateRankScore(yourScore, initial, final2, 500);
        yourRow.classList.add('highlighted');
      }, 1100);

      // Phase 4: Reorder rows (1700ms)
      setTimeout(function() {
        var rowHeight = rows[0].offsetHeight + 6;
        rows.forEach(function(row) {
          var startPos = parseInt(row.dataset.start);
          var endPos = parseInt(row.dataset.end);
          var delta = (endPos - startPos) * rowHeight;
          row.style.transform = 'translateY(' + delta + 'px)';
          row.querySelector('.bt-rank-badge').classList.add('swapped');
          if (row.classList.contains('yours')) {
            row.querySelector('.bt-rank-badge').classList.add('promoted');
          }
        });
      }, 1700);

      // Phase 5: Celebration (2300ms)
      setTimeout(function() {
        var arrow = yourRow.querySelector('.bt-rank-arrow');
        if (arrow) arrow.classList.add('show');
        yourRow.classList.add('celebrate');
        yourRow.querySelector('.bt-rank-badge').classList.add('glow');
      }, 2300);
    }

    function animateChart(grid) {
      var line = grid.querySelector('.bt-chart-line');
      if (!line) return;
      var len = line.getTotalLength();
      line.style.strokeDasharray = len;
      line.style.strokeDashoffset = len;
      requestAnimationFrame(function() { line.style.strokeDashoffset = '0'; });
      grid.querySelectorAll('.bt-chart-dot').forEach(function(dot, i) {
        setTimeout(function() { dot.classList.add('show'); }, 300 + i * 80);
      });
    }

    function buildHistogram(grid) {
      var svg = grid.querySelector('.bt-histo-svg');
      if (!svg || svg.dataset.built) return;
      svg.dataset.built = '1';
      var R = [3,6,10,16,24,34,44,55,65,74,82,88,93,96,97,96,93,88,82,74,65,55,44,34,26,20,15,11,8,6,5,4,3,3,2,2,2,1,1,1];
      var G = [1,1,2,3,5,7,10,14,20,27,35,44,54,63,72,80,86,91,94,96,96,94,90,84,76,66,55,44,34,25,18,13,9,6,4,3,2,2,1,1];
      var B = [1,1,1,1,2,2,3,4,5,7,9,12,16,20,26,32,40,48,57,66,74,81,87,91,94,96,96,94,90,84,76,66,54,42,32,23,16,10,6,3];
      var n = R.length, barW = 4.8, gap = 1.2, baseY = 118, maxH = 100;
      var totalW = n * (barW + gap) - gap;
      var startX = (240 - totalW) / 2;
      var ns = 'http://www.w3.org/2000/svg';
      [[R,'rgba(192,118,82,.35)'],[B,'rgba(88,120,168,.3)'],[G,'rgba(74,103,65,.42)']].forEach(function(ch) {
        ch[0].forEach(function(val, i) {
          var h = val * maxH / 100;
          if (h < 1) h = 1;
          var rect = document.createElementNS(ns, 'rect');
          rect.setAttribute('x', startX + i * (barW + gap));
          rect.setAttribute('y', baseY - h);
          rect.setAttribute('width', barW);
          rect.setAttribute('height', h);
          rect.setAttribute('rx', '1');
          rect.setAttribute('fill', ch[1]);
          rect.classList.add('bt-histo-bar');
          rect.dataset.delay = i * 15;
          svg.appendChild(rect);
        });
      });
    }

    function animateHistogram(grid) {
      grid.querySelectorAll('.bt-histo-bar').forEach(function(bar) {
        setTimeout(function() { bar.classList.add('show'); }, parseInt(bar.dataset.delay) || 0);
      });
    }

    function animateRadar(grid) {
      var polys = grid.querySelectorAll('.bt-radar-poly');
      polys.forEach(function(poly, i) {
        var isYou = poly.classList.contains('bt-radar-you');
        var delay = isYou ? 450 : i * 120;
        setTimeout(function() { poly.classList.add('show'); }, delay);
      });
    }

    function animateMap(grid) {
      grid.querySelectorAll('.bt-map-pin').forEach(function(pin) {
        setTimeout(function() { pin.classList.add('show'); }, parseInt(pin.dataset.delay) || 0);
      });
      grid.querySelectorAll('.bt-map-arc').forEach(function(arc, i) {
        setTimeout(function() { arc.classList.add('show'); }, 200 + i * 80);
      });
    }

    var bentoObs = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting && !bentoFired) {
          bentoFired = true;
          var grid = entry.target;
          animateChart(grid);
          animateRanking(grid);
          buildHistogram(grid);
          setTimeout(function() { animateHistogram(grid); }, 50);
          setTimeout(function() { animateRadar(grid); }, 100);
          setTimeout(function() { animateMap(grid); }, 150);
          bentoObs.unobserve(grid);
        }
      });
    }, { threshold: 0.15 });

    var bg = document.querySelector('.bento-grid');
    if (bg) bentoObs.observe(bg);
  })();

  /* ── 5a. Webinar Countdown Timer ── */
  (function(){
    var WEBINAR_DAYS=[3];
    var WEBINAR_HOUR=12;
    var daysEl=document.getElementById('wb-days');
    var hrsEl=document.getElementById('wb-hours');
    var minsEl=document.getElementById('wb-mins');
    var secsEl=document.getElementById('wb-secs');
    if(!daysEl)return;

    function getNextWebinar(){
      var now=new Date();
      var est=new Date(now.toLocaleString('en-US',{timeZone:'America/New_York'}));
      var day=est.getDay();
      var hour=est.getHours();
      var daysAhead=null;
      for(var i=0;i<7;i++){
        var check=(day+i)%7;
        if(WEBINAR_DAYS.indexOf(check)!==-1){
          if(i===0&&hour>=WEBINAR_HOUR+1)continue;
          daysAhead=i;break;
        }
      }
      if(daysAhead===null)daysAhead=7;
      var next=new Date(est);
      next.setDate(next.getDate()+daysAhead);
      next.setHours(WEBINAR_HOUR,0,0,0);
      return next.getTime()-est.getTime();
    }

    function setVal(el,val){
      var v=String(val);
      if(el.textContent!==v){
        el.textContent=v;
        el.classList.remove('wb-tick');
        void el.offsetWidth;
        el.classList.add('wb-tick');
      }
    }

    function update(){
      var diff=getNextWebinar();
      if(diff<=0){
        document.getElementById('wb-timer').innerHTML='<span class="wb-live-banner">Happening Now!</span>';
        return;
      }
      var s=Math.floor(diff/1000);
      var d=Math.floor(s/86400);s%=86400;
      var h=Math.floor(s/3600);s%=3600;
      var m=Math.floor(s/60);s%=60;
      setVal(daysEl,d);
      setVal(hrsEl,h);
      setVal(minsEl,String(m).padStart(2,'0'));
      setVal(secsEl,String(s).padStart(2,'0'));
    }
    update();
    setInterval(update,1000);
  })();


  /* ── 5b2. CTA floating money – removed per feedback ── */
  (function() {
    /* Money rain physics removed — CTA section is now clean text only */
    return;

    /* [w, h] for each element — bills 2:1, coins square */
    var dims = [[110,55],[90,45],[40,40],[100,50],[35,35],[120,60],[32,32],[95,48],[80,40],[38,38]];
    /* SVG templates for spawning new ones */
    var billSvg = '<svg viewBox="0 0 120 60" fill="none"><rect x="2" y="2" width="116" height="56" rx="6" stroke="currentColor" stroke-width="2"/><rect x="10" y="10" width="100" height="40" rx="3" stroke="currentColor" stroke-width="1" stroke-dasharray="4 3"/><circle cx="60" cy="30" r="14" stroke="currentColor" stroke-width="1.5"/><text x="60" y="36" text-anchor="middle" fill="currentColor" font-size="18" font-weight="600">$</text></svg>';
    var coinSvg = '<svg viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="17" stroke="currentColor" stroke-width="2"/><circle cx="20" cy="20" r="12" stroke="currentColor" stroke-width="1"/><text x="20" y="26" text-anchor="middle" fill="currentColor" font-size="16" font-weight="600">$</text></svg>';

    var items = [];
    var spawnTimer = null;
    var running = false, rafId = null;
    var cW, cH;
    var PAD = 6;
    var MAX_SPAWN = 60;
    var GRAVITY = 0.012;
    var SWAY_STRENGTH = 0.003;
    var phase = 'filling'; /* filling | draining | resetting */
    var drainStart = 0;
    var DRAIN_DURATION = 1200; /* ms to fade out */

    function measure() {
      var r = card.getBoundingClientRect();
      cW = r.width; cH = r.height;
    }

    /* Drop a new item from the top */
    function dropItem(el, w, h) {
      var x = 20 + Math.random() * (cW - w - 40);
      return {
        el: el, x: x, y: -h - Math.random() * 60, w: w, h: h,
        cx: x + w / 2, cy: -h / 2,
        r: Math.max(w, h) / 2,
        vx: (Math.random() - 0.5) * 0.6,
        vy: 0.3 + Math.random() * 0.3,
        rot: (Math.random() - 0.5) * 40,
        vr: (Math.random() - 0.5) * 0.4,
        swayPhase: Math.random() * Math.PI * 2,
        swaySpeed: 0.008 + Math.random() * 0.012,
        opacity: 0,
        active: true,
        spawned: false /* true if dynamically created (not from original HTML) */
      };
    }

    /* Spawn a new money element dynamically */
    function spawnNew() {
      if (items.length >= MAX_SPAWN) return;
      var isCoin = Math.random() < 0.35;
      var w, h;
      if (isCoin) {
        var sz = 28 + Math.floor(Math.random() * 18);
        w = sz; h = sz;
      } else {
        w = 70 + Math.floor(Math.random() * 60);
        h = Math.round(w / 2);
      }
      var el = document.createElement('span');
      el.className = 'cta-money';
      el.innerHTML = isCoin ? coinSvg : billSvg;
      el.style.width = w + 'px';
      el.style.height = h + 'px';
      el.style.opacity = '0';
      card.insertBefore(el, card.firstChild);
      var item = dropItem(el, w, h);
      item.spawned = true;
      items.push(item);
    }

    /* Check if the section is "full" — most items settled */
    function isFull() {
      if (items.length < MAX_SPAWN) return false;
      var settled = 0;
      for (var i = 0; i < items.length; i++) {
        if (items[i].active && Math.abs(items[i].vy) < 0.15 && items[i].y > 0) settled++;
      }
      return settled >= items.length * 0.7;
    }

    /* Start the drain — fade everything out */
    function startDrain() {
      phase = 'draining';
      drainStart = Date.now();
      if (spawnTimer) { clearInterval(spawnTimer); spawnTimer = null; }
    }

    /* Reset — remove spawned elements, re-hide originals, restart */
    function resetCycle() {
      phase = 'resetting';
      /* Remove dynamically spawned elements */
      for (var i = items.length - 1; i >= 0; i--) {
        if (items[i].spawned) {
          items[i].el.remove();
        } else {
          items[i].el.style.opacity = '0';
        }
      }
      items = [];

      /* Brief pause then restart filling */
      setTimeout(function() {
        phase = 'filling';
        startFilling();
      }, 600);
    }

    function startFilling() {
      var idx = 0;
      spawnTimer = setInterval(function() {
        if (phase !== 'filling') return;
        if (idx < els.length) {
          var d = dims[idx] || [60, 30];
          els[idx].style.width = d[0] + 'px';
          els[idx].style.height = d[1] + 'px';
          items.push(dropItem(els[idx], d[0], d[1]));
          idx++;
        } else {
          spawnNew();
        }
      }, 500);
    }

    function init() {
      measure();
      items = [];
      for (var i = 0; i < els.length; i++) {
        els[i].style.opacity = '0';
        var d = dims[i] || [60, 30];
        els[i].style.width = d[0] + 'px';
        els[i].style.height = d[1] + 'px';
      }
    }

    function tick() {
      var now = Date.now();

      /* Drain phase — fade all out then reset */
      if (phase === 'draining') {
        var elapsed = now - drainStart;
        var progress = Math.min(1, elapsed / DRAIN_DURATION);
        for (var i = 0; i < items.length; i++) {
          var p = items[i];
          /* Drop everything fast downward during drain */
          p.vy += 0.08;
          p.x += p.vx;
          p.y += p.vy;
          p.rot += p.vr * 2;
          p.opacity = Math.max(0, 1 - progress);
          p.el.style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px) rotate(' + p.rot.toFixed(1) + 'deg)';
          p.el.style.opacity = p.opacity.toFixed(3);
        }
        if (progress >= 1) resetCycle();
        if (running) rafId = requestAnimationFrame(tick);
        return;
      }

      if (phase === 'resetting') {
        if (running) rafId = requestAnimationFrame(tick);
        return;
      }

      /* Normal filling phase */
      for (var i = 0; i < items.length; i++) {
        var p = items[i];
        if (!p.active) continue;

        /* Gravity pulls down */
        p.vy += GRAVITY;

        /* Gentle side-to-side sway */
        p.swayPhase += p.swaySpeed;
        p.vx += Math.sin(p.swayPhase) * SWAY_STRENGTH;

        /* Clamp speeds */
        if (p.vx > 0.8) p.vx = 0.8;
        if (p.vx < -0.8) p.vx = -0.8;
        if (p.vy > 1.5) p.vy = 1.5;

        /* Move */
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.cx = p.x + p.w / 2;
        p.cy = p.y + p.h / 2;

        /* Fade in */
        if (p.opacity < 1) {
          p.opacity = Math.min(1, p.opacity + 0.025);
        }

        /* Slow rotation as it settles */
        p.vr *= 0.998;

        /* Side walls */
        if (p.x < 0) { p.x = 0; p.vx *= -0.5; }
        if (p.x > cW - p.w) { p.x = cW - p.w; p.vx *= -0.5; }

        /* Floor */
        if (p.y > cH - p.h) {
          p.y = cH - p.h;
          p.vy *= -0.2;
          p.vx *= 0.9;
          p.vr *= 0.8;
          if (Math.abs(p.vy) < 0.05) p.vy = 0;
        }

        /* Collision */
        for (var j = i + 1; j < items.length; j++) {
          var q = items[j];
          if (!q.active) continue;
          var dx = q.cx - p.cx;
          var dy = q.cy - p.cy;
          var dist = Math.sqrt(dx * dx + dy * dy);
          var minDist = p.r + q.r + PAD;
          if (dist < minDist && dist > 0.1) {
            var nx = dx / dist;
            var ny = dy / dist;
            var overlap = (minDist - dist) * 0.35;
            p.x -= nx * overlap;
            p.y -= ny * overlap;
            q.x += nx * overlap;
            q.y += ny * overlap;
            p.cx = p.x + p.w / 2;
            p.cy = p.y + p.h / 2;
            q.cx = q.x + q.w / 2;
            q.cy = q.y + q.h / 2;
            p.vx -= nx * 0.12;
            p.vy -= ny * 0.12;
            q.vx += nx * 0.12;
            q.vy += ny * 0.12;
          }
        }

        /* Render */
        p.el.style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px) rotate(' + p.rot.toFixed(1) + 'deg)';
        p.el.style.opacity = p.opacity.toFixed(3);
      }

      /* Check if full — trigger drain */
      if (phase === 'filling' && isFull()) {
        startDrain();
      }

      if (running) rafId = requestAnimationFrame(tick);
    }

    var started = false;
    var visObs = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting && !running) {
          running = true;
          rafId = requestAnimationFrame(tick);
          if (!started) { started = true; startFilling(); }
        } else if (!entry.isIntersecting && running) {
          running = false;
          if (rafId) cancelAnimationFrame(rafId);
        }
      });
    }, { threshold: 0.05 });
    visObs.observe(card);

    init();
    window.addEventListener('resize', function() { measure(); });
  })();

  /* ── 5c. Pricing section animations ── */
  (function() {
    var section = document.querySelector('#pricing');
    if (!section) return;
    var cards = section.querySelectorAll('.price-card');
    var animated = false;

    function animateCards() {
      if (animated) return;
      animated = true;

      // Stagger card reveal
      cards.forEach(function(card, i) {
        var delay = reducedMotion ? 0 : 200 * i;
        setTimeout(function() {
          card.classList.add('in');
        }, delay);
      });

      // Collect ALL features across all cards sequentially
      var allFeats = [];
      cards.forEach(function(card) {
        var feats = card.querySelectorAll('.price-feat');
        feats.forEach(function(f) { allFeats.push(f); });
      });

      // Animate each feature one by one across all cards
      var featStartDelay = reducedMotion ? 0 : 500;
      var featInterval = reducedMotion ? 0 : 100;
      allFeats.forEach(function(feat, i) {
        setTimeout(function() {
          feat.classList.add('in');
        }, featStartDelay + i * featInterval);
      });
    }

    var pricingObs = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          animateCards();
          pricingObs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.2 });
    pricingObs.observe(section);
  })();

  /* ── 5d. Stakes section animations ── */
  (function() {
    var section = document.getElementById('stakes');
    if (!section) return;
    var blocks = section.querySelectorAll('.stakes-block');
    var callout = section.querySelector('.stakes-callout');
    var card = section.querySelector('.stakes-card');
    var rows = section.querySelectorAll('.stakes-row');

    function animateStakes() {
      /* Card slides up at the same time as text */
      if (card) {
        setTimeout(function() { card.classList.add('in'); }, 80);
      }

      /* Blocks stagger in from left */
      blocks.forEach(function(b, i) {
        setTimeout(function() { b.classList.add('in'); }, i * 200);
      });

      /* Callout springs in after blocks */
      if (callout) {
        setTimeout(function() { callout.classList.add('in'); }, blocks.length * 200 + 150);
      }

      /* Rows slide in one by one after card appears */
      rows.forEach(function(r, i) {
        setTimeout(function() { r.classList.add('in'); }, 400 + i * 100);
      });
    }

    var stakesObs = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          animateStakes();
          stakesObs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    stakesObs.observe(section);
  })();

  /* ── 5e. Stakes slow water fill (time-based) ── */
  (function() {
    var section = document.getElementById('stakes');
    if (!section || reducedMotion) return;
    var fill = section.querySelector('.stakes-fill');
    if (!fill) return;

    var DURATION = 8000;   /* ms to fill from 0 → 100 % */
    var startTime = null;
    var rafId = null;
    var started = false;

    function tick(now) {
      if (!startTime) startTime = now;
      var elapsed = now - startTime;
      var pct = Math.min(100, (elapsed / DURATION) * 100);
      fill.style.height = pct + '%';
      if (pct < 100) {
        rafId = requestAnimationFrame(tick);
      }
    }

    var obs = new IntersectionObserver(function(entries) {
      entries.forEach(function(e) {
        if (e.isIntersecting && !started) {
          started = true;
          rafId = requestAnimationFrame(tick);
        }
      });
    }, { threshold: 0.15 });
    obs.observe(section);
  })();

  /* ── 6. How-it-works step stagger + vertical line ── */
  (function() {
    var stepsAnimated = false;

    /* ── Dynamic calendar build ── */
    (function() {
      var now = new Date();
      var year = now.getFullYear();
      var month = now.getMonth(); // 0-indexed
      var monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      var daysInMonth = new Date(year, month + 1, 0).getDate();
      var firstDay = new Date(year, month, 1).getDay(); // 0=Sun

      // Set month label
      var monthEl = document.querySelector('.hiw-cal-month');
      if (monthEl) monthEl.textContent = monthNames[month] + ' ' + year;

      // Pick which days are booked (~90% occupancy, leave 2-3 random gaps)
      var unbookedCount = Math.max(2, Math.floor(daysInMonth * 0.08));
      var unbookedDays = {};
      while (Object.keys(unbookedDays).length < unbookedCount) {
        var rDay = Math.floor(Math.random() * daysInMonth) + 1;
        unbookedDays[rDay] = true;
      }
      var totalBooked = daysInMonth - unbookedCount;

      // Build grid cells
      var grid = document.querySelector('.hiw-cal-grid');
      if (!grid) return;

      // Empty cells for offset
      for (var e = 0; e < firstDay; e++) {
        var empty = document.createElement('span');
        empty.className = 'hiw-cal-cell empty';
        grid.appendChild(empty);
      }

      // Day cells
      var bookedCells = [];
      for (var d = 1; d <= daysInMonth; d++) {
        var cell = document.createElement('span');
        cell.className = 'hiw-cal-cell';
        cell.textContent = d;
        if (!unbookedDays[d]) {
          cell.classList.add('booked');
          bookedCells.push(cell);
        }
        grid.appendChild(cell);
      }

      // Trailing empty cells
      var totalCells = firstDay + daysInMonth;
      var trailing = (7 - (totalCells % 7)) % 7;
      for (var t = 0; t < trailing; t++) {
        var te = document.createElement('span');
        te.className = 'hiw-cal-cell empty';
        grid.appendChild(te);
      }

      // Store for animation trigger
      window._hiwCalData = { bookedCells: bookedCells, totalBooked: totalBooked };
    })();

    /* Observe header and visual column */
    document.querySelectorAll('.hiw-header.r, .hiw-visual.r').forEach(function(el) {
      revealIO.observe(el);
    });

    /* ── Calendar fill animation on visual reveal ── */
    var calAnimated = false;
    var calObs = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting && !calAnimated) {
          calAnimated = true;
          var data = window._hiwCalData;
          if (!data) return;
          var countEl = document.querySelector('.hiw-cal-count');
          var cells = data.bookedCells;
          var total = data.totalBooked;
          var count = 0;
          var delay = reducedMotion ? 0 : 150;
          var startDelay = reducedMotion ? 0 : 800; // wait for card slide-in

          if (reducedMotion) {
            cells.forEach(function(c) { c.classList.add('filled'); });
            if (countEl) countEl.textContent = total;
          } else {
            cells.forEach(function(cell, i) {
              setTimeout(function() {
                cell.classList.add('filled');
                count++;
                if (countEl) countEl.textContent = count;
              }, startDelay + i * delay);
            });
          }
          calObs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    var visual = document.querySelector('.hiw-visual');
    if (visual) calObs.observe(visual);

    var stepsObs = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting && !stepsAnimated) {
          stepsAnimated = true;

          var vline = entry.target.querySelector('.hiw-vline');
          if (vline) {
            if (reducedMotion) {
              vline.classList.add('in');
            } else {
              setTimeout(function() { vline.classList.add('in'); }, 100);
            }
          }

          var steps = entry.target.querySelectorAll('.hiw-vstep.r');
          if (reducedMotion) {
            steps.forEach(function(s) { s.classList.add('in'); });
          } else {
            steps.forEach(function(step, i) {
              setTimeout(function() { step.classList.add('in'); }, 150 + i * 150);
            });
          }

          stepsObs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    var stepsCol = document.querySelector('.hiw-steps-col');
    if (stepsCol) stepsObs.observe(stepsCol);

    /* Fallback for elements already in viewport on load */
    setTimeout(function() {
      if (!stepsAnimated && stepsCol) {
        var rect = stepsCol.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom > 0) {
          stepsAnimated = true;
          var vline = stepsCol.querySelector('.hiw-vline');
          if (vline) vline.classList.add('in');
          stepsCol.querySelectorAll('.hiw-vstep.r').forEach(function(s, i) {
            setTimeout(function() { s.classList.add('in'); }, i * 150);
          });
        }
      }
      /* Calendar fallback */
      if (!calAnimated && visual) {
        var vRect = visual.getBoundingClientRect();
        if (vRect.top < window.innerHeight && vRect.bottom > 0) {
          calAnimated = true;
          var data = window._hiwCalData;
          if (data) {
            var countEl = document.querySelector('.hiw-cal-count');
            data.bookedCells.forEach(function(cell, i) {
              setTimeout(function() {
                cell.classList.add('filled');
                if (countEl) countEl.textContent = i + 1;
              }, 800 + i * 150);
            });
          }
        }
      }
    }, 100);
  })();

  /* ── 7b. Before / After calendar build + animation ── */
  (function() {
    var baWrap = document.querySelector('.hiw-ba-wrap');
    if (!baWrap) return;

    var now = new Date();
    var year = now.getFullYear();
    var month = now.getMonth();
    var monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var firstDay = new Date(year, month, 1).getDay();

    /* Set month labels */
    var monthEls = baWrap.querySelectorAll('.ba-month');
    monthEls.forEach(function(el) { el.textContent = monthNames[month] + ' ' + year; });

    /* Generate random bookings */
    function pickUnbooked(total, unbookedPct) {
      var count = Math.max(1, Math.round(total * unbookedPct));
      var set = {};
      while (Object.keys(set).length < count) { set[Math.floor(Math.random() * total) + 1] = true; }
      return set;
    }
    var beforeUnbooked = pickUnbooked(daysInMonth, 0.60); /* ~40% occupancy */
    var afterUnbooked = pickUnbooked(daysInMonth, 0.08);   /* ~92% occupancy */

    var beforeBooked = daysInMonth - Object.keys(beforeUnbooked).length;
    var afterBooked = daysInMonth - Object.keys(afterUnbooked).length;

    /* Build grids */
    function buildGrid(gridEl, unbookedMap) {
      var cells = [];
      for (var e = 0; e < firstDay; e++) {
        var empty = document.createElement('span');
        empty.className = 'ba-cell empty';
        gridEl.appendChild(empty);
      }
      for (var d = 1; d <= daysInMonth; d++) {
        var cell = document.createElement('span');
        cell.className = 'ba-cell';
        cell.textContent = d;
        if (!unbookedMap[d]) { cell.classList.add('booked'); cells.push(cell); }
        gridEl.appendChild(cell);
      }
      var trailing = (7 - ((firstDay + daysInMonth) % 7)) % 7;
      for (var t = 0; t < trailing; t++) {
        var te = document.createElement('span');
        te.className = 'ba-cell empty';
        gridEl.appendChild(te);
      }
      return cells;
    }

    var beforeGrid = baWrap.querySelector('.before .ba-grid');
    var afterGrid = baWrap.querySelector('.after .ba-grid');
    var beforeCells = buildGrid(beforeGrid, beforeUnbooked);
    var afterCells = buildGrid(afterGrid, afterUnbooked);

    /* Animate on scroll */
    var baAnimated = false;
    var baObs = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting && !baAnimated) {
          baAnimated = true;
          var beforeCount = baWrap.querySelector('.before .ba-count');
          var afterCount = baWrap.querySelector('.after .ba-count');

          if (reducedMotion) {
            beforeCells.forEach(function(c) { c.classList.add('filled'); });
            afterCells.forEach(function(c) { c.classList.add('filled'); });
            if (beforeCount) beforeCount.textContent = beforeBooked;
            if (afterCount) afterCount.textContent = afterBooked;
            return;
          }

          /* Phase 1: Before cells fill (grey, 100ms stagger) */
          var bc = 0;
          beforeCells.forEach(function(cell, i) {
            setTimeout(function() {
              cell.classList.add('filled');
              bc++;
              if (beforeCount) beforeCount.textContent = bc;
            }, i * 100);
          });

          /* Phase 2: After cells fill (green, 80ms stagger, starts after before finishes + 600ms pause) */
          var afterDelay = beforeCells.length * 100 + 600;
          var ac = 0;
          afterCells.forEach(function(cell, i) {
            setTimeout(function() {
              cell.classList.add('filled');
              ac++;
              if (afterCount) afterCount.textContent = ac;
            }, afterDelay + i * 80);
          });

          baObs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.2 });

    baObs.observe(baWrap);
  })();

  /* ── 8. Stakes ranking decay ── */
  (function() {
    var section = document.getElementById('stakes');
    if (!section) return;
    var list = document.getElementById('stakesRankList');
    if (!list) return;
    if (reducedMotion) return;

    var rows = Array.prototype.slice.call(list.querySelectorAll('.stakes-row'));
    if (!rows.length) return;

    function formatRevenueK(value) {
      return '$' + Math.round(value).toLocaleString() + 'k/yr';
    }

    var entries = rows.map(function(row, idx) {
      var scoreEl = row.querySelector('.stakes-score');
      var startScore = parseFloat(scoreEl ? scoreEl.dataset.revenue : '170') || 170;
      return {
        row: row,
        posEl: row.querySelector('.stakes-pos'),
        scoreEl: scoreEl,
        initialRank: idx + 1,
        targetRank: idx + 1,
        rankFloat: idx + 1,
        score: startScore,
        drift: parseFloat(row.dataset.drift) || 0,
        yCurrent: 0,
        yTarget: 0,
        nextNudgeAt: row.classList.contains('yours')
          ? 3500 + Math.random() * 2800
          : 4500 + Math.random() * 4500
      };
    });

    var slotOffsets = [];
    function measureSlots() {
      slotOffsets = rows.map(function(row) { return row.offsetTop; });
    }
    measureSlots();

    var resizeTimer = null;
    window.addEventListener('resize', function() {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(measureSlots, 120);
    });

    var animId = null;
    var isVisible = false;
    var elapsedMs = 0;
    var lastTs = 0;
    var reorderTimer = 0;

    function refreshTargetRanks() {
      var sorted = entries.slice().sort(function(a, b) {
        var diff = b.score - a.score;
        // Keep relative order when scores are very close to avoid jitter swaps.
        if (Math.abs(diff) < 0.18) return a.targetRank - b.targetRank;
        return diff;
      });
      sorted.forEach(function(entry, idx) {
        entry.targetRank = idx + 1;
      });
    }

    function animate(now) {
      if (!isVisible) return;
      if (!lastTs) lastTs = now;
      var dt = Math.min((now - lastTs) / 1000, 0.06);
      lastTs = now;
      elapsedMs += dt * 1000;
      reorderTimer += dt;

      entries.forEach(function(entry) {
        entry.score -= entry.drift * dt * 0.9;

        if (entry.row.classList.contains('managed') && elapsedMs >= entry.nextNudgeAt) {
          entry.score += 0.12 + Math.random() * 0.32;
          entry.nextNudgeAt = elapsedMs + 5000 + Math.random() * 6000;
        }

        if (entry.row.classList.contains('yours') && elapsedMs >= entry.nextNudgeAt) {
          entry.score -= 0.25 + Math.random() * 0.55;
          entry.nextNudgeAt = elapsedMs + 4200 + Math.random() * 5200;
        }

        if (entry.score > 240) entry.score = 240;
        if (entry.score < 130) entry.score = 130;
      });

      if (reorderTimer >= 0.55) {
        refreshTargetRanks();
        reorderTimer = 0;
      }

      entries.forEach(function(entry) {
        entry.rankFloat += (entry.targetRank - entry.rankFloat) * 0.07;

        var low = Math.max(0, Math.min(slotOffsets.length - 1, Math.floor(entry.rankFloat) - 1));
        var high = Math.max(0, Math.min(slotOffsets.length - 1, Math.ceil(entry.rankFloat) - 1));
        var frac = entry.rankFloat - Math.floor(entry.rankFloat);
        if (!isFinite(frac) || frac < 0) frac = 0;

        var lowY = slotOffsets[low] || 0;
        var highY = slotOffsets[high] || lowY;
        var desiredAbsY = lowY + (highY - lowY) * frac;
        var homeAbsY = slotOffsets[entry.initialRank - 1] || 0;
        entry.yTarget = desiredAbsY - homeAbsY;
        entry.yCurrent += (entry.yTarget - entry.yCurrent) * 0.16;

        entry.row.style.transform = 'translateY(' + entry.yCurrent.toFixed(2) + 'px)';
        entry.row.style.zIndex = String(100 - Math.round(entry.rankFloat * 10));

        if (entry.posEl) {
          var rankText = Math.max(1, Math.min(slotOffsets.length, Math.round(entry.rankFloat)));
          entry.posEl.textContent = String(rankText);
        }
        if (entry.scoreEl) entry.scoreEl.textContent = formatRevenueK(entry.score);
      });

      animId = requestAnimationFrame(animate);
    }

    var stakesObs = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          isVisible = true;
          refreshTargetRanks();
          if (!animId) animId = requestAnimationFrame(animate);
        } else {
          isVisible = false;
          if (animId) { cancelAnimationFrame(animId); animId = null; }
          lastTs = 0;
        }
      });
    }, { threshold: 0.05 });

    stakesObs.observe(section);
  })();

  /* Header scroll/hamburger logic lives in /assets/header.js */

  /* ── YouTube facade: load the real iframe on click ── */
  document.querySelectorAll('.yt-facade').forEach(function(btn){
    btn.addEventListener('click', function(){
      var id = btn.getAttribute('data-video');
      if (!id) return;
      var extra = btn.getAttribute('data-query') || '';
      var src = 'https://www.youtube.com/embed/' + id + '?autoplay=1&' + extra;
      var iframe = document.createElement('iframe');
      iframe.setAttribute('src', src);
      iframe.setAttribute('title', btn.getAttribute('aria-label') || 'YouTube video player');
      iframe.setAttribute('frameborder', '0');
      iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
      iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      iframe.setAttribute('allowfullscreen', '');
      iframe.style.cssText = 'display:block;width:100%;height:100%;aspect-ratio:16/9;border:0;';
      btn.replaceWith(iframe);
    }, { once: true });
  });

})();
