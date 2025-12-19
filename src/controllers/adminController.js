// src/controllers/adminController.js (FIXED - Pass userId to service)
const AdminService = require('../services/adminService');
const { sendResponse } = require('../utils/responseHandler');
const logger = require('../utils/logger');

class AdminController {
  // ==============================
  // Onboard Employee
  // ==============================
  static async onboard(req, res) {
    try {
      const employeeData = req.body;
      const result = await AdminService.onboardEmployee(employeeData);
      sendResponse(res, 201, 'Employee onboarded successfully', result.employee);
    } catch (error) {
      logger.error(`Admin controller onboard error: ${error.message}`);
      sendResponse(res, 400, error.message);
    }
  }

  // ==============================
  // Get Employees List (FIXED)
  // ==============================
  static async getEmployees(req, res) {
    try {
      const { role, office_id, q } = req.query;
      const page = parseInt(req.query.page, 10) || 1;
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);

      const options = { role, office_id, q, page, limit };

      // Pass the authenticated user's ID to service
      const userId = req.user.id;
      const result = await AdminService.getEmployees(userId, options);
      
      // Service now returns: { success, employees, total, page, limit }
      sendResponse(res, 200, 'Employees fetched successfully', result);
    } catch (error) {
      logger.error(`Admin controller get employees error: ${error.message}`);
      sendResponse(res, 500, error.message);
    }
  }

  // ==============================
  // Get Possible Managers
  // ==============================
  static async getPossibleManagers(req, res) {
    try {
      const { role } = req.query;
      console.log('📥 getPossibleManagers called with role:', role);
      if (!role) {
        return sendResponse(res, 400, 'Role parameter required');
      }
      const result = await AdminService.getPossibleManagers(role);
      if (!result.success) {
        return sendResponse(res, 500, 'Failed to fetch managers');
      }
      const managers = Array.isArray(result.managers) ? result.managers : [];
      console.log('📥 getPossibleManagers returned:', managers.length, 'managers');
      sendResponse(res, 200, 'Managers fetched successfully', managers);
    } catch (error) {
      logger.error(`Admin controller get managers error: ${error.message}`);
      sendResponse(res, 500, error.message);
    }
  }

  // ==============================
  // Get All Roles
  // ==============================
  static async getRoles(req, res) {
    try {
      const result = await AdminService.getRoles();
      sendResponse(res, 200, 'Roles fetched successfully', result.roles);
    } catch (error) {
      logger.error(`Admin controller get roles error: ${error.message}`);
      sendResponse(res, 500, error.message);
    }
  }

  // ==============================
  // UPDATE Employee (PUT)
  // ==============================
  static async updateEmployee(req, res) {
    try {
      const id = req.params.id;
      const updateData = req.body;

      const result = await AdminService.updateEmployee(id, updateData);

      sendResponse(res, 200, 'Employee updated successfully', result.employee);
    } catch (error) {
      logger.error(`Admin controller update employee error: ${error.message}`);
      sendResponse(res, 400, error.message);
    }
  }

  // ==============================
  // DELETE Employee (Soft Delete)
  // ==============================
  static async deleteEmployee(req, res) {
    try {
      const id = req.params.id;

      const result = await AdminService.deleteEmployee(id);

      sendResponse(res, 200, 'Employee deleted successfully', result);
    } catch (error) {
      logger.error(`Admin controller delete employee error: ${error.message}`);
      sendResponse(res, 400, error.message);
    }
  }

  static async createDealer(req, res) {
    try {
      const result = await AdminService.createDealer(req.body, req.user);
      sendResponse(res, 201, "Dealer created", result.dealer);
    } catch (e) {
      logger.error(`Create dealer error: ${e.message}`);
      sendResponse(res, 400, e.message);
    }
  }

  static async getDealers(req, res) {
    try {
      const result = await AdminService.getDealers(req.query, req.user);
      sendResponse(res, 200, "Dealers fetched", result);
    } catch (e) {
      logger.error(`Get dealers error: ${e.message}`);
      sendResponse(res, 400, e.message);
    }
  }

  static async updateDealer(req, res) {
    try {
      const result = await AdminService.updateDealer(req.params.id, req.body, req.user);
      sendResponse(res, 200, "Dealer updated", result.dealer);
    } catch (e) {
      logger.error(`Update dealer error: ${e.message}`);
      sendResponse(res, 400, e.message);
    }
  }

  static async approveDealer(req, res) {
    try {
      const result = await AdminService.approveDealer(req.params.id, req.user);
      sendResponse(res, 200, "Dealer approved", result.dealer);
    } catch (e) {
      logger.error(`Approve dealer error: ${e.message}`);
      sendResponse(res, 400, e.message);
    }
  }

  static async deleteDealer(req, res) {
    try {
      const result = await AdminService.deleteDealer(req.params.id, req.user);
      sendResponse(res, 200, "Dealer deleted", result);
    } catch (e) {
      logger.error(`Delete dealer error: ${e.message}`);
      sendResponse(res, 400, e.message);
    }
  }

  static async getPossibleSOs(req, res) {
    try {
      const result = await AdminService.getPossibleSOs(req.user.id);
      sendResponse(res, 200, "Sales officers fetched", result.sales_officers);
    } catch (e) {
      logger.error(`Get SOs error: ${e.message}`);
      sendResponse(res, 400, e.message);
    }
  }

  // Add to AdminController class

  // POST /admin/dealers/:id/assign-sos
  static async assignSalesOfficers(req, res) {
    try {
      const dealerId = req.params.id;
      const payload = req.body; // { sales_officers: [...] }
      const performedBy = req.user;
      const result = await AdminService.assignSalesOfficersToDealer(dealerId, payload, performedBy);
      sendResponse(res, 200, 'Sales officers assigned', result);
    } catch (e) {
      logger.error(`Assign SOs error: ${e.message}`);
      sendResponse(res, 400, e.message);
    }
  }

  // DELETE /admin/dealers/:id/assign-sos
  static async unassignSalesOfficers(req, res) {
    try {
      const dealerId = req.params.id;
      const payload = req.body; // { sales_officers: [...] }
      const performedBy = req.user;
      const result = await AdminService.unassignSalesOfficersFromDealer(dealerId, payload, performedBy);
      sendResponse(res, 200, 'Sales officers unassigned', result);
    } catch (e) {
      logger.error(`Unassign SOs error: ${e.message}`);
      sendResponse(res, 400, e.message);
    }
  }

  // GET /admin/dealers/:id/sos
  static async getAssignedSOs(req, res) {
    try {
      const dealerId = req.params.id;
      const user = req.user;
      const result = await AdminService.getAssignedSOsForDealer(dealerId, user);
      sendResponse(res, 200, 'Assigned sales officers', result.sales_officers);
    } catch (e) {
      logger.error(`Get assigned SOs error: ${e.message}`);
      sendResponse(res, 400, e.message);
    }
  }
  // near other dealer endpoints in AdminController

