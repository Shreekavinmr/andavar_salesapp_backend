const supabase = require('../config/supabase');

class LocationModel {

  static async startSession(userId) {
    const today = new Date().toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('tracking_sessions')
      .upsert({
        user_id: userId,
        session_date: today,
        started_at: new Date().toISOString(),
        is_active: true
      }, { onConflict: 'user_id,session_date' })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  static async stopSession(userId) {
    const today = new Date().toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('tracking_sessions')
      .update({
        ended_at: new Date().toISOString(),
        is_active: false
      })
      .eq('user_id', userId)
      .eq('session_date', today)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  static async insertLocation(payload) {
    const { data, error } = await supabase
      .from('location_logs')
      .insert(payload)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  static async getRouteForDay(userId, date) {
    const start = `${date}T00:00:00Z`;
    const end = `${date}T23:59:59Z`;

    const { data, error } = await supabase
      .from('location_logs')
      .select('latitude, longitude, recorded_at')
      .eq('user_id', userId)
      .gte('recorded_at', start)
      .lte('recorded_at', end)
      .order('recorded_at', { ascending: true });

    if (error) throw new Error(error.message);
    return data;
  }

  static async getDailyDistance(userId, date) {
    const { data, error } = await supabase
      .from('daily_distance')
      .select('distance_km')
      .eq('user_id', userId)
      .eq('travel_date', date)
      .single();

    if (error && error.code !== 'PGRST116') throw new Error(error.message);
    return data || { distance_km: 0 };
  }

  static async upsertDailyDistance(userId, date, distanceKm) {
  const { error } = await supabase
    .from('daily_distance')
    .upsert({
      user_id: userId,
      travel_date: date,
      distance_km: distanceKm,
      calculated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,travel_date'
    });

  if (error) throw new Error(error.message);
}

}

module.exports = LocationModel;
