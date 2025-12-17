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

  static async recordLocationUpdate(data) {
    try {
      const { data: result, error } = await supabase
        .from('audit_logs')
        .insert({
          user_id: data.userId,
          event: data.event || 'location_update',
          latitude: data.latitude,
          longitude: data.longitude,
          ip_address: data.ip,
          user_agent: data.userAgent,
          created_at: new Date().toISOString()
        });

      if (error) {
        console.error('Audit location error:', error);
      } else {
        console.log('Location audit recorded for user:', data.userId);
      }
    } catch (err) {
      console.error('Audit location exception:', err);
    }
  }
}

module.exports = AuditService;