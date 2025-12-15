// src/models/dealerModel.js
const supabase = require("../config/supabase");
const logger = require("../utils/logger");

class DealerModel {
  static async generateDealerCode() {
    const { data, error } = await supabase
      .from("dealers")
      .select("dealer_code")
      .order("dealer_code", { ascending: false })
      .limit(1);

    if (error) throw new Error(error.message);

    let n = 1;
    if (data && data.length > 0) {
      const last = data[0].dealer_code;
      n = parseInt(last.replace("DL", ""), 10) + 1;
    }

    return `DL${String(n).padStart(7, "0")}`;
  }

  // ---------------------------
  // Role / Hierarchy helpers
  // ---------------------------
  static async getRoleName(employeeId) {
    const { data, error } = await supabase
      .from("profiles_onboard")
      .select("role")
      .eq("id", employeeId)
      .single();

    if (error) throw new Error(error.message);
    if (!data || !data.role) return null;
    const roles = data.role.split(",").map((r) => r.trim().toLowerCase());
    return roles[0] || null;
  }

  static async getAllReportees(employeeId) {
    const reportees = [];
    const queue = [employeeId];

    while (queue.length > 0) {
      const currentId = queue.shift();

      const { data, error } = await supabase
        .from("profiles_onboard")
        .select("id")
        .eq("reporting_manager_id", currentId)
        .eq("is_active", true);

      if (error) throw new Error(error.message);

      if (data && data.length > 0) {
        const ids = data.map((e) => e.id);
        reportees.push(...ids);
        queue.push(...ids);
      }
    }

    return reportees;
  }

  static async getUpwardHierarchy(employeeId) {
    const managers = [];
    let currentId = employeeId;

    while (currentId) {
      const { data, error } = await supabase
        .from("profiles_onboard")
        .select("reporting_manager_id")
        .eq("id", currentId)
        .eq("is_active", true)
        .single();

      if (error || !data || !data.reporting_manager_id) break;

      managers.push(data.reporting_manager_id);
      currentId = data.reporting_manager_id;
    }

    return managers;
  }

  // ---------------------------
  // Dealer <-> SalesOfficer helpers
  // ---------------------------
  // Return array of dealer_id (UUID) assigned to a single sales officer
  static async getDealersAssignedTo(salesOfficerId) {
    const { data, error } = await supabase
      .from("dealer_sales_officers")
      .select("dealer_id")
      .eq("sales_officer_id", salesOfficerId);

    if (error) throw new Error(error.message);
    if (!data) return [];
    return data.map((r) => r.dealer_id);
  }

  // Return unique dealer IDs assigned to any of the salesOfficerIds
  static async getDealersAssignedToMany(salesOfficerIds = []) {
    if (!Array.isArray(salesOfficerIds) || salesOfficerIds.length === 0)
      return [];
    const { data, error } = await supabase
      .from("dealer_sales_officers")
      .select("dealer_id")
      .in("sales_officer_id", salesOfficerIds);

    if (error) throw new Error(error.message);
    if (!data) return [];
    return [...new Set(data.map((r) => r.dealer_id))];
  }

  // From a list of profile ids, return only those with role containing sales_officer
  static async getSalesOfficersFromIds(ids = []) {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const { data, error } = await supabase
      .from("profiles_onboard")
      .select("id, role")
      .in("id", ids);

    if (error) throw new Error(error.message);
    if (!data) return [];
    return data
      .filter(
        (p) =>
          p.role && p.role.toString().toLowerCase().includes("sales_officer")
      )
      .map((p) => p.id);
  }