static async getDealerSOs(req, res) {
  try {
    const dealerId = req.params.dealerId;
    const result = await AdminService.getAssignedSOs(dealerId);
    sendResponse(res, 200, 'Sales officers fetched', result.sales_officers);
  } catch (e) {
    logger.error(`Get dealer SOs error: ${e.message}`);
    sendResponse(res, 400, e.message);
  }
}

static async assignDealerSOs(req, res) {
  try {
    const dealerId = req.params.dealerId;
    const soIds = Array.isArray(req.body.sales_officers) ? req.body.sales_officers : [];
    const result = await AdminService.assignSOs(dealerId, soIds, req.user);
    sendResponse(res, 200, 'Sales officers assigned', result.assigned);
  } catch (e) {
    logger.error(`Assign SOs error: ${e.message}`);
    sendResponse(res, 400, e.message);
  }
}

static async unassignDealerSOs(req, res) {
  try {
    const dealerId = req.params.dealerId;
    const soIds = Array.isArray(req.body.sales_officers) ? req.body.sales_officers : [];
    const result = await AdminService.unassignSOs(dealerId, soIds);
    sendResponse(res, 200, 'Sales officers unassigned', result.unassigned);
  } catch (e) {
    logger.error(`Unassign SOs error: ${e.message}`);
    sendResponse(res, 400, e.message);
  }
}

static async getMyReportees(req, res) {
  try {
    const reporteeIds = await AdminService.getAllReportees(req.user.id);

    const { data, error } = await supabase
      .from('profiles_onboard')
      .select('id, full_name, employee_code')
      .in('id', reporteeIds)
      .eq('is_active', true);

    if (error) throw new Error(error.message);

    sendResponse(res, 200, 'Reportees fetched', data);
  } catch (e) {
    logger.error(`getMyReportees error: ${e.message}`);
    sendResponse(res, 400, e.message);
  }
}



}

module.exports = AdminController;