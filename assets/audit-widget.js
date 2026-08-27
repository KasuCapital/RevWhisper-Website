/* ══════════════════════════════════════════════════════════════════════════
   Audit widget — the 5-step lead form, ported from /audit (audit.html).

   Behaviour is deliberately identical to /audit: same steps, same revenue
   bands, same qualification gate, same Meta/X events, same CRM webhook, same
   sessionStorage handoff, same redirects. It never generates a report — a
   qualified lead goes straight to /audit-booking to pick a time.

   Two intentional differences from audit.html:
     • source is 'homepage', not 'facebook-ads'
     • rwTrack page label is 'homepage', not 'audit'
     • CTAs elsewhere on the page scroll the card to centre instead of linking

   Everything runs inside one IIFE so nothing leaks into the homepage's globals
   except window.rwScrollToAuditWidget, which the page's CTAs call.
   ══════════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

var card = document.getElementById('audit-form');
if(!card) return;

/* rwTrack is defined inline in the page head; guard anyway so a tracking
   failure can never break the form. */
function track(e,p){ try{ if(typeof rwTrack==='function') rwTrack(e,p||{}); }catch(err){} }

/* rwAttribution() lives in audit.html's head. The homepage writes the same
   rw_attribution record but doesn't define the reader, so define it here. */
function attribution(){
  try{ return JSON.parse(localStorage.getItem('rw_attribution')||sessionStorage.getItem('rw_attribution'))||{}; }
  catch(e){ return {}; }
}

var current = 0;
var totalSteps = 5;
var isTransitioning = false;
var FORM_WEBHOOK_ENDPOINT = '/api/form-webhook';

function updateProgress(){
  card.querySelectorAll('.fc-seg').forEach(function(s,i){ s.classList.toggle('on', i<=current); });
  var cur=document.getElementById('fc-cur'); if(cur) cur.textContent=String(current+1);
}

/* ── Scrolling ─────────────────────────────────────────────────────────────
   One job, two callers: the page's CTAs call centreCard() bare, and step
   transitions pass the card's post-transition height so centring is measured
   against the incoming step, not the outgoing one. Puts the card dead centre
   in the viewport; the top gap never shrinks below the sticky header, and a
   card taller than the viewport pins just below it so the top of the form is
   always visible.
   ────────────────────────────────────────────────────────────────────────── */
function prefersReducedMotion(){
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches);
}

function centreCard(heightOverride){
  var HEADER=96;
  var vpH=window.innerHeight||document.documentElement.clientHeight;
  var rect=card.getBoundingClientRect();
  var cardTop=window.pageYOffset+rect.top; // stable while steps swap
  var h=heightOverride||rect.height;
  var gap=Math.max((vpH-h)/2,HEADER);
  var top=Math.max(0,cardTop-gap);
  if(Math.abs(top-window.pageYOffset)<2) return; // already there — don't nudge
  glideTo(top);
}

/* Drive the glide with rAF instead of scrollTo({behavior:'smooth'}) — the
   browser cancels a smooth scroll whenever scroll anchoring adjusts for the
   card's animating height (or lazy images shifting layout), which stranded
   the card off-centre. Re-asserting the eased position every frame can't be
   cancelled, and the last frame lands exactly on target. User input (wheel /
   touch) still cancels it, so we never fight a real scroll gesture. */
function glideTo(targetY){
  if(prefersReducedMotion()){ window.scrollTo({top:targetY,behavior:'instant'}); return; }
  glideTo._id=(glideTo._id||0)+1;
  var id=glideTo._id, startY=window.pageYOffset, dist=targetY-startY, t0=null, DUR=420;
  var stop=function(){ if(id===glideTo._id) glideTo._id++; cleanup(); };
  var cleanup=function(){ window.removeEventListener('wheel',stop); window.removeEventListener('touchmove',stop); };
  window.addEventListener('wheel',stop,{passive:true});
  window.addEventListener('touchmove',stop,{passive:true});
  // guaranteed landing: rAF is throttled to zero in occluded/background windows,
  // so a timer double-checks the end state and snaps if the glide never ran.
  // A user cancel (wheel/touch) bumps _id first, so it never fights the user.
  setTimeout(function(){
    if(id!==glideTo._id) return;
    if(Math.abs(window.pageYOffset-targetY)>8) window.scrollTo({top:targetY,behavior:'instant'});
  },DUR+140);
  function frame(ts){
    if(id!==glideTo._id){ cleanup(); return; }
    if(t0===null) t0=ts;
    var p=Math.min((ts-t0)/DUR,1);
    // behavior must be 'instant': 'auto' defers to the page's html{scroll-behavior:smooth},
    // which would turn every frame's write into a new competing smooth animation
    window.scrollTo({top:startY+dist*(1-Math.pow(1-p,3)),behavior:'instant'});
    if(p<1) requestAnimationFrame(frame); else cleanup();
  }
  requestAnimationFrame(frame);
}

