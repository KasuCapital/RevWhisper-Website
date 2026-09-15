/* ──────────────────────────────────────────────────────────────────────────
   Whisper Wheel values — the single source of truth for every {{ }} binding
   whose value is data rather than a handler.

   Loaded twice, deliberately:
     • the browser, by /assets/home-redesign.js on every state change
     • Node, by scripts/build-home-redesign.mjs, to bake the state-1 values
       into the markup so the page paints correctly before its JS runs

   That second consumer is why this file is separate. Without it the raw HTML
   ships literal "{{ pBody }}" text and an invalid <circle cx="{{ activeCx }}">,
   both of which are visible for one frame and noisy in the console.
   ────────────────────────────────────────────────────────────────────────── */
(function (root) {
  'use strict';

  var EASE = 'cubic-bezier(.16,1,.3,1)';

  var FACTORS = [
    ['Ideal guest', 'Know exactly who we are selling to.', 'We define the guest segment worth winning for your property and your season — the group that books earliest and pays the most for what you actually have.', 'Everything downstream keys off this: the photo we lead with, the copy we write, the listings we treat as your competition.'],
    ['Search visibility', 'If a guest cannot see you, nothing else matters.', 'We track where you appear for your open dates, gap nights included, and work to get you in front of more of the people searching. Supply and demand move by date: a page-five listing can still fill a busy weekend, but on a midweek date where only a handful of listings book at all, top-of-market visibility is the whole game.', 'This is where most owners lose money. They run pricing and photos in a silo and never connect them back to the top of the funnel.'],
    ['Competitors', 'Your real competition is whatever the guest sees.', 'Not every three-bedroom in the county. The listings a booker is genuinely likely to come across on the way to booking you, which changes with every search. We read their pricing, their imaging and their group size.', 'This is where comp-set tools get it wrong. They aggregate on bedroom count with no idea whether a guest ever laid eyes on that listing.'],
    ['Photo tour', 'Win the click, then win the booking.', 'The cover image and the order behind it are built around what moves click-through and conversion rate, drawn from what we have seen work across hundreds of client listings.', 'It is never set once. As performance decays we re-sequence, because the set that converts a warm July guest is not the set that converts a slow-season one.'],
    ['Listing structure', 'Make the value land in seconds.', 'Title, description and amenities organized so a guest grasps what makes the property worth it fast. The goal is holding attention long enough that they do not click away, and there are principles behind how we format it.', 'It also feeds the algorithm. A high listing completeness score is how you land in search filters and how Airbnb understands what you actually offer.'],
    ['Rank-Adjusted Pricing', 'Price every night against real demand.', 'Our own strategy. We follow broad market trends but never price against aggregate market data — listings buried on pages five to fifty are not booking for a reason, and averaging them in is noise. Daily adjustments keep you visible and at the highest likelihood of booking.', 'Static pricing lifts occupancy because you are always selling low. Dynamic pricing keeps pace with the market but usually costs you occupancy. Rank-adjusted takes the best of both, and then some.']
  ];

  // Node centres on the wheel graphic, clockwise from the top.
  var POINTS = [[500, 210], [751, 355], [751, 645], [500, 790], [249, 645], [249, 355]];

  function pillStyle(i, sel, active) {
    var on = i === sel;
    var hot = !on && i === active;
    return 'display:flex;align-items:center;gap:9px;padding:11px 16px;border:1px solid ' + (on || hot ? '#4A6741' : '#E0DCDA') +
      ';border-radius:999px;background:' + (on ? '#4A6741' : hot ? '#F8F7F6' : '#FFFFFF') +
      ';color:' + (on ? '#FFFFFF' : '#32302F') +
      ';box-shadow:' + (on ? '0 2px 4px rgba(50,48,47,.06),0 6px 16px rgba(50,48,47,.10)' : 'none') +
      ';transform:translateY(' + (hot ? '-2px' : '0') + ')' +
      ';cursor:pointer;white-space:nowrap;transition:background .25s ' + EASE + ',border-color .25s ' + EASE + ',color .25s ' + EASE + ',box-shadow .25s ' + EASE + ',transform .25s ' + EASE;
  }

  function segStyle(i, sel) {
    return 'height:3px;flex:1 1 auto;border-radius:999px;background:' +
      (i === sel ? '#4A6741' : i < sel ? 'rgba(74,103,65,.35)' : '#E0DCDA') +
      ';transition:background .35s ' + EASE;
  }

  /* Every non-handler binding, for a given { selected, activeFactor } state. */
  function values(state) {
    var sel = state.selected || 1;
    var active = state.activeFactor || sel;
    var p = POINTS[active - 1];
    var f = FACTORS[sel - 1];
    // a node's name shows on hover, and the selected one keeps its label
    var lab = function (n) {
      return state.activeFactor ? (n === state.activeFactor ? 1 : 0) : (n === sel ? 1 : 0);
    };
    var v = {
      factorCount: 'Factor ' + String(sel).padStart(2, '0') + ' of 06',
      cueLabel: f[0] + ' in detail',
      activeCx: p[0],
      activeCy: p[1],
      activeOpacity: 1,
      pNum: String(sel).padStart(2, '0'),
      pLabel: f[0],
      pTitle: f[1],
      pBody: f[2],
      pConnect: f[3]
    };
    for (var i = 1; i <= 6; i++) {
      v['pillStyle' + i] = pillStyle(i, sel, active);
      v['segStyle' + i] = segStyle(i, sel);
      v['labelOpacity' + i] = lab(i);
    }
    return v;
  }

  root.FACTORS = FACTORS;
  root.values = values;
  root.EASE = EASE;
})(typeof module !== 'undefined' && module.exports ? module.exports : (window.RWVals = {}));