  // Bulk assign sales officers to a dealer
  static async assignSalesOfficers(
    dealerId,
    salesOfficerIds = [],
    assignedBy = null
  ) {
    if (!dealerId) throw new Error("dealerId required");

    // Clean input
    const uniqueSoIds = [...new Set(salesOfficerIds.map((x) => x.toString()))];

    // 1) DELETE ALL existing SO assignments for this dealer
    const { error: delErr } = await supabase
      .from("dealer_sales_officers")
      .delete()
      .eq("dealer_id", dealerId);

    if (delErr) {
      logger.error("assignSalesOfficers - delete old SOs error", {
        message: delErr.message,
      });
      throw new Error(delErr.message);
    }

    // If new list is empty → just return empty
    if (uniqueSoIds.length === 0) return [];

    // 2) Insert new list (no duplicate issue now)
    const rowsToInsert = uniqueSoIds.map((soId) => ({
      dealer_id: dealerId,
      sales_officer_id: soId,
      assigned_at: new Date().toISOString(),
      assigned_by: assignedBy || null,
    }));

    const { error: insertErr } = await supabase
      .from("dealer_sales_officers")
      .insert(rowsToInsert);

    if (insertErr) {
      logger.error("assignSalesOfficers - insert error", {
        message: insertErr.message,
      });
      throw new Error(insertErr.message);
    }

    // 3) Fetch updated list with profile join
    const { data: finalList, error: finalErr } = await supabase
      .from("dealer_sales_officers")
      .select(
        `
      sales_officer_id,
      assigned_at,
      assigned_by,
      profile:profiles_onboard!dealer_sales_officers_sales_officer_id_fkey(id, full_name, email, role)
    `
      )
      .eq("dealer_id", dealerId);

    if (finalErr) {
      throw new Error(finalErr.message);
    }

    return finalList || [];
  }

  // Bulk unassign (delete) assignments for given dealer
  static async unassignSalesOfficers(dealerId, salesOfficerIds = []) {
    if (!Array.isArray(salesOfficerIds) || salesOfficerIds.length === 0)
      return [];
    const { data, error } = await supabase
      .from("dealer_sales_officers")
      .delete()
      .eq("dealer_id", dealerId)
      .in("sales_officer_id", salesOfficerIds);

    if (error) throw new Error(error.message);
    return data;
  }

  // Return sales officers visible to user (used by AdminService.getPossibleSOs)
  // This returns profiles_onboard rows for sales_officers under user's subtree (or all if admin/owner)
  static async getPossibleSOs(userId) {
    const roleName = await this.getRoleName(userId);
    if (!roleName) return [];

    // Admin/Owner: return all sales officers
    if (["admin", "owner", "gm"].includes(roleName)) {
      const { data, error } = await supabase
        .from("profiles_onboard")
        .select("id, full_name, email, role")
        .ilike("role", "%sales_officer%")
        .eq("is_active", true);

      if (error) throw new Error(error.message);
      return data || [];
    }

    // Otherwise: find reportees and filter those who are sales_officers
    const reportees = await this.getAllReportees(userId);
    const idsToCheck = [userId, ...reportees];
    const { data, error } = await supabase
      .from("profiles_onboard")
      .select("id, full_name, email, role")
      .in("id", idsToCheck)
      .eq("is_active", true);

    if (error) throw new Error(error.message);
    if (!data) return [];
    return data.filter(
      (p) => p.role && p.role.toString().toLowerCase().includes("sales_officer")
    );
  }