function transitionStep(from,to,direction){
  if(isTransitioning) return;
  isTransitioning=true;
  var vp=card.querySelector('.steps-viewport');
  var fromEl=card.querySelector('.step[data-step="'+from+'"]');
  var toEl=card.querySelector('.step[data-step="'+to+'"]');
  if(!fromEl||!toEl){isTransitioning=false;return;}
  // measure current height, then the incoming step's height, and animate the gap
  var startH=vp.offsetHeight;
  // stable geometry: the card's top doesn't move as steps swap — only its height changes below it
  var cardTopBefore=card.getBoundingClientRect().top;
  var chromeH=card.offsetHeight-startH;
  fromEl.classList.remove('active','enter-from-below','enter-from-above');
  fromEl.classList.add(direction==='forward'?'exit-up':'exit-down');
  toEl.classList.remove('active','exit-up','exit-down');
  // stage the incoming step off-screen with transitions OFF, then commit via reflow
  toEl.style.transition='none';
  toEl.style.position='relative';toEl.style.opacity='0';toEl.style.visibility='visible';
  toEl.style.transform=direction==='forward'?'translateY(14px)':'translateY(-14px)';
  toEl.style.pointerEvents='auto';
  void toEl.offsetHeight;
  var endH=toEl.offsetHeight;
  // if the incoming step won't fully fit as-is, glide the card to dead centre of the viewport
  var vpH=window.innerHeight||document.documentElement.clientHeight;
  var recentre=!(cardTopBefore>=0 && (cardTopBefore+chromeH+endH)<=vpH);
  if(recentre) centreCard(chromeH+endH);
  // animate the card height from old → new
  vp.style.height=startH+'px';
  void vp.offsetHeight;
  vp.style.height=endH+'px';
  // enable transitions and move the step to its resting state (no rAF — reflow already committed the start)
  toEl.style.transition='';
  toEl.classList.add(direction==='forward'?'enter-from-below':'enter-from-above');
  toEl.style.position='';toEl.style.opacity='';toEl.style.visibility='';toEl.style.transform='';toEl.style.pointerEvents='';
  setTimeout(function(){
    fromEl.classList.remove('exit-up','exit-down');fromEl.style.position='';
    vp.style.height='';            // release to auto so inline errors can expand the step
    isTransitioning=false;
    // settle pass: the browser's scroll anchoring can interrupt the smooth
    // glide while the card height animates, and again on the height release
    // above — so re-centre a beat later, on a fully stable layout (the <2px
    // guard makes this a no-op when the first glide already landed)
    if(recentre) setTimeout(function(){centreCard();},60);
  },480);
  updateProgress();
}

/* ── Phone: country-code-aware live mask + validation (US/Canada = 10 digits; intl = 7-15) ── */
function phoneDigits(v){ return (String(v||'').match(/\d/g)||[]).join(''); }
function formatPhone(code,raw){
  var d=phoneDigits(raw);
  if(code==='+1'){
    d=d.slice(0,10);
    if(!d) return '';
    if(d.length<4) return '('+d;
    if(d.length<7) return '('+d.slice(0,3)+') '+d.slice(3);
    return '('+d.slice(0,3)+') '+d.slice(3,6)+'-'+d.slice(6);
  }
  return d.slice(0,15);
}
function phoneValid(code,raw){
  var n=phoneDigits(raw).length;
  return code==='+1' ? n===10 : (n>=7&&n<=15);
}
function applyPhoneMask(){
  var p=document.getElementById('phone'),c=document.getElementById('phone-code');
  if(!p||!c) return;
  p.value=formatPhone(c.value,p.value);
  p.placeholder=c.value==='+1'?'(555) 123-4567':'Phone number';
  p.classList.remove('error');
}

function validateStep(step){
  var valid=true;
  if(step===4){
    var url=document.getElementById('airbnb-url');
    var val=url.value.trim();
    // Airbnb URL (listing or host profile) is required
    if(!val || !val.toLowerCase().includes('airbnb.')){url.classList.add('error');valid=false;}else{url.classList.remove('error');}
    var name=document.getElementById('full-name');
    var email=document.getElementById('email');
    if(!name.value.trim()){name.classList.add('error');valid=false;}else{name.classList.remove('error');}
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())){email.classList.add('error');valid=false;}else{email.classList.remove('error');}
    var phone=document.getElementById('phone');
    var pcode=(document.getElementById('phone-code')||{}).value||'+1';
    if(!phoneValid(pcode,phone.value)){phone.classList.add('error');valid=false;}else{phone.classList.remove('error');}
  }
  return valid;
}

