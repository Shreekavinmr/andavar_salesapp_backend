const supabase = require("../config/supabase");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const DealerModel = require("../models/dealerModel");

dayjs.extend(utc);
dayjs.extend(timezone);

class PunchService {

  // ===============================
  // PUNCH IN
  // ===============================
  static async punchIn(data) {
    const {
      userId,
      latitude,
      longitude,
      address,
      clientDate,
      timezone: clientTz,
      ip,
      deviceInfo,
    } = data;

    const today = clientDate
      ? clientDate
      : clientTz
      ? dayjs().tz(clientTz).format("YYYY-MM-DD")
      : dayjs().utc().format("YYYY-MM-DD");

    // ✅ FIX-2: Parallel DB calls
    const [
      { data: employee, error: empError },
      { data: existing, error: checkError },
    ] = await Promise.all([
      supabase
        .from("profiles_onboard")
        .select("employee_code, full_name, reporting_manager_id")
        .eq("id", userId)
        .single(),

      supabase
        .from("employee_daily_punches")
        .select("id")
        .eq("employee_id", userId)
        .eq("punch_date", today)
        .single(),
    ]);

    if (empError || !employee) {
      throw new Error("Employee not found");
    }

    if (checkError && checkError.code !== "PGRST116") {
      throw new Error("Error checking existing punch");
    }

    if (existing) {
      throw new Error("Already punched in today");
    }

    // Get manager name (non-blocking)
    let managerName = null;
    if (employee.reporting_manager_id) {
      supabase
        .from("profiles_onboard")
        .select("full_name")
        .eq("id", employee.reporting_manager_id)
        .single()
        .then(({ data }) => {
          managerName = data?.full_name || null;
        });
    }

    const humanAddress = address || null;

    // Insert punch
    const { data: punchRecord, error: insertError } = await supabase
      .from("employee_daily_punches")
      .insert({
        employee_id: userId,
        employee_code: employee.employee_code,
        employee_name: employee.full_name,
        reporting_manager_id: employee.reporting_manager_id,
        reporting_manager_name: managerName,
        punch_date: today,
        punch_in_time: new Date().toISOString(),
        punch_in_latitude: latitude,
        punch_in_longitude: longitude,
        punch_in_address: humanAddress,
        punch_in_ip: ip,
        punch_in_device_info: deviceInfo,
        status: "punched_in",
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Punch in failed: ${insertError.message}`);
    }

    return {
      punchId: punchRecord.id,
      punchInTime: punchRecord.punch_in_time,
      status: "punched_in",
      message: "Punched in successfully",
    };
  }

  // ===============================
  // PUNCH OUT
  // ===============================
  static async punchOut(data) {
    const { userId, latitude, longitude, address, ip, deviceInfo } = data;
    const today = dayjs().utc().format("YYYY-MM-DD");

    const { data: existing, error } = await supabase
      .from("employee_daily_punches")
      .select("*")
      .eq("employee_id", userId)
      .eq("punch_date", today)
      .single();

    if (error || !existing) {
      throw new Error("No punch in record found for today");
    }

    if (existing.punch_out_time) {
      throw new Error("Already punched out today");
    }

    const punchInTime = dayjs(existing.punch_in_time);
    const punchOutTime = dayjs();
    const totalHours = punchOutTime.diff(punchInTime, "hour", true);

    const { data: updated, error: updateError } = await supabase
      .from("employee_daily_punches")
      .update({
        punch_out_time: new Date().toISOString(),
        punch_out_latitude: latitude,
        punch_out_longitude: longitude,
        punch_out_address: address || null,
        punch_out_ip: ip,
        punch_out_device_info: deviceInfo,
        total_hours: parseFloat(totalHours.toFixed(2)),
        status: "punched_out",
      })
      .eq("id", existing.id)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Punch out failed: ${updateError.message}`);
    }

    return {
      punchId: updated.id,
      punchInTime: updated.punch_in_time,
      punchOutTime: updated.punch_out_time,
      totalHours: updated.total_hours,
      status: "punched_out",
      message: `Punched out successfully. Total hours: ${updated.total_hours}`,
    };
  }

