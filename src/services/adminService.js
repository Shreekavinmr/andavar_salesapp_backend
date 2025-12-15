// ============================================
// FIXED AdminService.js - Reporting Manager Join Fixed
// ============================================

const UserModel = require('../models/userModel');
const RoleModel = require('../models/roleModel');
const DealerModel = require('../models/dealerModel');
const logger = require('../utils/logger');
const supabase = require('../config/supabase');

class AdminService {
  // Onboard/create employee
  static async onboardEmployee(employeeData) {
    try {
      const employee = await UserModel.createEmployee(employeeData);
      return { success: true, employee };
    } catch (error) {
      logger.error(`AdminService.onboardEmployee error: ${error.message}`);
      throw error;
    }
  }

  // Helper: Get user's role name
  static async getRoleName(employeeId) {
    const { data, error } = await supabase
      .from("profiles_onboard")
      .select("role")
      .eq("id", employeeId)
      .single();

    if (error) throw new Error(error.message);
    if (!data || !data.role) return null;

    const roles = data.role.split(',').map(r => r.trim().toLowerCase());
    return roles[0] || null;
  }

  // Helper: Get all reportees recursively (downward hierarchy)
  static async getAllReportees(managerId) {
    try {
      const reportees = [];
      const queue = [managerId];
      const visited = new Set([managerId]);

      while (queue.length > 0) {
        const currentId = queue.shift();
        
        // Get direct reports
        const { data, error } = await supabase
          .from("profiles_onboard")
          .select("id")
          .eq("reporting_manager_id", currentId)
          .eq("is_active", true);

        if (error) {
          logger.error(`Error fetching reportees for ${currentId}: ${error.message}`);
          continue;
        }

        if (data && data.length > 0) {
          for (const employee of data) {
            if (!visited.has(employee.id)) {
              visited.add(employee.id);
              reportees.push(employee.id);
              queue.push(employee.id);
            }
          }
        }
      }

      return reportees;
    } catch (error) {
      logger.error(`getAllReportees error: ${error.message}`);
      return [];
    }
  }

  // Get employees list with hierarchy filtering
  static async getEmployees(userId, options = {}) {
    try {
      const roleName = await this.getRoleName(userId);
      
      if (!roleName) {
        throw new Error("User role not found");
      }

      const page = parseInt(options.page, 10) || 1;
      const limit = Math.min(parseInt(options.limit, 10) || 50, 200);
      const offset = (page - 1) * limit;

      // STEP 1: Base query WITHOUT the problematic join - fetch employees first
      let baseQuery = supabase
        .from("profiles_onboard")
        .select(`
          id, 
          email, 
          full_name, 
          role, 
          phone, 
          employee_code, 
          office_id, 
          reporting_manager_id, 
          created_at, 
          is_active
        `, { count: "exact" });

      // Apply role-based visibility
      const isTopLevel = ['owner', 'gm', 'admin'].includes(roleName);
      
      if (isTopLevel) {
        // Owner/GM/Admin: See ALL employees
        logger.info(`Top-level user ${userId} (${roleName}) viewing all employees`);
      } else {
        // For others: Get visible reportees (downward hierarchy)
        const reportees = await this.getAllReportees(userId);
        const visibleEmployees = [userId, ...reportees];
        
        logger.info(`User ${userId} (${roleName}) can see ${visibleEmployees.length} employees (self + reportees)`);
        
        // Show employees where they report to someone in the subtree OR they are the user
        if (visibleEmployees.length > 1) {
          baseQuery = baseQuery.or(`reporting_manager_id.in.(${visibleEmployees.join(',')}),id.eq.${userId}`);
        } else {
          baseQuery = baseQuery.eq("id", userId);
        }
      }

      // Apply filters
      if (options.office_id) {
        baseQuery = baseQuery.eq("office_id", options.office_id);
      }

      if (options.role && typeof options.role === "string") {
        baseQuery = baseQuery.ilike("role", `%${options.role}%`);
      }

      // Search query
      if (options.q && options.q.toString().trim() !== "") {
        const q = options.q.toString().trim();
        const orClauses = [
          `full_name.ilike.%${q}%`,
          `email.ilike.%${q}%`,
          `employee_code.ilike.%${q}%`,
        ].join(",");
        baseQuery = baseQuery.or(orClauses);
      }

      // Active filter
      if (typeof options.is_active !== "undefined") {
        baseQuery = baseQuery.eq("is_active", options.is_active);
      } else {
        baseQuery = baseQuery.eq("is_active", true);
      }

      // Order and paginate
      baseQuery = baseQuery
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      const { data: employees, error, count } = await baseQuery;

      if (error) {
        throw new Error(`Get employees error: ${error.message}`);
      }

      // STEP 2: Fetch reporting manager details separately for each employee
      if (employees && employees.length > 0) {
        // Get unique manager IDs
        const managerIds = [...new Set(
          employees
            .map(e => e.reporting_manager_id)
            .filter(id => id != null)
        )];

        // Fetch all managers in one query
        let managersMap = {};
        if (managerIds.length > 0) {
          const { data: managers, error: managerError } = await supabase
            .from("profiles_onboard")
            .select("id, full_name, role, email")
            .in("id", managerIds);

          if (!managerError && managers) {
            // Create a map for quick lookup
            managersMap = managers.reduce((acc, manager) => {
              acc[manager.id] = manager;
              return acc;
            }, {});
          } else {
            logger.warn(`Failed to fetch managers: ${managerError?.message}`);
          }
        }

        // STEP 3: Attach manager details to each employee
        employees.forEach(employee => {
          if (employee.reporting_manager_id && managersMap[employee.reporting_manager_id]) {
            employee.reporting_manager = managersMap[employee.reporting_manager_id];
          } else {
            employee.reporting_manager = null;
          }
        });
      }

      const total = typeof count === "number" ? count : (employees ? employees.length : 0);
      
      // Return consistent structure
      return { 
        success: true,
        employees: employees || [], 
        total,
        page,
        limit
      };
    } catch (error) {
      logger.error(`Get employees error: ${error.message}`);
      throw new Error(`Get employees error: ${error.message}`);
    }
  }

