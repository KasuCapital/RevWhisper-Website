/* RevWhisper consent manager. One rule for every tracker (GA4, Google Ads, Meta, X).
 *
 *  - Opt-in regions (EEA, UK, Switzerland, Quebec): everything off until the visitor
 *    clicks Accept. These are the only visitors who ever see a banner.
 *  - Everywhere else (US, rest of Canada, ...): on by default, disclosed in /privacy,
 *    with "Your Privacy Choices" in the footer to opt out at any time (CCPA opt-out link).
 *  - Global Privacy Control: ad tracking off (Meta, X, Google Ads), analytics stays on,
 *    unless the visitor explicitly allowed everything in the choices panel.
 *
 * Region comes from the rw_geo cookie set by /middleware.js (Vercel IP geolocation).
 * Without it (local dev, middleware failure) a timezone/language guess is used.
 * QA override: ?rw_geo=CA-QC (or FR, US-CA, ...) sticks for the browser session.
 *
 * Must load synchronously in <head>, before any gtag()/fbq() call on the page.
 */
(function(){
  var KEY='rw_consent_v2', LEGACY_KEY='rw_cookie_consent';
  var EEA=['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','IS','LI','NO'];
  var OPT_IN=EEA.concat(['GB','CH']);

  function get(store,k){try{return window[store].getItem(k);}catch(e){return null;}}
  function set(store,k,v){try{window[store].setItem(k,v);}catch(e){}}
  function cookie(name){var m=document.cookie.match(new RegExp('(?:^|; )'+name+'=([^;]*)'));return m?decodeURIComponent(m[1]):'';}

  function detectRegion(){
    var q=null;
    try{q=new URLSearchParams(location.search).get('rw_geo');}catch(e){}
    if(q&&/^[A-Za-z]{2}(-[A-Za-z0-9]{1,3})?$/.test(q)){q=q.toUpperCase();set('sessionStorage','rw_geo_override',q);return {code:q,source:'override'};}
    var o=get('sessionStorage','rw_geo_override');
    if(o)return {code:o,source:'override'};
    var c=cookie('rw_geo');
    if(c&&c!=='XX'&&/^[A-Z]{2}(-[A-Z0-9]{1,3})?$/.test(c))return {code:c,source:'ip'};
    var tz='',lang='';
    try{tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'';}catch(e){}
    lang=String(navigator.language||'');
    if(/^Europe\//.test(tz)||/^Atlantic\/(Reykjavik|Canary|Madeira|Azores|Faroe)$/.test(tz))return {code:'EU',source:'guess'};
    if(/^fr-CA$/i.test(lang)||tz==='America/Montreal'||tz==='America/Blanc-Sablon')return {code:'CA-QC',source:'guess'};
    return {code:'',source:'guess'};
  }

  function isOptIn(code){
    if(!code)return false;
    if(code==='EU'||code==='CA-QC')return true;
    return OPT_IN.indexOf(code.split('-')[0])!==-1;
  }

  function readChoice(){
    var v=get('localStorage',KEY);
    if(v){try{var p=JSON.parse(v);if(p&&(p.c==='accepted'||p.c==='declined'))return {c:p.c,explicit:true};}catch(e){}}
    var l=get('localStorage',LEGACY_KEY);
    if(l==='accepted'||l==='declined')return {c:l,explicit:false};
    return null;
  }

  var region=detectRegion();
  var optIn=isOptIn(region.code);
  var gpc=navigator.globalPrivacyControl===true;
  var choice=readChoice();
  var listeners=[];
  function when(cond,fn){if(cond(state)){fn(state);}else{listeners.push({cond:cond,fn:fn});}}

  function compute(){
    var c=choice&&choice.c;
    var analytics=optIn?c==='accepted':c!=='declined';
    var ads=analytics&&!(gpc&&!(c==='accepted'&&choice.explicit));
    return {analytics:analytics,ads:ads};
  }

  function signals(s){
    return {
      analytics_storage:s.analytics?'granted':'denied',
      ad_storage:s.ads?'granted':'denied',
      ad_user_data:s.ads?'granted':'denied',
      ad_personalization:s.ads?'granted':'denied'
    };
  }

  var state=compute();

  window.dataLayer=window.dataLayer||[];
  if(typeof window.gtag!=='function')window.gtag=function(){window.dataLayer.push(arguments);};
  window.gtag('consent','default',signals(state));
  if(gpc)window.gtag('set','restricted_data_processing',true);

  var rw={
    region:region.code,
    regionSource:region.source,
    optIn:optIn,
    gpc:gpc,
    get analytics(){return state.analytics;},
    get ads(){return state.ads;},
    get choice(){return choice?choice.c:null;},
    // Runs fn now if any tracking is allowed, otherwise the moment the visitor accepts.
    whenAllowed:function(fn){when(function(s){return s.analytics||s.ads;},fn);},
    // Runs fn now if ad tracking is allowed, otherwise the moment it becomes allowed.
    whenAdsAllowed:function(fn){when(function(s){return s.ads;},fn);},
    accept:function(){save('accepted');},
    decline:function(){save('declined');},
    open:function(){showPanel(true);}
  };
  window.rwConsent=rw;

  // Ad click IDs (gclid, fbclid, ...) are ad identifiers, not essential storage. Each page's
  // attribution script saves them to rw_attribution before this file runs, so in opt-in
  // regions without ad consent they are pulled out of storage and held in memory for this
  // page only, then written back if the visitor accepts.
  var CLICK_IDS=['fbclid','gclid','ttclid','twclid','msclkid','li_fat_id'];
  var heldClickIds=null;
  function scrubClickIds(){
    if(!optIn||state.ads)return;
    var raw=get('localStorage','rw_attribution')||get('sessionStorage','rw_attribution');
    if(!raw)return;
    try{
      var data=JSON.parse(raw),found=false;
      CLICK_IDS.forEach(function(k){if(data[k]){heldClickIds=heldClickIds||{};heldClickIds[k]=data[k];delete data[k];found=true;}});
      if(found){var v=JSON.stringify(data);set('localStorage','rw_attribution',v);if(get('sessionStorage','rw_attribution'))set('sessionStorage','rw_attribution',v);}
    }catch(e){}
  }
  function restoreClickIds(){
    if(!heldClickIds||!state.ads)return;
    try{
      var data=JSON.parse(get('localStorage','rw_attribution')||'{}');
      for(var k in heldClickIds)data[k]=heldClickIds[k];
      set('localStorage','rw_attribution',JSON.stringify(data));
    }catch(e){}
    heldClickIds=null;
  }
  scrubClickIds();

  // Meta: each page calls fbq('consent','revoke') before fbq('init') when rwConsent.ads is false.
  function applyMeta(){
    if(typeof window.fbq==='function')window.fbq('consent',state.ads?'grant':'revoke');
  }

  function save(c){
    choice={c:c,explicit:true};
    set('localStorage',KEY,JSON.stringify({c:c,t:Date.now()}));
    set('localStorage',LEGACY_KEY,c);
    var before=state;
    state=compute();
    window.gtag('consent','update',signals(state));
    applyMeta();
    restoreClickIds();
    var pending=listeners;listeners=[];
    pending.forEach(function(l){if(l.cond(state)){try{l.fn(state);}catch(e){}}else{listeners.push(l);}});
    if(before.ads!==state.ads||before.analytics!==state.analytics){
      try{document.dispatchEvent(new CustomEvent('rw:consent',{detail:{analytics:state.analytics,ads:state.ads}}));}catch(e){}
    }
    hidePanel();
  }

  /* ---------- banner / choices panel ---------- */
  var panel=null;
  function css(){
    if(document.getElementById('rw-consent-css'))return;
    var s=document.createElement('style');s.id='rw-consent-css';
    s.textContent=
      '#rw-consent{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;padding:16px;background:#32302F;color:#fff;font-family:"DM Sans",system-ui,sans-serif;font-size:14px;line-height:1.5;box-shadow:0 -4px 24px rgba(0,0,0,.15)}'+
      '#rw-consent .rwc-in{max-width:1080px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}'+
      '#rw-consent .rwc-txt{flex:1;min-width:240px}'+
      '#rw-consent a{color:#fff;text-decoration:underline}'+
      '#rw-consent .rwc-btns{display:flex;gap:10px;flex-shrink:0}'+
      '#rw-consent button{min-height:44px;padding:10px 22px;border-radius:6px;font:500 14px/1 inherit;font-family:inherit;cursor:pointer;border:1.5px solid #fff}'+
      '#rw-consent .rwc-no{background:transparent;color:#fff}'+
      '#rw-consent .rwc-yes{background:#fff;color:#32302F}'+
      '#rw-consent .rwc-x{position:absolute;top:6px;right:10px;min-height:0;padding:4px 8px;border:0;background:transparent;color:#ccc8c5;font-size:20px}'+
      '.rw-privacy-choices{background:none;border:0;padding:0;font:inherit;color:inherit;cursor:pointer;text-decoration:inherit;display:inline-flex;align-items:center;gap:5px}'+
      '.rw-privacy-choices svg{width:26px;height:12px;flex-shrink:0}'+
      '#rw-privacy-line{padding:18px 16px 22px;text-align:center;font:400 12px/1.5 "DM Sans",system-ui,sans-serif;color:#706b68}'+
      '#rw-privacy-line a,#rw-privacy-line button{color:#706b68;text-decoration:underline}';
    document.head.appendChild(s);
  }
  function hidePanel(){if(panel){panel.remove();panel=null;}}
  function showPanel(manual){
    if(panel)return;
    css();
    var status=state.analytics?(state.ads?'Analytics and ad measurement are on.':'Analytics is on. Ad tracking is off.'):'Analytics and ad tracking are off.';
    var msg=manual
      ?'<strong>Your privacy choices.</strong> '+status+' We use analytics to improve this site and ad tags to measure our ads. <a href="/privacy#cookies">Privacy policy</a>'
      :'We use cookies for analytics and to measure our ads, only if you allow it. <a href="/privacy#cookies">Privacy policy</a>';
    panel=document.createElement('div');panel.id='rw-consent';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Privacy choices');
    panel.innerHTML='<div class="rwc-in"><span class="rwc-txt">'+msg+'</span><div class="rwc-btns">'+
      '<button type="button" class="rwc-no">'+(manual?'Turn off tracking':'Decline')+'</button>'+
      '<button type="button" class="rwc-yes">'+(manual?'Allow all':'Accept')+'</button></div></div>'+
      (manual?'<button type="button" class="rwc-x" aria-label="Close">&times;</button>':'');
    document.body.appendChild(panel);
    panel.querySelector('.rwc-no').addEventListener('click',function(){rw.decline();});
    panel.querySelector('.rwc-yes').addEventListener('click',function(){rw.accept();});
    var x=panel.querySelector('.rwc-x');if(x)x.addEventListener('click',hidePanel);
  }

  // CCPA opt-out icon (toggle) shown with the "Your Privacy Choices" label.
  var ICON='<svg viewBox="0 0 30 14" aria-hidden="true"><rect x=".5" y=".5" width="29" height="13" rx="6.5" fill="#fff" stroke="#0066ff"/><path d="M15 .5h8a6.5 6.5 0 010 13h-8z" fill="#0066ff"/><path d="M5.5 7l2 2 3.5-4" fill="none" stroke="#0066ff" stroke-width="1.4" stroke-linecap="round"/><path d="M19 4.6l4.8 4.8m0-4.8L19 9.4" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/></svg>';
  function choicesButton(){
    var b=document.createElement('button');b.type='button';b.className='rw-privacy-choices';
    b.innerHTML='<span>Your Privacy Choices</span>'+ICON;
    return b;
  }

  // Where the fallback privacy line goes: the end of <body>, unless <body> lays its children
  // out side by side (single-card pages with a flex-row or grid body), in which case the
  // line goes at the bottom of the largest in-flow child (the page's card) instead.
  function lineHost(){
    var b=document.body,cs;
    try{cs=getComputedStyle(b);}catch(e){return b;}
    var sideBySide=(/flex/.test(cs.display)&&!/column/.test(cs.flexDirection))||/grid/.test(cs.display);
    if(!sideBySide)return b;
    var best=null,bestArea=0;
    for(var i=0;i<b.children.length;i++){
      var c=b.children[i],s=getComputedStyle(c);
      if(/SCRIPT|STYLE|NOSCRIPT/.test(c.tagName)||s.position==='fixed'||s.position==='absolute'||s.display==='none')continue;
      var r=c.getBoundingClientRect(),a=r.width*r.height;
      if(a>bestArea){best=c;bestArea=a;}
    }
    return best||b;
  }

  // "Your Privacy Choices" next to every footer Privacy link, plus any [data-rw-privacy-choices].
  // Pages with no footer Privacy link get a small privacy line appended at the end of <body>.
  function addFooterLinks(){
    var links=document.querySelectorAll('footer a[href^="/privacy"]');
    for(var i=0;i<links.length;i++){
      var a=links[i];
      if(a.parentNode.querySelector('.rw-privacy-choices'))continue;
      var b=choicesButton();
      if(a.className)b.className+=' '+a.className;
      try{var cs=getComputedStyle(a);b.style.color=cs.color;b.style.fontSize=cs.fontSize;b.style.fontWeight=cs.fontWeight;b.style.letterSpacing=cs.letterSpacing;}catch(e){}
      var wrapper=a.parentNode.tagName==='LI'?document.createElement('li'):null;
      if(wrapper){wrapper.appendChild(b);a.parentNode.parentNode.insertBefore(wrapper,a.parentNode.nextSibling);}
      else{a.parentNode.insertBefore(b,a.nextSibling);if(a.previousSibling&&a.previousSibling.nodeType===3&&/\S/.test(a.previousSibling.nodeValue)){a.parentNode.insertBefore(document.createTextNode(a.previousSibling.nodeValue),b);}}
    }
    if(!links.length&&!document.querySelector('[data-rw-privacy-choices],#rw-privacy-line')&&!document.body.hasAttribute('data-rw-no-privacy-line')){
      var line=document.createElement('div');line.id='rw-privacy-line';
      line.innerHTML='This site uses cookies and session recording to improve it. <a href="/privacy">Privacy policy</a> &middot; <a href="/terms">Terms</a> &middot; ';
      line.appendChild(choicesButton());
      var host=document.querySelector('[data-rw-privacy-line-host]')||lineHost();
      host.appendChild(line);
    }
  }

  function onReady(){
    scrubClickIds(); // again, for pages whose attribution script runs after this file
    css();
    addFooterLinks();
    document.addEventListener('click',function(e){
      var t=e.target.closest&&e.target.closest('.rw-privacy-choices,[data-rw-privacy-choices],a[href="#privacy-choices"]');
      if(t){e.preventDefault();showPanel(true);}
    });
    if(location.hash==='#privacy-choices')showPanel(true);
    else if(optIn&&!choice)showPanel(false);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',onReady);else onReady();
})();