  // ---------------------------
  // Create / Read / Update / Delete dealers
  // ---------------------------
  static async createDealer(payload, creatorId) {
    try {
      // extract and remove sales_officers from payload (if provided)
      const soIds = Array.isArray(payload.sales_officers)
        ? payload.sales_officers.filter(Boolean)
        : [];
      const safePayload = { ...payload };
      delete safePayload.sales_officers;

      // generate dealer code if not provided
      const dealer_code =
        safePayload.dealer_code || (await this.generateDealerCode());

      const roleName = await this.getRoleName(creatorId);
      const needsApproval = await this.requiresApproval(creatorId);
      const status = needsApproval ? "pending" : "approved";

      const insertData = {
        ...safePayload,
        credit_limit:
          safePayload.credit_limit !== undefined
            ? parseFloat(safePayload.credit_limit)
            : undefined,
        dealer_code,
        created_by: creatorId,
        status,
        approved_at: needsApproval ? null : new Date().toISOString(),
        approved_by: needsApproval ? null : creatorId,
        created_at: new Date().toISOString(),
      };

      // Insert dealer
      const { data: dealer, error: insertErr } = await supabase
        .from("dealers")
        .insert(insertData)
        .select()
        .single();

      if (insertErr) throw new Error(insertErr.message);

      // If sales officers were provided, insert into dealer_sales_officers (replace semantics)
      if (soIds.length > 0) {
        // Build rows for insert
        const rows = soIds.map((soId) => ({
          dealer_id: dealer.id,
          sales_officer_id: soId,
          assigned_at: new Date().toISOString(),
          assigned_by: creatorId,
        }));

        // Remove any existing assignments for this dealer then insert new ones (replace)
        const { error: delErr } = await supabase
          .from("dealer_sales_officers")
          .delete()
          .eq("dealer_id", dealer.id);

        if (delErr) {
          // log but continue to try insert
          console.warn(
            "Failed to delete existing dealer_sales_officers rows",
            delErr
          );
        }

        const { error: insertSOErr } = await supabase
          .from("dealer_sales_officers")
          .insert(rows);

        if (insertSOErr) {
          // Not fatal for dealer creation but throw to let caller know
          throw new Error(
            `Failed to assign sales officers: ${insertSOErr.message}`
          );
        }
      }

      return dealer;
    } catch (err) {
      throw err;
    }
  }