  // Get possible managers for a selected role
  static async getPossibleManagers(selectedRole) {
    try {
      console.log('🔍 AdminService: Checking UserModel.getPossibleManagers:', typeof UserModel?.getPossibleManagers);
      
      if (typeof UserModel?.getPossibleManagers === 'function') {
        console.log('✅ Taking UserModel path for role:', selectedRole);
        const managersResult = await UserModel.getPossibleManagers(selectedRole);
        console.log('✅ UserModel returned:', managersResult?.managers?.length || 0, 'managers');
        return { success: true, managers: managersResult?.managers || [] };
      }
      
      console.log('❌ Falling back to RoleModel path for role:', selectedRole);
      const rolesResponse = await RoleModel.getPossibleManagers(selectedRole);
      console.log('🔍 RoleModel raw response type:', typeof rolesResponse, 'isArray:', Array.isArray(rolesResponse));

      let roles = [];
      if (Array.isArray(rolesResponse)) {
        roles = rolesResponse;
      } else if (rolesResponse?.data && Array.isArray(rolesResponse.data)) {
        roles = rolesResponse.data;
      } else if (rolesResponse?.rows && Array.isArray(rolesResponse.rows)) {
        roles = rolesResponse.rows;
      } else if (rolesResponse?.error) {
        console.error('RoleModel error:', rolesResponse.error);
        throw new Error(`RoleModel failed: ${rolesResponse.error.message}`);
      }

      roles = roles.filter(Boolean);
      const roleNames = roles.map(r => r.name).filter(Boolean);
      console.log('🔍 Extracted roleNames:', roleNames);
      
      if (roleNames.length === 0) {
        return { success: true, managers: [] };
      }

      const managers = await UserModel.getEmployees({ roles: roleNames });
      console.log('✅ Fallback got', managers?.length || 0, 'managers');
      return { success: true, managers };
    } catch (error) {
      logger.error(`AdminService.getPossibleManagers error: ${error.message}`);
      throw error;
    }
  }

  // Get all roles
  static async getRoles() {
    try {
      const roles = await RoleModel.getAllRoles();
      return { success: true, roles };
    } catch (error) {
      logger.error(`AdminService.getRoles error: ${error.message}`);
      throw error;
    }
  }

  // Update employee
  static async updateEmployee(id, payload) {
    try {
      const updated = await UserModel.updateEmployee(id, payload);
      
      // Fetch reporting manager details if present
      if (updated && updated.reporting_manager_id) {
        const { data: manager, error: managerError } = await supabase
          .from("profiles_onboard")
          .select("id, full_name, role, email")
          .eq("id", updated.reporting_manager_id)
          .single();
        
        if (!managerError && manager) {
          updated.reporting_manager = manager;
        }
      }
      
      return { success: true, employee: updated };
    } catch (error) {
      logger.error(`AdminService.updateEmployee error: ${error.message}`);
      throw error;
    }
  }

