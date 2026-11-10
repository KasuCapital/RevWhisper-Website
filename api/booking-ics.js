// GET /api/booking-ics?start=<ISO>
// Serves the booked audit as a downloadable calendar event (text/calendar) for the
// success screen's "Apple / Outlook" link. A data: URI .ics is unreliable on iOS Safari,
// so a real endpoint with the right content type is the dependable route — the OS opens
// it straight into the calendar app.
//
// Query-driven by design (no Cal.com round-trip, works even when the booking response is
// long gone). Everything in the event is a fixed string except `start` (must parse as a
// real date), so the endpoint can't be repurposed to generate arbitrary spam invites.

const DURATION_MIN = 30;

function icsStamp(d) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: 'Method not allowed.' }));
  }

  const url = new URL(req.url, 'http://localhost');
  const start = new Date(url.searchParams.get('start') || '');
  if (Number.isNaN(start.getTime())) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: 'A valid start time is required (ISO 8601).' }));
  }
  // A ?meet= param is ignored on purpose (pages cached before this change may still send one):
  // calls get swapped between reps and the Meet link changes with the host, so a link saved at
  // booking time sends people to the wrong meeting. The link goes out 1 hour before the call.
  const end = new Date(start.getTime() + DURATION_MIN * 60 * 1000);

  // Commas are reserved in ICS text values (RFC 5545) — escape the one in the copy.
  const description = 'Your live Airbnb performance audit with RevWhisper\\, 30 minutes over Google Meet.' +
    '\\n\\nYour Google Meet link will be emailed to you 1 hour before your call.';

  // CRLF line endings per RFC 5545.
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RevWhisper//Live Audit//EN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:rw-audit-${icsStamp(start)}@revwhisper.com`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    'SUMMARY:Your RevWhisper live audit',
    `DESCRIPTION:${description}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Your RevWhisper live audit starts in 30 minutes',
    'TRIGGER:-PT30M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ];

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="revwhisper-audit.ics"');
  res.setHeader('Cache-Control', 'no-store');
  res.end(lines.join('\r\n'));
};