  // Get dealers based on assignment visibility (updated)
  static async getDealers(options = {}, userId) {
    try {
      const roleName = await this.getRoleName(userId);

      // Build base select string with profile joins
      const selectStr = `
      *,
      created_by_profile:profiles_onboard!dealers_created_by_fkey(
        id, full_name, email, phone, role
      ),
      approved_by_profile:profiles_onboard!dealers_approved_by_fkey(
        id, full_name, email, phone, role
      )
    `;

      // base query
      let q = supabase
        .from("dealers")
        .select(selectStr, { count: "exact" })
        .eq("is_active", true);

      // --- Local helper functions used only in this function ---
      // returns array of dealer ids assigned to a single sales officer
      const getDealersAssignedTo = async (soId) => {
        if (!soId) return [];
        const { data, error } = await supabase
          .from("dealer_sales_officers")
          .select("dealer_id")
          .eq("sales_officer_id", soId);
        if (error) {
          logger.warn("getDealersAssignedTo supabase error", {
            soId,
            message: error.message,
          });
          return [];
        }
        return (data || []).map((r) => r.dealer_id).filter(Boolean);
      };

      // returns array of dealer ids assigned to any of the salesOfficerIds
      const getDealersAssignedToMany = async (soIds = []) => {
        if (!Array.isArray(soIds) || soIds.length === 0) return [];
        const { data, error } = await supabase
          .from("dealer_sales_officers")
          .select("dealer_id")
          .in("sales_officer_id", soIds);
        if (error) {
          logger.warn("getDealersAssignedToMany supabase error", {
            soIds,
            message: error.message,
          });
          return [];
        }
        // dedupe
        const ids = (data || []).map((r) => r.dealer_id).filter(Boolean);
        return [...new Set(ids)];
      };

      // filter the provided ids and return only those that are sales_officers (ids array)
      const getSalesOfficersFromIds = async (ids = []) => {
        if (!Array.isArray(ids) || ids.length === 0) return [];
        const { data, error } = await supabase
          .from("profiles_onboard")
          .select("id, role")
          .in("id", ids)
          .eq("is_active", true);

        if (error) {
          logger.warn("getSalesOfficersFromIds supabase error", {
            ids,
            message: error.message,
          });
          return [];
        }

        const sos = (data || [])
          .filter((p) => {
            const roleVal = (p.role || "").toString().toLowerCase();
            return roleVal.includes("sales_officer") || roleVal === "so";
          })
          .map((p) => p.id);

        return sos;
      };

      // --- Visibility rules ---
      if (["admin", "owner", "gm"].includes(roleName)) {
        // top-level: no extra filters (see all dealers)
        logger.debug(
          `getDealers: user ${userId} (${roleName}) sees all dealers`
        );
      } else if (
        roleName === "sales_officer" ||
        (roleName && roleName.includes("sales_officer"))
      ) {
        // sales officer: only dealers assigned to them
        const dealerIds = await getDealersAssignedTo(userId);
        if (dealerIds.length === 0) {
          // return empty early with consistent shape
          return { rows: [], total: 0 };
        }
        q = q.in("id", dealerIds);
      } else {
        // managers and other roles (ASM, RSM, etc.)
        // gather downward reportees (recursive)
        const reportees = await this.getAllReportees(userId); // returns array of ids
        const visibleCreators = [userId, ...reportees];

        // find who among visibleCreators are sales officers
        const possibleSOs = await getSalesOfficersFromIds(visibleCreators);

        // get dealers assigned to those sales officers
        const assignedDealerIds = await getDealersAssignedToMany(possibleSOs);

        // Compose visibility:
        // show dealers assigned to those sales officers OR dealers created by visibleCreators
        // If none of the sets exist, return empty set gracefully
        const hasAssigned =
          Array.isArray(assignedDealerIds) && assignedDealerIds.length > 0;
        const hasCreators =
          Array.isArray(visibleCreators) && visibleCreators.length > 0;

        if (!hasAssigned && !hasCreators) {
          return { rows: [], total: 0 };
        }

        // If both sets present use OR condition; otherwise use whichever exists.
        if (hasAssigned && hasCreators) {
          // .or string: id.in.(...) , created_by.in.(...)
          // build comma-joined lists (no quotes) - consistent with other parts of file
          const idsStr = assignedDealerIds.join(",");
          const creatorsStr = visibleCreators.join(",");
          q = q.or(`id.in.(${idsStr}),created_by.in.(${creatorsStr})`);
        } else if (hasAssigned) {
          q = q.in("id", assignedDealerIds);
        } else {
          // only creators
          q = q.in("created_by", visibleCreators);
        }
      }

      // status filter (after visibility)
      if (options.status) {
        q = q.eq("status", options.status);
      }

      // search (applied after visibility)
      if (options.q && options.q.toString().trim() !== "") {
        const s = options.q.toString().trim().toLowerCase();
        q = q.or(
          `name.ilike.%${s}%,dealer_code.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%`
        );
      }

      // pagination
      const page =
        parseInt(options.page, 10) >= 1 ? parseInt(options.page, 10) : 1;
      const limit = Math.min(parseInt(options.limit, 10) || 50, 200);
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      const { data, error, count } = await q
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) {
        logger.error("DealerModel.getDealers - supabase error", {
          message: error.message,
          details: error,
        });
        throw new Error(error.message);
      }

      // Map/flatten for convenience (same as previous mapping)
      const primaryRole = (roleVal) => {
        if (!roleVal) return "";
        try {
          const s = roleVal.toString();
          return (
            s
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean)[0] || ""
          );
        } catch (e) {
          return "";
        }
      };

      const rows = (Array.isArray(data) ? data : []).map((dealer) => {
        const createdProfile = dealer.created_by_profile || null;
        const approvedProfile = dealer.approved_by_profile || null;

        return {
          ...dealer,
          created_by_name:
            createdProfile?.full_name ?? dealer.created_by_name ?? null,
          created_by_email:
            createdProfile?.email ?? dealer.created_by_email ?? null,
          created_by_phone:
            createdProfile?.phone ?? dealer.created_by_phone ?? null,
          created_by_role:
            createdProfile?.role ?? dealer.created_by_role ?? null,
          created_by_primary_role:
            primaryRole(createdProfile?.role ?? dealer.created_by_role) || null,
          approved_by_name:
            approvedProfile?.full_name ?? dealer.approved_by_name ?? null,
          approved_by_role:
            approvedProfile?.role ?? dealer.approved_by_role ?? null,
          approved_by_email:
            approvedProfile?.email ?? dealer.approved_by_email ?? null,
          approved_by_phone:
            approvedProfile?.phone ?? dealer.approved_by_phone ?? null,
        };
      });

