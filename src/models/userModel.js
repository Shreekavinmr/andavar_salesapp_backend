// src/models/userModel.js (Complete with all methods)
const supabase = require("../config/supabase");
const bcrypt = require("bcryptjs");
const RoleModel = require("./roleModel");

class UserModel {
  static async findByEmail(email) {
    try {
      const { data, error } = await supabase
        .from("profiles_onboard")
        .select(
          "id, email, password_hash, full_name, role, is_active, employee_code"
        )
        .eq("email", email)
        .single();

      if (error && error.code !== "PGRST116") {
        throw new Error(`Database error: ${error.message}`);
      }

      if (data && !data.is_active) {
        return null;
      }

      return data || null;
    } catch (error) {
      throw new Error(`User fetch error: ${error.message}`);
    }
  }
  static async findByMobile(mobileNumber) {
  try {
    const { data, error } = await supabase
      .from("profiles_onboard")
      .select(
        "id, email, phone, password_hash, full_name, role, is_active, employee_code"
      )
      .eq("phone", mobileNumber)
      .single();

    if (error && error.code !== "PGRST116") {
      throw new Error(`Database error: ${error.message}`);
    }

    if (data && !data.is_active) {
      return null;
    }

    return data || null;
  } catch (error) {
    throw new Error(`User fetch error: ${error.message}`);
  }
}

  // Find by reset token
  static async findByResetToken(token) {
    try {
      const { data, error } = await supabase
        .from("profiles_onboard")
        .select("id, email, reset_token_expiry")
        .eq("reset_token", token)
        .gte("reset_token_expiry", new Date().toISOString()) // Not expired
        .single();

      if (error && error.code !== "PGRST116") {
        throw new Error(`Database error: ${error.message}`);
      }

      return data || null;
    } catch (error) {
      throw new Error(`Token fetch error: ${error.message}`);
    }
  }

  // Update password and clear reset token
  static async updatePassword(id, hashedPassword) {
    try {
      const { error } = await supabase
        .from("profiles_onboard")
        .update({
          password_hash: hashedPassword,
          reset_token: null,
          reset_token_expiry: null,
        })
        .eq("id", id);

      if (error) {
        throw new Error(`Update error: ${error.message}`);
      }
      return true;
    } catch (error) {
      throw new Error(`Password update error: ${error.message}`);
    }
  }

  // Set reset token
  static async setResetToken(id, token, expiry) {
    try {
      const { error } = await supabase
        .from("profiles_onboard")
        .update({
          reset_token: token,
          reset_token_expiry: expiry.toISOString(),
        })
        .eq("id", id);

      if (error) {
        throw new Error(`Token set error: ${error.message}`);
      }
      return true;
    } catch (error) {
      throw new Error(`Set token error: ${error.message}`);
    }
  }

  // NEW: Get employees with optional filters
  // src/models/userModel.js (replace getEmployees implementation)
  static async getEmployees(options = {}) {
    try {
      const page = parseInt(options.page, 10) || 1;
      const limit = Math.min(parseInt(options.limit, 10) || 50, 200); // cap limit
      const offset = (page - 1) * limit;

      // base select (include columns you need)
      let baseQuery = supabase
        .from("profiles_onboard")
        .select(
          "id, email, full_name, role,phone, employee_code, office_id, reporting_manager_id, created_at, is_active",
          { count: "exact" }
        );

      // filter office
      if (options.office_id) {
        baseQuery = baseQuery.eq("office_id", options.office_id);
      }

      // filter role (string contains)
      if (options.role && typeof options.role === "string") {
        baseQuery = baseQuery.ilike("role", `%${options.role}%`);
      }

      // server-side search q: search name, email, employee_code
      if (options.q && options.q.toString().trim() !== "") {
        const q = options.q.toString().trim();
        // Build OR search across columns (ilike)
        const orClauses = [
          `full_name.ilike.%${q}%`,
          `email.ilike.%${q}%`,
          `employee_code.ilike.%${q}%`,
        ].join(",");
        baseQuery = baseQuery.or(orClauses);
      }

      // only active by default
      if (typeof options.is_active !== "undefined") {
        baseQuery = baseQuery.eq("is_active", options.is_active);
      } else {
        baseQuery = baseQuery.eq("is_active", true);
      }

      // ordering
      baseQuery = baseQuery.order("created_at", { ascending: false });

      // fetch paginated range
      const from = offset;
      const to = offset + limit - 1;

      const { data, error, count } = await baseQuery.range(from, to);

      if (error) {
        throw new Error(`Get employees error: ${error.message}`);
      }

      const total = typeof count === "number" ? count : data ? data.length : 0;
      return { rows: data || [], total };
    } catch (error) {
      throw new Error(`Get employees error: ${error.message}`);
    }
  }