  // Soft-delete employee
  static async deleteEmployee(id) {
    try {
      const result = await UserModel.softDeleteEmployee(id);
      return { success: true, result };
    } catch (error) {
      logger.error(`AdminService.deleteEmployee error: ${error.message}`);
      throw error;
    }
  }

  // ===== DEALER OPERATIONS =====

  static async createDealer(payload, creator) {
    try {
      const dealer = await DealerModel.createDealer(payload, creator.id);
      return { success: true, dealer };
    } catch (error) {
      logger.error(`AdminService.createDealer error: ${error.message}`);
      throw error;
    }
  }

  static async getDealers(options = {}, user) {
    try {
      const result = await DealerModel.getDealers(options, user.id);
      return { 
        success: true, 
        dealers: result.rows, 
        rows: result.rows,
        total: result.total,
        page: options.page || 1,
        limit: options.limit || 50
      };
    } catch (error) {
      logger.error(`AdminService.getDealers error: ${error.message}`);
      throw error;
    }
  }

  static async updateDealer(id, payload, user) {
    try {
      const dealer = await DealerModel.updateDealer(id, payload, user.id);
      return { success: true, dealer };
    } catch (error) {
      logger.error(`AdminService.updateDealer error: ${error.message}`);
      throw error;
    }
  }

  static async approveDealer(id, approver) {
    try {
      const canApprove = await DealerModel.canApprove(id, approver.id);
      
      if (!canApprove) {
        throw new Error("Not authorized to approve this dealer. Only upward hierarchy can approve.");
      }

      const dealer = await DealerModel.approveDealer(id, approver.id);
      return { success: true, dealer };
    } catch (error) {
      logger.error(`AdminService.approveDealer error: ${error.message}`);
      throw error;
    }
  }

  static async deleteDealer(id, user) {
    try {
      const result = await DealerModel.softDeleteDealer(id, user.id);
      return { success: true, result };
    } catch (error) {
      logger.error(`AdminService.deleteDealer error: ${error.message}`);
      throw error;
    }
  }

  static async getPossibleSOs(userId) {
    try {
      const salesOfficers = await DealerModel.getPossibleSOs(userId);
      return { success: true, sales_officers: salesOfficers };
    } catch (error) {
      logger.error(`AdminService.getPossibleSOs error: ${error.message}`);
      throw error;
    }
  }

  // Add to AdminService class (src/services/adminService.js)