      return {
        rows,
        total: typeof count === "number" ? count : rows.length || 0,
      };
    } catch (error) {
      logger.error(`DealerModel.getDealers error: ${error.message}`, {
        stack: error.stack,
      });
      throw error;
    }
  }

  static async updateDealer(id, payload, userId) {
  // fetch dealer
  const dealer = await this.getDealerById(id);
  if (!dealer) throw new Error("Dealer not found");

  // actor role and admin check
  const userRole = await this.getRoleName(userId);
  const isAdminOrHigher = ["gm", "owner", "admin"].includes(userRole);

  // permission rules:
  // - If dealer is pending: only creator or admin-like can update
  // - If dealer is approved/active: admin-like can update anyone; others need to be in upward hierarchy or the creator
  if (dealer.status === "pending") {
    if (dealer.created_by !== userId && !isAdminOrHigher) {
      throw new Error("Not authorized to update pending dealer. Only creator or GM/Owner/Admin can update.");
    }
  } else {
    // For non-admin users enforce upward-hierarchy/creator restrictions
    if (!isAdminOrHigher) {
      if (dealer.created_by !== userId) {
        const upwardHierarchy = await this.getUpwardHierarchy(dealer.created_by);
        if (!upwardHierarchy.includes(userId)) {
          throw new Error("Not authorized to update this dealer");
        }
      }
    }
    // if isAdminOrHigher -> allowed to update freely
  }

  // --- handle sales_officers separately; extract rest of payload ---
  const newSalesOfficers = Array.isArray(payload.sales_officers) ? payload.sales_officers : null;
  const { sales_officers, ...rest } = payload;

  // credit_limit: only admins/GM/Owner may change it
  if (rest.credit_limit !== undefined) {
    if (!isAdminOrHigher) {
      throw new Error("Only GM/Owner/Admin can modify credit limit");
    }
    // coerce to numeric or null
    rest.credit_limit = rest.credit_limit === null ? null : parseFloat(rest.credit_limit);
  }

  // perform update
  const { data, error } = await supabase
    .from("dealers")
    .update({ ...rest, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  // If sales_officers provided, compute diff and apply changes
  if (newSalesOfficers !== null) {
    // fetch current assignments
    const current = await supabase
      .from("dealer_sales_officers")
      .select("sales_officer_id")
      .eq("dealer_id", id);

    if (current.error) logger.error(`Failed to fetch current assignments: ${current.error.message}`);
    const currentIds = (current.data || []).map((r) => r.sales_officer_id);

    const toAdd = newSalesOfficers.filter((x) => !currentIds.includes(x));
    const toRemove = currentIds.filter((x) => !newSalesOfficers.includes(x));

    if (toAdd.length > 0) {
      try {
        await this.assignSalesOfficers(id, toAdd, userId);
      } catch (e) {
        logger.error(`Failed to assign sales officers on update: ${e.message}`);
      }
    }

    if (toRemove.length > 0) {
      try {
        await this.unassignSalesOfficers(id, toRemove);
      } catch (e) {
        logger.error(`Failed to unassign sales officers on update: ${e.message}`);
      }
    }
  }

  return data;
}


  static async approveDealer(id, approverId) {
    const canApprove = await this.canApprove(id, approverId);

    if (!canApprove) {
      throw new Error(
        "Not authorized to approve this dealer. Only Owner or GM can approve."
      );
    }

    const { data, error } = await supabase
      .from("dealers")
      .update({
        status: "approved",
        approved_by: approverId,
        approved_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  static async getDealerById(id) {
    const { data, error } = await supabase
      .from("dealers")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  static async softDeleteDealer(id, userId) {
  const dealer = await this.getDealerById(id);
  if (!dealer) throw new Error("Dealer not found");

  const userRole = await this.getRoleName(userId);
  const isAdminOrHigher = ["gm", "owner", "admin"].includes(userRole);

  // pending: creator or admin-like
  if (dealer.status === 'pending') {
    if (dealer.created_by !== userId && !isAdminOrHigher) {
      throw new Error("Not authorized to delete pending dealer. Only creator or GM/Owner/Admin can delete.");
    }
  } else {
    // for non-admin users enforce upward hierarchy/creator rule
    if (!isAdminOrHigher) {
      if (dealer.created_by !== userId) {
        const upwardHierarchy = await this.getUpwardHierarchy(dealer.created_by);
        if (!upwardHierarchy.includes(userId)) {
          throw new Error("Not authorized to delete this dealer");
        }
      }
    }
    // admins bypass checks
  }

  const { data, error } = await supabase
    .from("dealers")
    .update({ is_active: false })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}


  static async getRoleName(employeeId) {
    const { data, error } = await supabase
      .from("profiles_onboard")
      .select("role")
      .eq("id", employeeId)
      .single();

    if (error) throw new Error(error.message);
    if (!data || !data.role) return null;

    // Role is comma-separated string, take first as primary
    const roles = data.role.split(",").map((r) => r.trim().toLowerCase());
    return roles[0] || null;
  }

  /**
   * Check if approval is required based on creator's role
   * GM and above (owner, admin) don't need approval
   */
  static async requiresApproval(creatorId) {
    const roleName = await this.getRoleName(creatorId);
    const noApprovalRoles = ["gm", "owner", "admin"];
    return !noApprovalRoles.includes(roleName);
  }

  /**
   * Check if an employee can approve a dealer
   * Only Owner or GM can approve (role-based, no hierarchy)
   */
  static async canApprove(dealerId, approverId) {
    const dealer = await this.getDealerById(dealerId);

    if (!dealer) throw new Error("Dealer not found");
    if (dealer.created_by === approverId) return false;
    if (dealer.status === "approved") return false;

    const approverRole = await this.getRoleName(approverId);
    return ["gm", "owner"].includes(approverRole);
  }
  static async getAssignedSOsForDealer(dealerId) {
    const { data, error } = await supabase
      .from("dealer_sales_officers")
      .select(
        `
      dealer_id,
      sales_officer_id,
      assigned_at,
      assigned_by,
      profile:profiles_onboard!dealer_sales_officers_sales_officer_id_fkey(id, full_name, email, role)
    `
      )
      .eq("dealer_id", dealerId);

    if (error) throw new Error(error.message);
    return data || [];
  }
  static async assignSOsToDealer(dealerId, soIds = [], assignedBy = null) {
    try {
      // delete existing
      const { error: delErr } = await supabase
        .from("dealer_sales_officers")
        .delete()
        .eq("dealer_id", dealerId);

      if (delErr) {
        // log and continue
        console.warn("assignSOsToDealer: delete existing error", delErr);
      }

      if (!Array.isArray(soIds) || soIds.length === 0) {
        return []; // nothing to insert
      }

      const rows = soIds.map((soId) => ({
        dealer_id: dealerId,
        sales_officer_id: soId,
        assigned_at: new Date().toISOString(),
        assigned_by: assignedBy,
      }));

      const { data, error: insertErr } = await supabase
        .from("dealer_sales_officers")
        .insert(rows);

      if (insertErr) throw new Error(insertErr.message);
      return data;
    } catch (err) {
      throw err;
    }
  }
  static async unassignSOsFromDealer(dealerId, soIds = []) {
    if (!Array.isArray(soIds) || soIds.length === 0) {
      return { deleted: 0 };
    }
    const { data, error } = await supabase
      .from("dealer_sales_officers")
      .delete()
      .eq("dealer_id", dealerId)
      .in("sales_officer_id", soIds);

    if (error) throw new Error(error.message);
    return data;
  }
  /**
   * Get dealer credit limit (numeric)
   * returns numeric value (0 if not set)
   */
  static async getDealerCreditLimit(dealerId) {
    if (!dealerId) return 0;
    const { data, error } = await supabase
      .from("dealers")
      .select("credit_limit")
      .eq("id", dealerId)
      .single();

    if (error) {
      // if not found return 0 (or rethrow if you prefer)
      logger.warn(`getDealerCreditLimit: ${error.message}`);
      return 0;
    }
    const v = data?.credit_limit;
    return v == null ? 0 : parseFloat(v);
  }

  static async isUserAssignedToDealer(userId, dealerId) {
    try {
      if (!userId || !dealerId) return false;

      // 1) Check common join table: dealer_sales_officers
      try {
        const { data: dsData, error: dsErr } = await supabase
          .from('dealer_sales_officers')
          .select('sales_officer_id')
          .eq('dealer_id', dealerId)
          .eq('sales_officer_id', userId)
          .limit(1);

        if (!dsErr && Array.isArray(dsData) && dsData.length > 0) {
          return true;
        }
      } catch (e) {
        // ignore and continue
      }

      // 2) Another common join table name: dealer_assignments
      try {
        const { data: daData, error: daErr } = await supabase
          .from('dealer_assignments')
          .select('user_id')
          .eq('dealer_id', dealerId)
          .eq('user_id', userId)
          .limit(1);

        if (!daErr && Array.isArray(daData) && daData.length > 0) {
          return true;
        }
      } catch (e) {
        // ignore
      }

      // 3) Check dealers table for an array/json column (assigned_sos OR sales_officers)
      try {
        // try selecting the dealer row and inspect likely columns
        const { data: dealerRows, error: dealerErr } = await supabase
          .from('dealers')
          .select('id, assigned_sos, sales_officers, assigned_sales_officers, sales_officer_id')
          .eq('id', dealerId)
          .limit(1)
          .single();

        if (!dealerErr && dealerRows) {
          const row = dealerRows;
          // helper to check various shapes
          const checkList = (val) => {
            if (val == null) return false;
            if (Array.isArray(val)) return val.map(String).includes(String(userId));
            if (typeof val === 'string') {
              // maybe comma separated ids
              if (val.includes(',')) {
                return val.split(',').map(s => s.trim()).includes(String(userId));
              }
              // single id in string
              return String(val) === String(userId);
            }
            if (typeof val === 'object') {
              // JSON object or array-like
              try {
                // convert to array of ids if possible
                if (Array.isArray(val)) return val.map(String).includes(String(userId));
                // object with id keys
                const vals = Object.values(val).map(String);
                return vals.includes(String(userId));
              } catch (e) {
                return false;
              }
            }
            return false;
          };

          if (checkList(row.assigned_sos) || checkList(row.sales_officers) || checkList(row.assigned_sales_officers)) {
            return true;
          }
          // also check single column
          if (row.sales_officer_id && String(row.sales_officer_id) === String(userId)) {
            return true;
          }
        }
      } catch (e) {
        // ignore
      }

      // 4) Fallback: check a payments/assignments view if exists
      try {
        const { data: viewData, error: viewErr } = await supabase
          .from('dealer_assigned_users_view')
          .select('user_id')
          .eq('dealer_id', dealerId)
          .eq('user_id', userId)
          .limit(1);

        if (!viewErr && Array.isArray(viewData) && viewData.length > 0) return true;
      } catch (e) {
        // ignore
      }

      // No evidence found
      return false;
    } catch (e) {
      logger.warn(`isUserAssignedToDealer fallback false for dealer:${dealerId} user:${userId} - ${e.message}`);
      return false;
    }
  }
}

module.exports = DealerModel;
