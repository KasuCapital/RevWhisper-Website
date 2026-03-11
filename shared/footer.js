(function () {
  var css =
    'footer{padding:48px 0 36px;border-top:1px solid var(--g200)}' +
    '.footer-grid{display:grid;grid-template-columns:1fr auto;gap:24px 48px;margin-bottom:36px}' +
    '.footer-logo{display:flex;align-items:center;gap:8px;font-size:16px;font-weight:700;letter-spacing:-.03em;color:var(--black);margin-bottom:10px}' +
    '.footer-tag{font-size:13px;color:var(--g400);max-width:420px;line-height:1.6}' +
    '.footer-socials{display:flex;gap:12px;margin-top:14px}' +
    '.footer-socials a{display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;background:var(--g100);color:var(--g400);transition:background .2s,color .2s}' +
    '.footer-socials a:hover{background:var(--g200);color:var(--black)}' +
    '.footer-bottom{display:flex;align-items:center;justify-content:space-between;padding-top:24px;border-top:1px solid var(--g200);font-size:13px;color:var(--g400)}' +
    '@media(max-width:768px){footer{padding:40px 0 30px}.footer-bottom{flex-direction:column;gap:10px;align-items:flex-start}}';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var html =
    '<footer>' +
    '<div class="w">' +
    '<div class="footer-grid">' +
    '<div>' +
    '<div class="footer-logo">' +
    '<div class="lm">' +
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="24" height="24" fill="none">' +
    '<path d="M6 20C6 12 12 6 22 6H26C36 6 42 12 42 20C42 28 36 34 26 34H20L12 40V34C8.5 32 6 27 6 20Z" stroke="#32302F" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M15 21C15 21 17 14 19.5 14C22 14 22 28 24.5 28C27 28 27 16 29 16C31 16 32 22 33 22" stroke="#32302F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>' +
    '</div>' +
    '<span style="font-family:var(--heading);font-weight:600">RevWhisper</span>' +
    '</div>' +
    '<p class="footer-tag">A revenue intelligence team that layers into your Airbnb listing to accelerate performance and maximize earnings.</p>' +
    '<div class="footer-socials">' +
    '<a href="https://x.com/RevWhispr" target="_blank" rel="noopener noreferrer" aria-label="X (Twitter)">' +
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>' +
    '</a>' +
    '<a href="https://www.instagram.com/rev.whisper/" target="_blank" rel="noopener noreferrer" aria-label="Instagram">' +
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>' +
    '</a>' +
    '<a href="https://www.facebook.com/groups/airbnblistingoptimization" target="_blank" rel="noopener noreferrer" aria-label="Facebook">' +
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>' +
    '</a>' +
    '</div>' +
    '</div>' +
    '<div>' +
    '<p style="font-family:var(--heading);font-weight:600;font-size:14px;margin-bottom:10px">Resources</p>' +
    '<a href="/blog" style="display:block;font-size:13px;color:var(--g400);text-decoration:none;margin-bottom:6px;transition:color .2s" onmouseover="this.style.color=\'#32302F\'" onmouseout="this.style.color=\'#a39e9b\'">Blog</a>' +
    '<a href="/revenue-lift" style="display:block;font-size:13px;color:var(--g400);text-decoration:none;margin-bottom:6px;transition:color .2s" onmouseover="this.style.color=\'#32302F\'" onmouseout="this.style.color=\'#a39e9b\'">Revenue Calculator</a>' +
    '</div>' +
    '</div>' +
    '<div class="footer-bottom">' +
    '<span>&copy; ' + new Date().getFullYear() + ' MNW Holdings LLC d/b/a RevWhisper. All rights reserved.</span>' +
    '<span>Stop Guessing. Start Whispering.</span>' +
    '</div>' +
    '</div>' +
    '</footer>';

  var placeholder = document.getElementById('site-footer');
  if (placeholder) {
    placeholder.outerHTML = html;
  } else {
    document.body.insertAdjacentHTML('beforeend', html);
  }
})();
