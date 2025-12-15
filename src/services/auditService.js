// services/auditService.js
const supabase = require('../config/supabase');

class AuditService {
  static async recordLogin({ userId, empCode, email, latitude, longitude, ip, userAgent, event = 'login' }) {
    const payload = {
      user_id: userId,
      emp_code: empCode,
      email,
      event,
      event_time: new Date().toISOString(),
      latitude,
      longitude,
      ip,
      user_agent: userAgent
    };

    const { data, error } = await supabase.from('login_audit').insert(payload);
    if (error) {
      console.error('AuditService.recordLogin error:', error);
      return null;
    }
    return data;
  }
}

module.exports = AuditService;