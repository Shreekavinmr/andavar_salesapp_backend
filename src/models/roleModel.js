const supabase = require('../config/supabase');

class RoleModel {
  static async getAllRoles() {
    try {
      const { data, error } = await supabase
        .from('roles_hierarchy')
        .select('id, name, level');

      if (error) {
        throw new Error(`Fetch roles error: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      throw new Error(`Role fetch error: ${error.message}`);
    }
  }

  // Place this method inside your RoleModel class
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

  static roleLevels = {
    admin: 0,
    owner: 1,
    gm: 2,
    asm: 3,
    rsm: 4,
    sales_officer: 5,
  };

  static getLevelForRole(role) {
    const r = (role || "").toLowerCase();
    return this.roleLevels[r];
  }
}

module.exports = RoleModel;