const LocationModel = require("../models/locationModel");
const AdminService = require("./adminService");
const logger = require("../utils/logger");
const geolib = require("geolib");
const supabase = require("../config/supabase");

class LocationService {
  static async startSession(userId) {
    return await LocationModel.startSession(userId);
  }

  static async stopSession(userId) {
    const today = new Date().toISOString().slice(0, 10);

    await LocationModel.stopSession(userId);

    // 🔥 calculate distance after stop
    await LocationService.calculateAndUpdateDailyDistance(userId, today);

    return { success: true };
  }

  static async insertLocation(userId, payload) {
    const { latitude, longitude, accuracy, speed, recorded_at } = payload;

    if (accuracy && accuracy > 30) {
      return { skipped: true, reason: "low_accuracy" };
    }

    if (!latitude || !longitude || !recorded_at) {
      throw new Error("latitude, longitude and recorded_at are required");
    }

    // 🔥 1️⃣ Check active session
    const today = new Date().toISOString().slice(0, 10);
    const { data: session } = await supabase
      .from("tracking_sessions")
      .select("id")
      .eq("user_id", userId)
      .eq("session_date", today)
      .eq("is_active", true)
      .single();

    if (!session) {
      throw new Error("No active tracking session");
    }

    // 🔥 2️⃣ Prevent duplicate consecutive points
    const { data: last } = await supabase
      .from("location_logs")
      .select("latitude, longitude")
      .eq("user_id", userId)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .single();

    if (last && last.latitude === latitude && last.longitude === longitude) {
      return { skipped: true };
    }

    // 🔥 3️⃣ Insert location
    return await LocationModel.insertLocation({
      user_id: userId,
      latitude,
      longitude,
      accuracy,
      speed,
      recorded_at,
    });
  }

  static async getRoute(targetUserId, date, requester) {
    const userId = targetUserId || requester.id;

    // Authorization: allow self or upward hierarchy
    if (userId !== requester.id) {
      const reportees = await AdminService.getAllReportees(requester.id);
      if (!reportees.includes(userId)) {
        throw new Error("Not authorized to view this route");
      }
    }

    return await LocationModel.getRouteForDay(userId, date);
  }

  static async getDailyDistance(targetUserId, date, requester) {
    const userId = targetUserId || requester.id;

    const role = (requester.role || '').toLowerCase();

if (!["admin", "owner", "gm"].includes(role)) {
  const reportees = await AdminService.getAllReportees(requester.id);

  if (userId !== requester.id && !reportees.includes(userId)) {
    throw new Error("Not authorized");
  }
}


    return await LocationModel.getDailyDistance(userId, date);
  }

  static async calculateAndUpdateDailyDistance(userId, date) {
    // 1. Fetch route points
    const points = await LocationModel.getRouteForDay(userId, date);

    let distanceKm = 0;

    // 2. Calculate distance only if we have 2+ points
    if (points && points.length >= 2) {
      let totalMeters = 0;

      for (let i = 1; i < points.length; i++) {
        totalMeters += geolib.getDistance(
          {
            latitude: points[i - 1].latitude,
            longitude: points[i - 1].longitude,
          },
          {
            latitude: points[i].latitude,
            longitude: points[i].longitude,
          }
        );
      }

      distanceKm = Number((totalMeters / 1000).toFixed(2));
    }

    // 3. ✅ ALWAYS save to DB, even if distance is 0
    await LocationModel.upsertDailyDistance(userId, date, distanceKm);

    logger.info(
      `Distance calculated for ${userId} on ${date}: ${distanceKm} km (${
        points?.length || 0
      } points)`
    );

    return { distance_km: distanceKm, point_count: points?.length || 0 };
  }
}

module.exports = LocationService;
