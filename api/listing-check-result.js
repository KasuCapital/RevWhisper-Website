// Listing Check results -> the team. /listing-check posts here at three moments (each at most once per
// check): the visitor finishes the ten questions, clicks "Start onboarding", or leaves partway (a beacon,
// sent only once they've answered at least one). We turn it into a ready-to-read note and forward it to
// the Make scenario "RevWhisper - Listing Check", which finds the person in Attio by email (the /audit form
// created them a few minutes earlier) and adds the note. Make never creates people from this, so a forged
// request can't put junk records in the CRM.
//
// Off until MAKE_LISTING_CHECK_WEBHOOK_URL is set: without it every call answers 202 and sends nothing.

const { rateLimit } = require('./_guard');

const SITE = 'https://revwhisper.com';
const KINDS = { finished: 1, checkout: 1, left: 1 };
const LABEL = { yes: 'Yes', partly: 'Partly', no: 'Not yet' };

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

// Vercel fills req.body for JSON; the local dev server and sendBeacon (text/plain) don't, so read the stream.
async function parseBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let raw = typeof req.body === 'string' ? req.body : Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (!raw) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 64 * 1024) return null;
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    raw = Buffer.concat(chunks).toString('utf8');
  }
  try { return JSON.parse(raw); } catch (e) { return null; }
}

// plain text, one line unless told otherwise, capped
function clean(v, max, multiline) {
  let s = String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
  if (!multiline) s = s.replace(/\s+/g, ' ');
  s = s.trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
// keep note text from reading as markdown structure it isn't
function md(s) { return s.replace(/([\\`*_[\]#<>|])/g, '\\$1'); }
function safeUrl(u) {
  const t = clean(u, 300);
  if (!t) return '';
  try {
    const x = new URL(/^https?:\/\//i.test(t) ? t : 'https://' + t);
    return /^https?:$/.test(x.protocol) ? x.toString() : '';
  } catch (e) { return ''; }
}
// a JSON string body, without its quotes, so Make can drop it straight into the Attio API call
function jsonInner(s) { return JSON.stringify(s).slice(1, -1); }

function buildNote(kind, p, reportId) {
  const lead = p.lead || {};
  const score = p.score || {};
  const yes = +score.yes || 0, partly = +score.partly || 0, no = +score.no || 0;
  const answered = yes + partly + no;
  const furthest = clean(p.furthestScreen, 120) || 'the first screen';

  const title = kind === 'checkout' ? 'Listing Check: clicked Start onboarding'
    : kind === 'finished' ? `Listing Check finished: ${yes} of 10 in place`
    : `Listing Check: left at ${furthest}`;

  const lines = [];
  if (kind === 'checkout') lines.push('They clicked **Start onboarding** and went to checkout ($498 onboarding, then $500/mo). If no payment comes through, follow up.', '');
  if (kind === 'left') lines.push(`They stopped partway, after answering ${answered} of 10.`, '');
  lines.push(`**Score:** ${yes} Yes, ${partly} Partly, ${no} Not yet${answered < 10 ? ` (${10 - answered} unanswered)` : ''}`);
  lines.push(`**Got to:** ${md(furthest)}`);
  const listing = safeUrl(lead.url);
  if (listing) lines.push(`**Listing:** ${listing}`);
  const facts = [clean(lead.listings, 40) && `listings ${md(clean(lead.listings, 40))}`, clean(lead.revenue, 60) && `revenue ${md(clean(lead.revenue, 60))}`].filter(Boolean);
  if (facts.length) lines.push(`**From the form:** ${facts.join(', ')}`);
  if (reportId) lines.push(`**Their report:** ${SITE}/listing-check?review=1&report=${encodeURIComponent(reportId)}`);

  const answers = p.answers && typeof p.answers === 'object' ? p.answers : {};
  const keys = Object.keys(answers).slice(0, 10);
  if (keys.length) {
    lines.push('', '**Their answers**');
    keys.forEach((k) => {
      const v = answers[k];
      const a = v && typeof v === 'object' ? v.answer : v;
      const note = v && typeof v === 'object' ? clean(v.note, 600) : '';
      lines.push(`- ${md(clean(k, 120))}: **${LABEL[a] || 'Not answered'}**${note ? `. Note: "${md(note)}"` : ''}`);
    });
  }
  return { title, content: lines.join('\n') };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'POST only.' });
  }
  if (!rateLimit(req, 'listing-check-result', 12, 10 * 60 * 1000)) return sendJson(res, 429, { error: 'Too many requests.' });

  const body = await parseBody(req);
  if (!body || typeof body !== 'object') return sendJson(res, 400, { error: 'Bad JSON.' });
  const kind = String(body.kind || '');
  const p = body.payload && typeof body.payload === 'object' ? body.payload : null;
  const email = clean(p && p.lead && p.lead.email, 200).toLowerCase();
  if (!KINDS[kind] || !p) return sendJson(res, 400, { error: 'Unknown event.' });
  if (!/^[^\s@"\\]+@[^\s@"\\]+\.[^\s@"\\]+$/.test(email)) return sendJson(res, 400, { error: 'A valid email is required.' });

  const reportId = /^[A-Za-z0-9_-]{6,40}$/.test(String(body.report || '')) ? String(body.report) : '';
  const note = buildNote(kind, p, reportId);
  const url = process.env.MAKE_LISTING_CHECK_WEBHOOK_URL;
  if (!url) return sendJson(res, 202, { ok: true, forwarded: false });

  const score = p.score || {};
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: 'listing_check',
        kind,
        email,
        name: clean(p.lead && p.lead.name, 120),
        listing_url: safeUrl(p.lead && p.lead.url),
        score_yes: +score.yes || 0,
        score_partly: +score.partly || 0,
        score_no: +score.no || 0,
        furthest_screen: clean(p.furthestScreen, 120),
        report_id: reportId,
        note_title: note.title,
        note_content: note.content,
        // the same two strings escaped for a JSON body (Make's Attio "Make an API call" takes raw JSON)
        note_title_json: jsonInner(note.title),
        note_content_json: jsonInner(note.content),
        sent_at: new Date().toISOString()
      })
    });
    if (!r.ok) {
      console.error('listing-check-result: Make answered', r.status);
      return sendJson(res, 502, { error: 'Could not record the result.' });
    }
  } catch (err) {
    console.error('listing-check-result: Make unreachable', err && err.message);
    return sendJson(res, 502, { error: 'Could not record the result.' });
  }
  return sendJson(res, 200, { ok: true, forwarded: true });
};

module.exports.buildNote = buildNote;