  // inside class UserModel { ... add this static method ...
  static async getPossibleManagers(selectedRoleName) {
  try {
    if (!selectedRoleName) {
      return { success: true, managers: [] };
    }
    // 1) lookup selected role's level
    const { data: selRole, error: selErr } = await supabase
      .from('roles_hierarchy')
      .select('id, name, level')
      .eq('name', selectedRoleName)
      .single();
    if (selErr || !selRole) {
      console.warn('getPossibleManagers: selected role not found:', selectedRoleName, selErr?.message);
      return { success: true, managers: [] };
    }
    // 2) get roles that are higher in hierarchy (smaller level = higher role)
    const { data: higherRoles, error: hrErr } = await supabase
      .from('roles_hierarchy')
      .select('name, level')
      .lt('level', selRole.level)
      .order('level', { ascending: true });
    if (hrErr) {
      console.error('getPossibleManagers: error fetching higher roles:', hrErr);
      throw new Error(hrErr.message || 'Error fetching roles');
    }
    // normalize to array of role names
    const roleNames = Array.isArray(higherRoles)
      ? higherRoles.map(r => r.name).filter(Boolean)
      : (higherRoles && Array.isArray(higherRoles.rows))
        ? higherRoles.rows.map(r => r.name).filter(Boolean)
        : [];
    if (roleNames.length === 0) {
      // nothing higher than selectedRole
      return { success: true, managers: [] };
    }
    // 3) Query profiles_onboard for those role names.
    // Use ilike so we match role fields like "owner,admin" etc.
    const orClauses = roleNames.map(r => `role.ilike.%${r}%`).join(',');
    const { data: managersRaw, error: mgrErr } = await supabase
      .from('profiles_onboard')
      .select('id, email, full_name, role, phone, employee_code, office_id, reporting_manager_id, created_at, is_active')
      .or(orClauses)
      .eq('is_active', true)
      .order('full_name', { ascending: true });
    if (mgrErr) {
      console.error('getPossibleManagers: error fetching managers:', mgrErr);
      throw new Error(mgrErr.message || 'Error fetching managers');
    }
    // normalize to plain array
    const managersArray = Array.isArray(managersRaw) ? managersRaw : (managersRaw && managersRaw.rows) ? managersRaw.rows : [];
    // dedupe by id (just in case)
    const unique = [];
    const seen = new Set();
    for (const m of managersArray) {
      if (!m || !m.id) continue;
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      unique.push(m);
    }
    console.log(`Found ${unique.length} unique managers for role: ${selectedRoleName}`);
    return { success: true, managers: unique };
  } catch (error) {
    console.error('getPossibleManagers error:', error?.message || error);
    throw new Error(`Get possible managers error: ${error?.message || error}`);
  }
}
static async findByEmailOrPhone(identifier) {
    try {
      // Check if identifier looks like a phone number (digits only)
      const isPhone = /^\d+$/.test(identifier.trim());
      
      let query = supabase
        .from("profiles_onboard")
        .select(
          "id, email, phone, password_hash, full_name, role, is_active, employee_code"
        );

      if (isPhone) {
        // Search by phone
        query = query.eq("phone", identifier.trim());
      } else {
        // Search by email
        query = query.eq("email", identifier.trim());
      }

      const { data, error } = await query.single();

      if (error && error.code !== "PGRST116") {
        throw new Error(`Database error: ${error.message}`);
      }

      if (data && !data.is_active) {
        return null;
      }

      return data || null;
    } catch (error) {
      throw new Error(`User fetch error: ${error.message}`);
    }
  }

  // Keep the existing findByEmail for backward compatibility
  static async findByEmail(email) {
    try {
      const { data, error } = await supabase
        .from("profiles_onboard")
        .select(
          "id, email, password_hash, full_name, role, is_active, employee_code"
        )
        .eq("email", email)
        .single();

      if (error && error.code !== "PGRST116") {
        throw new Error(`Database error: ${error.message}`);
      }

      if (data && !data.is_active) {
        return null;
      }

      return data || null;
    } catch (error) {
      throw new Error(`User fetch error: ${error.message}`);
    }
  }

