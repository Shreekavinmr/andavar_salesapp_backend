// ============================================
// UPDATED: src/services/dealerViewService.js
// Service for hierarchical dealer visibility (Approved: All visible; Pending: Downward hierarchy)
// ============================================

const supabase = require('../config/supabase');
const logger = require('../utils/logger');
const DealerModel = require('../models/dealerModel'); // ⬅️ add this



class DealerViewService {
  /**
   * Get primary role name for employee
   */
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

  /**
   * Get all reportees (recursive downward hierarchy)
   */
  static async getAllReportees(employeeId) {
    const reportees = [];
    const queue = [employeeId];
    const visited = new Set();

    while (queue.length > 0) {
      const currentId = queue.shift();
      
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      
      const { data, error } = await supabase
        .from("profiles_onboard")
        .select("id")
        .eq("reporting_manager_id", currentId)
        .eq("is_active", true);

      if (error) throw new Error(error.message);

      if (data && data.length > 0) {
        const ids = data.map(e => e.id);
        reportees.push(...ids);
        queue.push(...ids);
      }
    }

    return reportees;
  }
   
    /**
   * Get dealers list using assignment-based visibility
   * Rules are implemented in DealerModel.getDealers:
   * - Sales Officer: only dealers assigned to them
   * - ASM/RSM: dealers assigned to SOs in their hierarchy
   * - GM/Owner/Admin: all dealers
   */
  static async getDealersList(userId, options = {}) {
    try {
      // Normalize options to match DealerModel.getDealers signature
      const page = parseInt(options.page, 10) || 1;
      const limit = Math.min(parseInt(options.limit, 10) || 50, 200);

      const modelOptions = {
        page,
        limit,
        status: options.status,
        q: options.search || options.q,
      };

      logger.info(`DealerViewService.getDealersList -> calling DealerModel.getDealers for user=${userId}`, { modelOptions });

      const result = await DealerModel.getDealers(modelOptions, userId);
      const dealers = result.rows || [];
      const total = result.total || 0;

      logger.info(
        `DealerViewService.getDealersList - user=${userId} page=${page} limit=${limit} returned=${dealers.length} total=${total}`
      );
      if (dealers.length > 0) {
        logger.debug('DealerViewService.getDealersList sample dealer', {
          sample: dealers[0],
        });
      }

      return {
        success: true,
        dealers,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      logger.error(`DealerViewService.getDealersList error: ${error.message}`, {
        stack: error.stack,
      });
      throw error;
    }
  }


}

module.exports = DealerViewService;