function nextStep(){
  if(current>=totalSteps-1) return;
  if(!validateStep(current)) return;
  var from=current;current++;
  track('form_step',{step:current,page:'homepage'});
  transitionStep(from,current,'forward');
}
function prevStep(){
  if(current>0){var from=current;current--;transitionStep(from,current,'backward');}
}

/* Revenue bands per listing count — annual gross portfolio revenue.
   The FIRST band in each ladder is the qualification floor: selecting it = below
   threshold = disqualified (routed to the report page, not the booking calendar).
   Per-listing floor decays as the portfolio grows (portfolio discounts + higher LTV):
   $40k → $30k → $25k → ~$18k → ~$15k → ~$10k per door at the low end of each band. */
var REVENUE_BANDS={
  '1':['Under $40k','$40k–$60k','$60k–$85k','$85k–$120k','$120k–$175k','$175k+'],
  '2-5':['Under $60k','$60k–$110k','$110k–$175k','$175k–$275k','$275k–$450k','$450k+'],
  '6-10':['Under $150k','$150k–$300k','$300k–$475k','$475k–$700k','$700k–$1M','$1M+'],
  '11-25':['Under $200k','$200k–$450k','$450k–$750k','$750k–$1.25M','$1.25M–$2.5M','$2.5M+'],
  '26-100':['Under $400k','$400k–$900k','$900k–$1.5M','$1.5M–$3M','$3M–$6M','$6M+'],
  '100+':['Under $1M','$1M–$3M','$3M–$6M','$6M–$12M','$12M–$25M','$25M+']
};
/* CAD ladder — the same qualification floors as the USD ladder at ~1.38 FX,
   rounded to clean numbers, so the gate means the same thing in both countries.
   The CA$ prefix travels with the submitted value, so CRM entries self-label.
   Keep ladder + detection in sync across: audit.html, assets/audit-widget.js,
   airbnb-revenue-management.html, pricing-tool-audit.html, ranking-audit.html,
   listing-audit.html. */
var REVENUE_BANDS_CAD={
  '1':['Under CA$55k','CA$55k–85k','CA$85k–120k','CA$120k–165k','CA$165k–240k','CA$240k+'],
  '2-5':['Under CA$85k','CA$85k–150k','CA$150k–240k','CA$240k–380k','CA$380k–620k','CA$620k+'],
  '6-10':['Under CA$200k','CA$200k–400k','CA$400k–650k','CA$650k–950k','CA$950k–1.4M','CA$1.4M+'],
  '11-25':['Under CA$275k','CA$275k–620k','CA$620k–1M','CA$1M–1.7M','CA$1.7M–3.4M','CA$3.4M+'],
  '26-100':['Under CA$550k','CA$550k–1.25M','CA$1.25M–2M','CA$2M–4M','CA$4M–8M','CA$8M+'],
  '100+':['Under CA$1.4M','CA$1.4M–4M','CA$4M–8M','CA$8M–16M','CA$16M–35M','CA$35M+']
};
/* Canada detection — zero-request, resolved once at load:
   1) explicit ?geo=ca|us on the URL (tag Canada campaign links with ?geo=ca),
   2) a *-CA browser language,
   3) a Canadian IANA timezone (city-named, never shared with US cities, and it
      reflects the OS clock — VPN-proof, and it still catches the many Canadians
      whose browsers report en-US).
   Anything ambiguous falls back to USD. */