  static async generateEmployeeCode() {
    try {
      // Fetch the highest existing employee code
      const { data, error } = await supabase
        .from("profiles_onboard")
        .select("employee_code")
        .like("employee_code", "AN%")
        .order("employee_code", { ascending: false })
        .limit(1);

      if (error) {
        throw new Error(`Fetch last employee code error: ${error.message}`);
      }

      let nextNumber = 1;

      if (data && data.length > 0) {
        const lastCode = data[0].employee_code; // e.g. "AN0000123"
        const numericPart = parseInt(lastCode.replace("AN", ""), 10);
        nextNumber = numericPart + 1;
      }

      // Convert to AN0000001 format
      const newCode = `AN${String(nextNumber).padStart(7, "0")}`;

      return newCode;
    } catch (error) {
      throw new Error(`Generate employee code error: ${error.message}`);
    }
  }

  // Create/onboard new employee
  static async createEmployee(employeeData) {
    try {
      const {
        email,
        full_name,
        phone,
        role,
        reporting_manager_id,
        office_id,
        password,
        employee_code,
        metadata = {},
      } = employeeData;

      // Validate manager hierarchy if manager is specified
      // if (reporting_manager_id) {
      //   const possibleManagers = await UserModel.getPossibleManagers(role);
      //   const managerIds = possibleManagers.map((m) => m.id);

      //   if (!managerIds.includes(reporting_manager_id)) {
      //     throw new Error("Reporting manager must be in higher hierarchy");
      //   }
      // }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Generate employee code if not provided
      const finalEmployeeCode =
        employee_code || (await UserModel.generateEmployeeCode());

      const { data, error } = await supabase
        .from("profiles_onboard")
        .insert({
          email,
          full_name,
          phone,
          role: Array.isArray(role) ? role.join(",") : role, // Store as comma-separated
          reporting_manager_id,
          office_id,
          employee_code: finalEmployeeCode,
          password_hash: hashedPassword,
          metadata,
          is_active: true,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          throw new Error("Email already exists");
        }
        throw new Error(`Insert error: ${error.message}`);
      }

      return data;
    } catch (error) {
      throw new Error(`Create employee error: ${error.message}`);
    }
  }

  static async getEmployeeById(id) {
    try {
      if (!id) throw new Error("Employee id required");
      const { data, error } = await supabase
        .from("profiles_onboard")
        .select(
          "id, email, full_name, phone, role, employee_code, office_id, reporting_manager_id, metadata, is_active, created_at"
        )
        .eq("id", id)
        .single();

      if (error) {
        throw new Error(`Fetch employee error: ${error.message}`);
      }
      return data || null;
    } catch (error) {
      throw new Error(`Get employee error: ${error.message}`);
    }
  }

  static async updateEmployee(id, payload = {}) {
    try {
      if (!id) throw new Error("Employee id required");

      const updatePayload = { ...payload };

      // Handle password separately
      if (updatePayload.password) {
        updatePayload.password_hash = await bcrypt.hash(
          updatePayload.password,
          10
        );
        delete updatePayload.password;
      }

      // Normalize role array to comma-separated string if provided
      if (updatePayload.role && Array.isArray(updatePayload.role)) {
        updatePayload.role = updatePayload.role.join(",");
      }

      // Prevent accidental nulling of email/employee_code if undefined
      if (typeof updatePayload.email === "undefined")
        delete updatePayload.email;
      if (typeof updatePayload.employee_code === "undefined")
        delete updatePayload.employee_code;

      updatePayload.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from("profiles_onboard")
        .update(updatePayload)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        // handle unique constraint message if needed
        throw new Error(`Update employee error: ${error.message}`);
      }

      return data;
    } catch (error) {
      throw new Error(`Update employee error: ${error.message}`);
    }
  }

  // Soft delete: mark is_active = false and set removed_at
  static async softDeleteEmployee(id) {
    try {
      if (!id) throw new Error("Employee id required");

      const { data, error } = await supabase
        .from("profiles_onboard")
        .update({ is_active: false, removed_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        throw new Error(`Delete employee error: ${error.message}`);
      }

      return data;
    } catch (error) {
      throw new Error(`Delete employee error: ${error.message}`);
    }
  }

  static async isReportingManager(managerId, dealerCreatorId) {
    const { data, error } = await supabase
      .from("profiles_onboard")
      .select("reporting_manager_id")
      .eq("id", dealerCreatorId)
      .single();

    if (error) return false;
    return data.reporting_manager_id === managerId;
  }
}

module.exports = UserModel;