  /**
   * Assign sales officers to a dealer
   * payload: { sales_officers: [<uuid>, ...] }
   */
  static async assignSalesOfficersToDealer(dealerId, payload, performedBy) {
    try {
      // basic validation
      if (!Array.isArray(payload.sales_officers) || payload.sales_officers.length === 0) {
        throw new Error('sales_officers array required');
      }

      // authorize: allow admins/owners/gm, or upward hierarchy (creator's managers)
      const actorRole = await this.getRoleName(performedBy.id || performedBy);
      if (!actorRole) throw new Error('Actor role not found');

      const isAdmin = ['admin', 'owner', 'gm'].includes(actorRole);

      // allow if admin-like
      if (!isAdmin) {
        // require that performedBy is upward of dealer.creator OR performedBy is manager of any provided SO
        const dealer = await DealerModel.getDealerById(dealerId);
        if (!dealer) throw new Error('Dealer not found');

        // if actor is creator, allow
        if (dealer.created_by === (performedBy.id || performedBy)) {
          // ok
        } else {
          // else require actor to be upward of dealer.created_by OR be manager (upward) for provided SOs
          const upward = await DealerModel.getUpwardHierarchy(dealer.created_by);
          if (!upward.includes(performedBy.id || performedBy)) {
            // as fallback, check whether performedBy manages any of provided SOs
            const reportees = await DealerModel.getAllReportees(performedBy.id || performedBy);
            const intersects = payload.sales_officers.some(so => reportees.includes(so));
            if (!intersects) throw new Error('Not authorized to assign these sales officers');
          }
        }
      }

      // perform assignment (will ignore duplicates due to PK)
      await DealerModel.assignSalesOfficers(dealerId, payload.sales_officers, performedBy.id || performedBy);

      return { success: true };
    } catch (error) {
      logger.error(`AdminService.assignSalesOfficersToDealer error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Unassign (remove) sales officers from a dealer
   * payload: { sales_officers: [<uuid>, ...] }
   */
  static async unassignSalesOfficersFromDealer(dealerId, payload, performedBy) {
    try {
      if (!Array.isArray(payload.sales_officers) || payload.sales_officers.length === 0) {
        throw new Error('sales_officers array required');
      }

      const actorRole = await this.getRoleName(performedBy.id || performedBy);
      const isAdmin = ['admin', 'owner', 'gm'].includes(actorRole);

      if (!isAdmin) {
        // similar checks as assign
        const dealer = await DealerModel.getDealerById(dealerId);
        if (!dealer) throw new Error('Dealer not found');

        if (dealer.created_by === (performedBy.id || performedBy)) {
          // ok
        } else {
          const upward = await DealerModel.getUpwardHierarchy(dealer.created_by);
          if (!upward.includes(performedBy.id || performedBy)) {
            const reportees = await DealerModel.getAllReportees(performedBy.id || performedBy);
            const intersects = payload.sales_officers.some(so => reportees.includes(so));
            if (!intersects) throw new Error('Not authorized to unassign these sales officers');
          }
        }
      }

      await DealerModel.unassignSalesOfficers(dealerId, payload.sales_officers);
      return { success: true };
    } catch (error) {
      logger.error(`AdminService.unassignSalesOfficersFromDealer error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get assigned sales officers for a dealer
   */
  static async getAssignedSOsForDealer(dealerId, user) {
    try {
      // permission: allow owner/admin/gm, or if user is in upward chain or manager of assigned SOs
      const actorRole = await this.getRoleName(user.id || user);
      if (!actorRole) throw new Error('Actor role not found');

      const isAdmin = ['admin', 'owner', 'gm'].includes(actorRole);
      const dealer = await DealerModel.getDealerById(dealerId);
      if (!dealer) throw new Error('Dealer not found');

      if (!isAdmin) {
        // allow if user is creator or upward hierarchy
        if (dealer.created_by !== (user.id || user)) {
          const upward = await DealerModel.getUpwardHierarchy(dealer.created_by);
          if (!upward.includes(user.id || user)) {
            // or if user manages any assigned SO
            // we'll still return, but you can add further restrictions as needed
          }
        }
      }

      // fetch assignments
      const { data, error } = await supabase
        .from('dealer_sales_officers')
        .select('sales_officer_id, assigned_at, assigned_by')
        .eq('dealer_id', dealerId);

      if (error) throw new Error(error.message);

      // expand to profile info
      const soIds = (data || []).map(r => r.sales_officer_id);
      let results = [];
      if (soIds.length > 0) {
        const { data: profiles, error: pErr } = await supabase
          .from('profiles_onboard')
          .select('id, full_name, email, phone, role')
          .in('id', soIds);

        if (pErr) throw new Error(pErr.message);

        const profilesMap = (profiles || []).reduce((acc, p) => {
          acc[p.id] = p;
          return acc;
        }, {});

        results = (data || []).map(r => ({
          sales_officer_id: r.sales_officer_id,
          assigned_at: r.assigned_at,
          assigned_by: r.assigned_by,
          profile: profilesMap[r.sales_officer_id] || null
        }));
      }

      return { success: true, sales_officers: results };
    } catch (error) {
      logger.error(`AdminService.getAssignedSOsForDealer error: ${error.message}`);
      throw error;
    }
  }

  // src/services/adminService.js (inside AdminService)

static async getAssignedSOs(dealerId) {
  try {
    const data = await DealerModel.getAssignedSOsForDealer(dealerId);
    return { success: true, sales_officers: data };
  } catch (err) {
    logger.error(`getAssignedSOs error: ${err.message}`);
    throw err;
  }
}

static async assignSOs(dealerId, soIds = [], assignedByUser) {
  try {
    const data = await DealerModel.assignSOsToDealer(dealerId, soIds, assignedByUser?.id || null);
    return { success: true, assigned: data };
  } catch (err) {
    logger.error(`assignSOs error: ${err.message}`);
    throw err;
  }
}

static async unassignSOs(dealerId, soIds = []) {
  try {
    const data = await DealerModel.unassignSOsFromDealer(dealerId, soIds);
    return { success: true, unassigned: data };
  } catch (err) {
    logger.error(`unassignSOs error: ${err.message}`);
    throw err;
  }
}


}

module.exports = AdminService;