function detectCanada(){
  try{
    var q=(new URLSearchParams(window.location.search).get('geo')||'').toLowerCase();
    if(q) return q==='ca';
    var langs=(navigator.languages&&navigator.languages.length)?navigator.languages:[navigator.language||''];
    for(var i=0;i<langs.length;i++){ if(/-ca$/i.test(String(langs[i]))) return true; }
    var tz=(Intl.DateTimeFormat().resolvedOptions().timeZone)||'';
    return /^America\/(St_Johns|Halifax|Glace_Bay|Moncton|Goose_Bay|Blanc-Sablon|Toronto|Nipigon|Thunder_Bay|Iqaluit|Pangnirtung|Atikokan|Winnipeg|Rainy_River|Resolute|Rankin_Inlet|Regina|Swift_Current|Edmonton|Cambridge_Bay|Yellowknife|Inuvik|Creston|Dawson_Creek|Fort_Nelson|Vancouver|Whitehorse|Dawson)$/.test(tz);
  }catch(e){ return false; }
}
var IS_CA=detectCanada();
function bandsFor(listingVal){
  var t=IS_CA?REVENUE_BANDS_CAD:REVENUE_BANDS;
  return t[listingVal]||t['1'];
}
function renderRevenueOptions(listingVal){
  var single=(listingVal==='1');
  // revenue bands sized to the chosen portfolio
  var wrap=document.getElementById('revenue-options');
  if(wrap){
    var bands=bandsFor(listingVal);
    var html='';
    bands.forEach(function(b){
      html+='<label class="radio-card"><input type="radio" name="revenue" value="'+b+'"><div class="rc-label"><span>'+b+'</span></div></label>';
    });
    wrap.innerHTML=html;
  }
  var title=document.getElementById('revenue-title');
  if(title) title.innerHTML='Roughly what did your '+(single?'listing':'portfolio')+' earn <em>last year?</em>';
  var dc=document.getElementById('doorcount-field');
  if(dc) dc.style.display=(listingVal==='26-100'||listingVal==='100+')?'':'none';
}

/* ── Submit — fire Lead, post webhook, stash context, go to booking page ── */
var submitted=false;
function submitForm(){
  if(!validateStep(4)) return;
  if(submitted) return;
  var btn=document.getElementById('btn-submit');
  btn.disabled=true;

  var listingsVal=(card.querySelector('input[name="listings"]:checked')||{}).value||'';
  var revenueVal=(card.querySelector('input[name="revenue"]:checked')||{}).value||'';
  // Qualification gate: the first band in each ladder is the disqualifying floor.
  // Selecting it (and only it) means the portfolio is below threshold for the service.
  var bandsForListings=bandsFor(listingsVal);
  var qualified=!(revenueVal && revenueVal===bandsForListings[0]);

  var data={
    listings:listingsVal,
    issue:(card.querySelector('input[name="issue"]:checked')||{}).value||'',
    pricing:(card.querySelector('input[name="pricing"]:checked')||{}).value||'',
    revenue:revenueVal,
    currency:IS_CA?'CAD':'USD',
    doorCount:((document.getElementById('door-count')||{}).value||'').trim(),
    airbnbUrl:document.getElementById('airbnb-url').value.trim(),
    name:document.getElementById('full-name').value.trim(),
    email:document.getElementById('email').value.trim(),
    phone:(document.getElementById('phone-code').value.trim()+' '+document.getElementById('phone').value.trim()).trim(),
    phone_code:document.getElementById('phone-code').value.trim(),
    phone_number:document.getElementById('phone').value.trim(),
    qualified:qualified,
    disqualifyReason:qualified?'':'below_revenue_floor',
    source:'homepage',
    submittedAt:new Date().toISOString(),
    attribution:attribution()
  };

  submitted=true;

  // hand the lead context to the next page (booking or report)
  try{ sessionStorage.setItem('rw_audit_lead', JSON.stringify(data)); }catch(e){}

  if(!qualified){
    // ── Below threshold ──────────────────────────────────────────────────────
    // Do NOT fire the standard Lead (and we omit fbEventId/xConversionId below,
    // so the server's CAPI Lead is skipped too) — this keeps Meta's optimizer
    // from learning to find more sub-threshold submitters. We fire a custom
    // measurement-only event, still capture the lead to the CRM (flagged
    // qualified:false), then route to the report page instead of the calendar.
    try{ fbq('trackCustom','UnqualifiedLead',{content_name:'Free Audit',content_category:'Audit Lead — Unqualified'}); }catch(e){}
    track('generate_lead_unqualified',{page:'homepage',listings:data.listings,revenue:data.revenue});
    fetch(FORM_WEBHOOK_ENDPOINT,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({event_type:'get_started',payload:data}),
      keepalive:true
    }).catch(function(){});
    window.location.href='/audit-report-coming';
    return;
  }

  // ── Qualified ──────────────────────────────────────────────────────────────
  // Meta Lead — fired browser-side now, and again server-side from /api/form-webhook
  // (CAPI) using this same event_id, so Meta deduplicates the pair into one Lead.
  var eventId='lead_'+Date.now()+'_'+Math.random().toString(36).slice(2,10);
  var xConversionId=typeof rwXConversionId==='function'?rwXConversionId('audit_lead'):'audit_lead_'+Date.now();
  try{ sessionStorage.setItem('rw_lead_event_id', eventId); }catch(e){}
  try{ fbq('track','Lead',{content_name:'Free Audit',content_category:'Audit Lead'},{eventID:eventId}); }catch(e){}
  track('generate_lead',{page:'homepage',listings:data.listings,issue:data.issue});
  // Hand the event_id + content name to the server so its CAPI Lead dedupes with the above.
  data.fbEventId=eventId; data.fbContentName='Free Audit';
  // X uses conversion_id for Pixel/CAPI dedupe; event IDs are loaded from /api/x-config.
  data.xConversionId=xConversionId; data.xContentName='Free Audit Lead';
  if(data.attribution&&data.attribution.twclid) data.twclid=data.attribution.twclid;

  function fireXLead(){
    var xParams={conversion_id:xConversionId,email_address:data.email};
    if(data.phone&&typeof rwXNormalizePhone==='function') xParams.phone_number=rwXNormalizePhone(data.phone);
    try{ rwXTrack('auditLead',xParams); }catch(e){}
  }

  // CRM webhook (fire-and-forget — don't block the redirect on Make.com latency)
  fetch(FORM_WEBHOOK_ENDPOINT,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({event_type:'get_started',payload:data}),
    keepalive:true
  }).catch(function(){});

  // straight to the live-audit booking page
  var redirect=function(){window.location.href='/audit-booking';};
  if(window.rwXReady&&typeof window.rwXReady.then==='function'){
    Promise.race([window.rwXReady,new Promise(function(resolve){setTimeout(resolve,120);})])
      .then(function(){fireXLead();redirect();})
      .catch(redirect);
  }else{
    fireXLead();
    redirect();
  }
}

