/* PostHog (product analytics + session replay). Loads only where /assets/rw-consent.js
 * allows analytics: on by default in the US and Canada outside Quebec, opt-in elsewhere.
 *
 *  - Every rwTrack() event the pages already send to GA4 is mirrored to PostHog, so the
 *    form funnel (select_portfolio_size → form_step → generate_lead) needs no page edits.
 *  - generate_lead identifies the visitor by email so a lead in Attio can be matched to
 *    the recording of how they got there.
 *  - Replay masks every input, plus any text that looks like an email or phone number.
 *    Checkout pages are never recorded.
 *  - Team visits: open any page with ?rw_internal=1 to stop tracking this browser
 *    (?rw_internal=0 undoes it).
 *
 * Load with defer, after rw-consent.js and the page's GA block (rwTrack must exist).
 */
(function(){
  var KEY='phc_nfYFyU95DAZp2fvS3qZf6P5v8vJ2oH8SAGLomz9eqrLE';
  var NO_REPLAY=/^\/(checkout|checkout-form|success-b)(\.html)?\/?$/;
  var EMAIL=/[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/gi;
  var PHONE=/\+?\d[\d\s().-]{7,}\d/g;

  function get(k){try{return localStorage.getItem(k);}catch(e){return null;}}
  function set(k,v){try{if(v==null)localStorage.removeItem(k);else localStorage.setItem(k,v);}catch(e){}}

  var internal=null;
  try{internal=new URLSearchParams(location.search).get('rw_internal');}catch(e){}
  if(internal==='1')set('rw_internal','1');
  if(internal==='0')set('rw_internal',null);
  if(get('rw_internal')==='1')return;

  function attribution(){
    try{return JSON.parse(get('rw_attribution')||sessionStorage.getItem('rw_attribution'))||{};}catch(e){return {};}
  }

  function load(){
    if(window.posthog&&window.posthog.__loaded)return;
    /* PostHog's official loader snippet */
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog && window.posthog.__loaded)||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}p||((p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",p.onerror=function(){p=null},(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r));var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],Object.defineProperty(u,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e}}),Object.defineProperty(u.people,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(){return u.toString(1)+".people (stub)"}}),o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey identify setPersonProperties reset get_distinct_id get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing is_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

    window.posthog.init(KEY,{
      // First-party proxy (vercel.json rewrites) so ad blockers don't drop events. Local dev has no rewrites.
      api_host:/(^|\.)revwhisper\.com$/.test(location.hostname)?'/ingest':'https://us.i.posthog.com',
      ui_host:'https://us.posthog.com',
      defaults:'2026-05-30',
      person_profiles:'identified_only',
      // This file only loads once rwConsent allows analytics, so record that as an explicit opt-in.
      // posthog-js sends the initial $pageview only for opted-in visitors, and this also clears
      // an opt-out left from an earlier "Turn off tracking".
      loaded:function(ph){if(!ph.has_opted_in_capturing())ph.opt_in_capturing({captureEventName:false});},
      disable_session_recording:NO_REPLAY.test(location.pathname),
      session_recording:{
        maskAllInputs:true,
        maskTextFn:function(text){return text.replace(EMAIL,function(m){return '*'.repeat(m.length);}).replace(PHONE,function(m){return '*'.repeat(m.length);});}
      }
    });

    var a=attribution(), props={rw_region:(window.rwConsent&&rwConsent.region)||''};
    ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].forEach(function(k){if(a[k])props['first_'+k]=a[k];});
    if(a.gclid)props.first_click_source='google_ads';else if(a.fbclid)props.first_click_source='meta_ads';
    if(a.landing_page)props.first_landing_page=a.landing_page;
    window.posthog.register(props);
  }

  // Mirror rwTrack() to PostHog.
  var orig=window.rwTrack;
  window.rwTrack=function(e,p){
    if(typeof orig==='function'){try{orig(e,p);}catch(err){}}
    try{
      if(!window.posthog||typeof window.posthog.capture!=='function')return;
      window.posthog.capture(e,p||{});
      if(e==='generate_lead'){
        var em=document.getElementById('email');
        var v=em&&em.value.trim().toLowerCase();
        if(v&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))window.posthog.identify(v,{email:v});
      }
    }catch(err){}
  };

  // Field-level drop-off: report which input a validation error lands on.
  function watchErrors(){
    if(!window.MutationObserver)return;
    var seen={};
    new MutationObserver(function(muts){
      muts.forEach(function(m){
        var el=m.target;
        if(!el.classList||!el.classList.contains('error')||!/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName))return;
        var id=el.id||el.name||'';
        if(seen[id]&&Date.now()-seen[id]<1500)return;
        seen[id]=Date.now();
        window.rwTrack('form_field_error',{field:id,page:location.pathname});
      });
    }).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});
  }

  function start(){
    load();
    if(document.body)watchErrors();else document.addEventListener('DOMContentLoaded',watchErrors);
  }

  if(window.rwConsent)window.rwConsent.whenAllowed(start);else start();

  // Visitor turns analytics off from Privacy choices: stop capturing immediately.
  document.addEventListener('rw:consent',function(ev){
    if(!window.posthog)return;
    if(ev.detail&&ev.detail.analytics){window.posthog.opt_in_capturing();}
    else{window.posthog.opt_out_capturing();window.posthog.stopSessionRecording();}
  });
})();
