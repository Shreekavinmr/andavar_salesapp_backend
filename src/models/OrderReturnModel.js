// src/models/OrderReturnModel.js
const supabase = require('../config/supabase');
const logger = require('../utils/logger');
const DealerModel = require('./dealerModel');


const isValidUUID = (str) => {
  if (!str) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str.toString());
};

class OrderReturnModel {
  /**
   * Create a return request with items
   */
  static async createReturnRequest(payload) {
    const {
      order_id,
      dealer_id,
      return_type, // 'cashback' or 'replacement'
      reason,
      requested_by,
      return_items = [] // [{order_line_id, product_id, product_name, quantity_returned, unit_price, return_amount}]
    } = payload;

    // Validate
    if (!isValidUUID(order_id)) throw new Error('Invalid order_id');
    if (!isValidUUID(dealer_id)) throw new Error('Invalid dealer_id');
    if (!isValidUUID(requested_by)) throw new Error('Invalid requested_by');
    if (!['cashback', 'replacement'].includes(return_type)) {
      throw new Error('return_type must be cashback or replacement');
    }
    if (!Array.isArray(return_items) || return_items.length === 0) {
      throw new Error('return_items must be a non-empty array');
    }

    // Calculate total
    const total_return_amount = return_items.reduce((sum, item) => 
      sum + parseFloat(item.return_amount || 0), 0
    );

    // Insert return request
    const { data: request, error: reqError } = await supabase
      .from('order_return_requests')
      .insert({
        order_id,
        dealer_id,
        return_type,
        total_return_amount,
        reason: reason || null,
        status: 'pending',
        requested_by,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (reqError) {
      logger.error('OrderReturnModel.createReturnRequest - request insert error', reqError);
      throw new Error(reqError.message);
    }

    // Insert return items
    const itemsToInsert = return_items.map(item => ({
      return_request_id: request.id,
      order_line_id: item.order_line_id,
      product_id: item.product_id || null,
      product_name: item.product_name,
      quantity_returned: parseInt(item.quantity_returned),
      unit_price: item.unit_price ? parseFloat(item.unit_price) : null,
      return_amount: parseFloat(item.return_amount),
      created_at: new Date().toISOString()
    }));

    const { error: itemsError } = await supabase
      .from('order_return_items')
      .insert(itemsToInsert);

    if (itemsError) {
      logger.error('OrderReturnModel.createReturnRequest - items insert error', itemsError);
      // Rollback: delete request
      await supabase.from('order_return_requests').delete().eq('id', request.id);
      throw new Error(itemsError.message);
    }

    // Return full request with items
    return await this.getReturnRequestById(request.id);
  }

  /**
   * Get return request by ID with items
   */
  static async getReturnRequestById(requestId) {
    if (!isValidUUID(requestId)) throw new Error('Invalid requestId');

    const { data, error } = await supabase
      .from('order_return_requests')
      .select(`
        *,
        return_items:order_return_items(*),
        order:orders!order_return_requests_order_id_fkey(
          id, 
          status, 
          total_amount, 
          dealer_id,
          order_lines(*)
        ),
        dealer:dealers!order_return_requests_dealer_id_fkey(
          id, name, phone, address
        ),
        requester:profiles_onboard!order_return_requests_requested_by_fkey(
          id, full_name, email, role
        ),
        approver:profiles_onboard!order_return_requests_approved_by_fkey(
          id, full_name, email, role
        ),
        replacement_order:orders!order_return_requests_replacement_order_id_fkey(
          id, status, total_amount
        )
      `)
      .eq('id', requestId)
      .eq('is_active', true)
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * List return requests with filters
   */
  static async listReturnRequests(filter = {}, options = {}, actorId) {
  if (!actorId) throw new Error('actorId required');

  const role = await DealerModel.getRoleName(actorId);

  let query = supabase
    .from('order_return_requests')
    .select(`
      *,
      return_items:order_return_items(*),
      order:orders!order_return_requests_order_id_fkey(
        id,
        status,
        total_amount,
        placed_on,
        order_lines(*)
      ),
      dealer:dealers!order_return_requests_dealer_id_fkey(
        id, name, phone
      ),
      requester:profiles_onboard!order_return_requests_requested_by_fkey(
        id, full_name, role
      )
    `, { count: 'exact' })
    .eq('is_active', true);

  // ---------------------------------------
  // 🔐 HIERARCHY VISIBILITY
  // ---------------------------------------
  if (!['gm', 'owner', 'admin'].includes(role)) {
    const reportees = await DealerModel.getAllReportees(actorId);
    const visibleUsers = [actorId, ...reportees];

    // filter by order.placed_on (SO)
    query = query.in('order.placed_on', visibleUsers);
  }

  // ---------------------------------------
  // Existing filters
  // ---------------------------------------
  if (filter.order_id && isValidUUID(filter.order_id)) {
    query = query.eq('order_id', filter.order_id);
  }
  if (filter.dealer_id && isValidUUID(filter.dealer_id)) {
    query = query.eq('dealer_id', filter.dealer_id);
  }
  if (filter.status) {
    query = query.eq('status', filter.status);
  }
  if (filter.return_type) {
    query = query.eq('return_type', filter.return_type);
  }
  if (filter.requested_by && isValidUUID(filter.requested_by)) {
    query = query.eq('requested_by', filter.requested_by);
  }

  // ---------------------------------------
  // Pagination
  // ---------------------------------------
  const page = parseInt(options.page || 1, 10);
  const limit = Math.min(parseInt(options.limit || 50, 10), 100);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);

  return {
    requests: data || [],
    total: count || 0,
    page,
    limit,
  };
}


  /**
   * Approve return request
   */
  static async approveReturnRequest(requestId, approverId) {
    if (!isValidUUID(requestId)) throw new Error('Invalid requestId');
    if (!isValidUUID(approverId)) throw new Error('Invalid approverId');

    const { data, error } = await supabase
      .from('order_return_requests')
      .update({
        status: 'approved',
        approved_by: approverId,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', requestId)
      .eq('status', 'pending') // Only approve pending requests
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * Reject return request
   */
  static async rejectReturnRequest(requestId, approverId, rejectionReason = null) {
    if (!isValidUUID(requestId)) throw new Error('Invalid requestId');
    if (!isValidUUID(approverId)) throw new Error('Invalid approverId');

    const { data, error } = await supabase
      .from('order_return_requests')
      .update({
        status: 'rejected',
        approved_by: approverId,
        approved_at: new Date().toISOString(),
        rejection_reason: rejectionReason,
        updated_at: new Date().toISOString()
      })
      .eq('id', requestId)
      .eq('status', 'pending')
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * Link replacement order to return request
   */
  static async linkReplacementOrder(requestId, replacementOrderId) {
    if (!isValidUUID(requestId)) throw new Error('Invalid requestId');
    if (!isValidUUID(replacementOrderId)) throw new Error('Invalid replacementOrderId');

    const { data, error } = await supabase
      .from('order_return_requests')
      .update({
        replacement_order_id: replacementOrderId,
        updated_at: new Date().toISOString()
      })
      .eq('id', requestId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * Check if order has pending return requests
   */
  static async hasPendingReturns(orderId) {
    if (!isValidUUID(orderId)) return false;

    const { data, error } = await supabase
      .from('order_return_requests')
      .select('id')
      .eq('order_id', orderId)
      .eq('status', 'pending')
      .eq('is_active', true)
      .limit(1);

    if (error) return false;
    return data && data.length > 0;
  }
  static async getOrderReturnRequests(orderId) {
  if (!isValidUUID(orderId)) throw new Error('Invalid orderId');

  const { data, error } = await supabase
    .from('order_return_requests')
    .select('id, status, return_type, created_at')
    .eq('order_id', orderId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}
}

module.exports = OrderReturnModel;