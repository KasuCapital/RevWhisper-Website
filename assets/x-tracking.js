(function(){
  var config = {
    pixelId: 'r8ftv',
    auditLeadEventId: '',
    auditCallBookedEventId: ''
  };

  function assignConfig(next) {
    if (!next || typeof next !== 'object') return config;
    if (next.pixelId) config.pixelId = String(next.pixelId);
    if (next.auditLeadEventId) config.auditLeadEventId = String(next.auditLeadEventId);
    if (next.auditCallBookedEventId) config.auditCallBookedEventId = String(next.auditCallBookedEventId);
    return config;
  }

  window.rwXConfig = config;
  window.rwXReady = fetch('/api/x-config', { credentials: 'same-origin', cache: 'no-store' })
    .then(function(res){ return res.ok ? res.json() : {}; })
    .then(assignConfig)
    .catch(function(){ return config; });

  window.rwXConversionId = function(prefix) {
    return String(prefix || 'x_conv') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  };

  window.rwXNormalizePhone = function(value) {
    var digits = String(value || '').replace(/[^0-9]/g, '');
    return digits ? '+' + digits : '';
  };

  window.rwXTrack = function(kind, params) {
    var key = {
      auditLead: 'auditLeadEventId',
      auditCallBooked: 'auditCallBookedEventId'
    }[kind] || kind;
    var eventId = config[key] || '';
    if (!eventId || typeof window.twq !== 'function') return false;
    window.twq('event', eventId, params || {});
    return true;
  };
})();