/* ── Wiring ────────────────────────────────────────────────────────────────
   Handlers are bound here rather than via inline onclick so the form adds no
   globals to a page that already runs home.js.
   ────────────────────────────────────────────────────────────────────────── */

/* Auto-advance taps: listings, issue, pricing, and the dynamic revenue bands */
card.querySelectorAll('input[name="listings"]').forEach(function(r){
  r.addEventListener('change',function(){ track('select_portfolio_size',{size:r.value,page:'homepage'}); renderRevenueOptions(r.value); setTimeout(nextStep,180); });
});
card.querySelectorAll('input[name="issue"]').forEach(function(r){
  r.addEventListener('change',function(){ track('select_issue',{issue:r.value,page:'homepage'}); setTimeout(nextStep,180); });
});
card.querySelectorAll('input[name="pricing"]').forEach(function(r){
  r.addEventListener('change',function(){ track('select_pricing',{pricing:r.value,page:'homepage'}); setTimeout(nextStep,180); });
});
/* revenue radios are rendered dynamically — delegate the change to auto-advance */
card.addEventListener('change',function(e){
  if(e.target&&e.target.name==='revenue'){ track('select_revenue',{revenue:e.target.value,page:'homepage'}); setTimeout(nextStep,180); }
});

card.querySelectorAll('.btn-back').forEach(function(b){ b.addEventListener('click',prevStep); });
var submitBtn=document.getElementById('btn-submit');
if(submitBtn) submitBtn.addEventListener('click',submitForm);

(function(){
  var p=document.getElementById('phone'),c=document.getElementById('phone-code');
  if(p) p.addEventListener('input',applyPhoneMask);
  if(c) c.addEventListener('change',applyPhoneMask);
  // Canadians see the maple leaf on the +1 option (value stays '+1' — same NANP mask/validation)
  if(IS_CA&&c){var o=c.querySelector('option[value="+1"]');if(o)o.textContent='🇨🇦 +1';}
})();

/* Clear field error as the user types */
card.querySelectorAll('.field-input').forEach(function(input){
  input.addEventListener('input',function(){input.classList.remove('error');});
});

/* Enter key advances / submits */
card.addEventListener('keydown',function(e){
  if(e.key!=='Enter') return;
  if(e.target.tagName==='TEXTAREA') return;
  if(current===4){e.preventDefault();submitForm();}
});

/* CTAs elsewhere on the page (.js-to-audit) scroll the card to centre and put
   the cursor on the first option. Exposed for the header/menu, which lives in
   a shared partial. */
function scrollToWidget(){
  centreCard();
  setTimeout(function(){
    if(current===0){var first=card.querySelector('input[name="listings"]');if(first)first.focus({preventScroll:true});}
  },450);
}
window.rwScrollToAuditWidget=scrollToWidget;

document.addEventListener('click',function(e){
  var a=e.target.closest('.js-to-audit');
  if(!a) return;
  e.preventDefault();
  track('cta_click',{destination:'audit_widget',cta_text:(a.textContent||'').replace(/\s+/g,' ').trim().substring(0,60),page:'homepage'});
  scrollToWidget();
});

updateProgress();

})();
