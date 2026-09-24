/* ── Shared phone validation: real numbering-plan check (libphonenumber-js 1.13.14, MIT) ──
   Catches numbers that can't exist (e.g. unassigned area code 982), which Attio rejects
   and which then halt the Make "Contact Us" run. Every page with a phone field includes
   this file and calls rwPhoneCheck(code, raw) from its own validation.

   The ~43KB (gzipped) library loads lazily on the first form interaction, with an idle
   backstop. Until it arrives, rwPhoneCheck falls back to digit-count rules, so a slow or
   failed fetch never blocks a lead. */
(function(){
  var SRC='/assets/vendor/libphonenumber-min.js', requested=false;
  function load(){
    if(requested||window.libphonenumber) return;
    requested=true;
    var s=document.createElement('script');
    s.src=SRC; s.async=true;
    s.onerror=function(){ requested=false; };
    document.head.appendChild(s);
  }
  function digits(v){ return (String(v||'').match(/\d/g)||[]).join(''); }

  /* code: the country-code select value ('+1', '+44', ...). raw: what the user typed.
     A number typed with its own leading '+' is parsed as-is, whatever the select says. */
  window.rwPhoneCheck=function(code,raw){
    var d=digits(raw), cc=digits(code)||'1';
    var L=window.libphonenumber;
    if(L&&L.parsePhoneNumberFromString&&d){
      try{
        var s=String(raw).trim(), p=L.parsePhoneNumberFromString(s.charAt(0)==='+'?s:d,{defaultCallingCode:cc});
        return !!(p&&p.isValid());
      }catch(e){}
    }
    if(cc==='1'){ if(d.length===11&&d.charAt(0)==='1') d=d.slice(1); return d.length===10; }
    return d.length>=7&&d.length<=15;
  };
  window.rwPhoneLoad=load;

  document.addEventListener('focusin',function(e){
    var t=e.target;
    if(t&&(t.tagName==='INPUT'||t.tagName==='SELECT'||t.tagName==='TEXTAREA')) load();
  });
  if(window.requestIdleCallback) requestIdleCallback(load,{timeout:5000});
  else setTimeout(load,3000);
})();
