/* Bryan's intro video, shared by desktop /audit, the Google Ads landing pages and the homepage
   (markup: _partials/vsl.html). Same behaviour as the phone /audit welcome screen in audit-flow.html:
   nothing plays until the visitor clicks, then it starts from the top with sound; a click on the
   picture pauses or resumes; full screen hands off to the browser's own player. Opening the audit
   form's full-screen takeover pauses it, so the two never talk over each other. */
(function(){
  var PAGE=location.pathname.replace(/^\/+|\/+$|\.html$/g,'')||'home';
  var VERB=window.matchMedia&&matchMedia('(hover:hover) and (pointer:fine)').matches?'Click':'Tap';
  function track(e,p){ try{ if(window.rwTrack) rwTrack(e,p); }catch(_){} }
  function fmt(s){ s=Math.max(0,Math.round(s||0)); return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); }

  function init(box){
    var v=box.querySelector('video'), hit=box.querySelector('.rv-hit'), time=box.querySelector('.rv-time');
    var bar=box.querySelector('.rv-prog i'), fsBtn=box.querySelector('.rv-fs');
    var placement=box.getAttribute('data-placement')||'hero';
    var raf=0, quart=0, started=false;
    function total(){ return isFinite(v.duration)&&v.duration>0?v.duration:131; }
    function state(s){
      box.setAttribute('data-state',s);
      // the line is hidden while it plays, so its words only ever change out of sight
      if(s==='idle') time.textContent=fmt(total())+' · '+VERB+' to watch with sound';
      else if(s==='paused') time.textContent=fmt(v.currentTime)+' / '+fmt(total())+' · '+VERB+' to resume';
      else if(s==='ended') time.textContent='Watch again · '+fmt(total());
      hit.setAttribute('aria-label',s==='playing'?'Pause the video':s==='paused'?'Resume the video':s==='ended'?'Watch the video again':"Play Bryan's video with sound");
    }
    function paint(){
      bar.style.transform='scaleX('+Math.min(1,v.currentTime/total())+')';
      raf=v.paused?0:requestAnimationFrame(paint);
    }
    function play(){
      v.muted=false; state('playing');
      if(v.readyState<3) box.classList.add('buffering');
      var p=v.play();
      if(p&&p.catch) p.catch(function(e){ if(e&&e.name==='NotAllowedError'){ box.classList.remove('buffering'); state(started&&v.currentTime>0?'paused':'idle'); } });
    }
    state('idle');
    hit.addEventListener('click',function(){
      if(!started){ started=true; track('vsl_play',{page:PAGE,placement:placement}); }
      if(v.ended){ try{ v.currentTime=0; }catch(e){} play(); return; }
      if(v.paused) play(); else v.pause();
    });
    fsBtn.addEventListener('click',function(){
      if(v.paused) play();
      track('vsl_fullscreen',{page:PAGE,placement:placement});
      try{
        if(v.requestFullscreen){
          v.controls=true; // the browser's own scrubber while it fills the screen
          v.requestFullscreen().then(function(){
            if(screen.orientation&&screen.orientation.lock) screen.orientation.lock('landscape').catch(function(){});
          }).catch(function(){ v.controls=false; });
        } else if(v.webkitEnterFullscreen) v.webkitEnterFullscreen(); // iPhone: the native player
      }catch(e){}
    });
    document.addEventListener('fullscreenchange',function(){
      if(document.fullscreenElement) return;
      v.controls=false;
      if(screen.orientation&&screen.orientation.unlock) try{ screen.orientation.unlock(); }catch(e){}
    });
    v.addEventListener('playing',function(){ box.classList.remove('buffering'); state('playing'); if(!raf) raf=requestAnimationFrame(paint); });
    v.addEventListener('pause',function(){ if(!v.ended&&v.currentTime<total()-.3) state('paused'); });
    v.addEventListener('waiting',function(){ if(!v.paused) box.classList.add('buffering'); });
    v.addEventListener('canplay',function(){ if(!v.paused) box.classList.remove('buffering'); });
    v.addEventListener('timeupdate',function(){
      var q=Math.floor(v.currentTime/total()*4);
      if(q>quart&&q<4){ quart=q; track('vsl_progress',{pct:q*25,page:PAGE,placement:placement}); }
    });
    v.addEventListener('ended',function(){
      box.classList.remove('buffering'); state('ended'); bar.style.transform='scaleX(1)';
      if(quart<4){ quart=4; track('vsl_progress',{pct:100,page:PAGE,placement:placement}); }
    });
    document.addEventListener('visibilitychange',function(){ if(document.hidden&&!v.paused) v.pause(); });
    // the audit form's takeover (body.rw-fs) covers the video: stop it talking under the questions
    if(window.MutationObserver) new MutationObserver(function(){
      if(document.body.classList.contains('rw-fs')&&!v.paused) v.pause();
    }).observe(document.body,{attributes:true,attributeFilter:['class']});
  }

  function boot(){ [].forEach.call(document.querySelectorAll('.rv'),init); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