  // ===============================
  // TODAY STATUS
  // ===============================
  static async getTodayStatus(userId) {
    const today = dayjs().utc().format("YYYY-MM-DD");

    const { data, error } = await supabase
      .from("employee_daily_punches")
      .select("*")
      .eq("employee_id", userId)
      .eq("punch_date", today)
      .single();

    if (error && error.code !== "PGRST116") {
      throw new Error("Error fetching today's status");
    }

    if (!data) {
      return {
        hasPunchedIn: false,
        hasPunchedOut: false,
        status: "not_punched_in",
      };
    }

    return {
      hasPunchedIn: !!data.punch_in_time,
      hasPunchedOut: !!data.punch_out_time,
      status: data.status,
      punchRecord: data,
    };
  }

  // ===============================
  // HISTORY
  // ===============================
  static async getHistory({ userId, startDate, endDate, limit }) {
    let query = supabase
      .from("employee_daily_punches")
      .select("*")
      .eq("employee_id", userId)
      .order("punch_date", { ascending: false });

    if (startDate) query = query.gte("punch_date", startDate);
    if (endDate) query = query.lte("punch_date", endDate);
    if (limit) query = query.limit(limit);

    const { data, error } = await query;
    if (error) throw new Error("Error fetching punch history");

    return { records: data, count: data.length };
  }

  // ===============================
  // MONTHLY SUMMARY (RESTORED)
  // ===============================
  static async getMonthlySummary({ userId, year, month }) {
    const startDate = dayjs(`${year}-${month}-01`).format("YYYY-MM-DD");
    const endDate = dayjs(startDate).endOf("month").format("YYYY-MM-DD");

    const { data, error } = await supabase
      .from("employee_daily_punches")
      .select("*")
      .eq("employee_id", userId)
      .gte("punch_date", startDate)
      .lte("punch_date", endDate)
      .order("punch_date", { ascending: true });

    if (error) {
      throw new Error("Error fetching monthly summary");
    }

    const totalDays = data.length;
    const completeDays = data.filter((d) => d.status === "punched_out").length;
    const incompleteDays = data.filter((d) => d.status === "punched_in").length;
    const totalHours = data.reduce((sum, d) => sum + (d.total_hours || 0), 0);

    return {
      year,
      month,
      summary: {
        totalDays,
        completeDays,
        incompleteDays,
        totalHours: parseFloat(totalHours.toFixed(2)),
        averageHoursPerDay:
          completeDays > 0
            ? parseFloat((totalHours / completeDays).toFixed(2))
            : 0,
      },
      records: data,
    };
  }

  // ===============================
  // ADMIN REPORT
  // ===============================
  static async getAdminReport({ startDate, endDate, employeeId, requestorId }) {
    const { data: reqUser } = await supabase
      .from("profiles_onboard")
      .select("id, role")
      .eq("id", requestorId)
      .single();

    const role = (reqUser?.role || "").toLowerCase();
    let allowedEmployeeIds = null;

    if (["admin", "owner", "gm"].includes(role)) {
  allowedEmployeeIds = null; 
}
// MID LEVEL (RSM / ASM / Manager)
else if (["rsm", "asm", "manager"].includes(role)) {
  const reportees = await DealerModel.getAllReportees(requestorId);
  allowedEmployeeIds = [requestorId, ...reportees];
}
// SALES OFFICER
else {
  allowedEmployeeIds = [requestorId];
}
    let query = supabase
      .from("employee_daily_punches")
      .select("*")
      .order("punch_date", { ascending: false })
      .order("employee_name", { ascending: true });

    if (startDate) query = query.gte("punch_date", startDate);
    if (endDate) query = query.lte("punch_date", endDate);
    if (employeeId) {
  query = query.eq("employee_id", employeeId);
} else if (allowedEmployeeIds) {
  query = query.in("employee_id", allowedEmployeeIds);
}


    const { data, error } = await query;
    if (error) throw new Error("Error fetching admin report");

    return { records: data, count: data.length };
  }
}

module.exports = PunchService;
