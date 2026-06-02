/* RevWhisper site header — runtime behavior
   Pairs with /assets/header.css and /_partials/header.html.

   Single source of truth for dropdown state: the .is-open class.
   No CSS :hover or :focus-within is involved (those have known stuck-state bugs).

   Behavior:
     • Mouse hover with intent delay (open ~80ms after enter, close ~150ms after leave).
     • Click toggles (works for touch, keyboard Enter/Space, and as a sticky-pin for mouse).
     • Right-click on trigger force-closes (defensive; some browsers leave hover stuck after context menu).
     • Keyboard: Tab to focus → Enter/Space to open → Escape to close → Tab through items.
     • Outside click and Escape close all dropdowns.
     • Hover behavior is suppressed for non-mouse pointer types (touch / pen). */

(function () {
  var HOVER_OPEN_DELAY = 80;
  var HOVER_CLOSE_DELAY = 150;
  var BLUR_CLOSE_DELAY = 100;

  function init() {
    var bar = document.getElementById('float-bar');
    if (!bar) return;

    /* ── Scrolled-shadow state ─────────────────────────── */
    var onScroll = function () {
      if (window.pageYOffset > 60) bar.classList.add('scrolled');
      else bar.classList.remove('scrolled');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    /* ── Active-link highlighting ──────────────────────── */
    var here = window.location.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
    if (here.length > 1 && here.endsWith('/')) here = here.slice(0, -1);

    function normalize(href) {
      return href.split('#')[0].split('?')[0]
        .replace(/\/index\.html$/, '/').replace(/\.html$/, '');
    }

    Array.prototype.forEach.call(bar.querySelectorAll('a.fb-link, a.fb-menu-item'), function (link) {
      var href = link.getAttribute('href') || '';
      if (/^https?:/i.test(href) || href.startsWith('#')) return;
      var target = normalize(href);
      if (target.length > 1 && target.endsWith('/')) target = target.slice(0, -1);
      if (target === here) {
        link.classList.add('active');
        var dd = link.closest('.fb-dropdown');
        if (dd) {
          var trigger = dd.querySelector('.fb-dropdown-trigger');
          if (trigger) trigger.classList.add('active');
        }
      }
    });

    /* ── Dropdowns ─────────────────────────────────────── */
    var dropdowns = Array.prototype.slice.call(bar.querySelectorAll('[data-dropdown]'));

    function setExpanded(dd, expanded) {
      var t = dd.querySelector('.fb-dropdown-trigger');
      if (t) t.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }

    function openDropdown(dd) {
      closeAll(dd);
      dd.classList.add('is-open');
      setExpanded(dd, true);
    }

    function closeDropdown(dd) {
      dd.classList.remove('is-open');
      setExpanded(dd, false);
    }

    function closeAll(except) {
      dropdowns.forEach(function (dd) {
        if (dd === except) return;
        if (dd.classList.contains('is-open')) closeDropdown(dd);
      });
    }

    dropdowns.forEach(function (dd) {
      var trigger = dd.querySelector('.fb-dropdown-trigger');
      if (!trigger) return;

      // Per-dropdown timers, isolated so multiple dropdowns don't fight.
      var openTimer = null;
      var closeTimer = null;
      function clearTimers() {
        if (openTimer) { clearTimeout(openTimer); openTimer = null; }
        if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
      }

      // Hover-intent open (mouse only; touch and pen ignored — they get click instead)
      dd.addEventListener('pointerenter', function (e) {
        if (e.pointerType !== 'mouse') return;
        clearTimers();
        if (dd.classList.contains('is-open')) return;
        openTimer = setTimeout(function () { openDropdown(dd); }, HOVER_OPEN_DELAY);
      });

      dd.addEventListener('pointerleave', function (e) {
        if (e.pointerType !== 'mouse') return;
        clearTimers();
        if (!dd.classList.contains('is-open')) return;
        closeTimer = setTimeout(function () { closeDropdown(dd); }, HOVER_CLOSE_DELAY);
      });

      // Click toggle — touch users tap, keyboard users press Enter/Space
      trigger.addEventListener('click', function (e) {
        e.stopPropagation();
        clearTimers();
        var willOpen = !dd.classList.contains('is-open');
        if (willOpen) openDropdown(dd);
        else closeDropdown(dd);
      });

      // Defensive: right-click can leave hover/focus state stuck. Force close.
      trigger.addEventListener('contextmenu', function () {
        clearTimers();
        closeDropdown(dd);
      });

      // Keyboard: focus moves OUT of the dropdown → close (small delay so focus can land on a menu item)
      dd.addEventListener('focusout', function (e) {
        if (dd.contains(e.relatedTarget)) return;
        clearTimers();
        closeTimer = setTimeout(function () { closeDropdown(dd); }, BLUR_CLOSE_DELAY);
      });

      // Cancel a pending close if focus comes back inside
      dd.addEventListener('focusin', clearTimers);
    });

    // Outside click closes all
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.fb-dropdown')) closeAll(null);
    });

    // Escape closes all and returns focus to the triggering dropdown's button
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var openDd = bar.querySelector('.fb-dropdown.is-open');
      closeAll(null);
      if (openDd) {
        var t = openDd.querySelector('.fb-dropdown-trigger');
        if (t) t.focus();
      }
    });

    // Defensive: window blur (alt-tab, devtools, browser context menu) → close everything
    window.addEventListener('blur', function () { closeAll(null); });

    /* ── Mobile hamburger ──────────────────────────────── */
    var ham = document.getElementById('fb-hamburger');
    var links = document.getElementById('fb-links');
    if (ham && links) {
      ham.addEventListener('click', function (e) {
        e.stopPropagation();
        var isOpen = links.classList.toggle('open');
        ham.classList.toggle('open');
        ham.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        if (!isOpen) closeAll(null);
      });
      links.addEventListener('click', function (e) {
        var a = e.target.closest('a');
        if (!a) return;
        links.classList.remove('open');
        ham.classList.remove('open');
        ham.setAttribute('aria-expanded', 'false');
        closeAll(null);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
