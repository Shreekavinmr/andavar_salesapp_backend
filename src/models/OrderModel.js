const supabase = require('../config/supabase');
const logger = require('../utils/logger');
const DealerModel = require('./dealerModel');

const isValidUUID = (str) => {
  if (!str) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str.toString());
};

class OrderModel {
  /**
   * Create order and lines in a transaction-like manner.
   */
  static async createOrder(payload) {
    const {
      dealer_id,
      placed_on = null,
      created_by,
      notes = null,
      total_amount = 0,
      order_lines = [],
      status = 'placed',
    } = payload;

    // Validate UUIDs before insert
    if (!isValidUUID(dealer_id)) throw new Error('Invalid dealer_id UUID');
    if (!isValidUUID(created_by)) throw new Error('Invalid created_by UUID');
    if (placed_on && !isValidUUID(placed_on)) throw new Error('Invalid placed_on UUID');

    // Insert order
    const { data: order, error: ordErr } = await supabase
      .from('orders')
      .insert({
        dealer_id,
        placed_on,
        created_by,
        status,
        total_amount,
        notes,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (ordErr) {
      logger.error('OrderModel.createOrder - insert order error', ordErr);
      throw new Error(ordErr.message);
    }

    // insert lines (if any)
    if (Array.isArray(order_lines) && order_lines.length > 0) {
      // normalize lines to include order_id and created_at
      const rows = order_lines.map(l => ({
        order_id: order.id,
        product_id: l.product_id || null,
        product_name: l.product_name || '',
        quantity: Number(l.quantity) || 1,
        case_type: l.case_type || null,
        unit_price: l.unit_price == null ? null : parseFloat(l.unit_price),
        amount: parseFloat(l.amount || 0),
        created_at: new Date().toISOString()
      }));

      const { error: linesErr } = await supabase
        .from('order_lines')
        .insert(rows);

      if (linesErr) {
        // Attempt to clean up inserted order (best-effort)
        logger.error('OrderModel.createOrder - insert lines error', linesErr);
        // try delete order
        try {
          await supabase.from('orders').delete().eq('id', order.id);
        } catch (e) { logger.error('Failed to rollback order after lines insert error', e.message); }
        throw new Error(linesErr.message);
      }
    }

    // Return created order with lines
    const { data: created, error: fetchErr } = await supabase
      .from('orders')
      .select(`
        *,
        order_lines:order_lines(*)
      `)
      .eq('id', order.id)
      .single();

    if (fetchErr) {
      logger.warn('OrderModel.createOrder - failed to fetch created order with lines', fetchErr);
      return order;
    }
    return created;
  }

  static async getOrderById(orderId) {
    if (!isValidUUID(orderId)) throw new Error('Invalid orderId UUID');
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_lines:order_lines(*),
        dealer:dealers!orders_dealer_id_fkey(id, name, phone,state, address, pincode),
        created_by_profile:profiles_onboard!orders_created_by_fkey(id, full_name, email, phone, role),
        placed_on_profile:profiles_onboard!orders_placed_on_fkey(id, full_name, email, phone, role)
      `)
      .eq('id', orderId)
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  static async updateOrderStatus(orderId, status, updaterId) {
    if (!isValidUUID(orderId)) throw new Error('Invalid orderId UUID');
    if (!isValidUUID(updaterId)) throw new Error('Invalid updaterId UUID');
    const payload = { status, updated_at: new Date().toISOString() };
    const { data, error } = await supabase
      .from('orders')
      .update(payload)
      .eq('id', orderId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  static async listOrders(filter = {}, options = {}, actorId) {
  if (!actorId) throw new Error('actorId required');

  const role = await DealerModel.getRoleName(actorId);

  let q = supabase
    .from('orders')
    .select(`
      *,
      order_lines:order_lines(*),
      dealer:dealers!orders_dealer_id_fkey(id, name, phone, state, address, pincode),
      created_by_profile:profiles_onboard!orders_created_by_fkey(id, full_name, email, phone, role),
      placed_on_profile:profiles_onboard!orders_placed_on_fkey(id, full_name, email, phone, role)
    `, { count: 'exact' })
    .eq('is_active', true);

  // ---------------------------------------
  // 🔐 VISIBILITY RULES
  // ---------------------------------------

  if (!['gm', 'owner', 'admin'].includes(role)) {
    // Get downward hierarchy
    const reportees = await DealerModel.getAllReportees(actorId);

    // Only SOs (placed_on is always SO)
    const visibleUsers = [actorId, ...reportees];

    q = q.in('placed_on', visibleUsers);
  }

  // ---------------------------------------
  // Existing filters
  // ---------------------------------------
  if (filter.dealer_id) q = q.eq('dealer_id', filter.dealer_id);
  if (filter.status) q = q.eq('status', filter.status);
  if (filter.q) {
    const s = filter.q.toString();
    q = q.or(`notes.ilike.%${s}%`);
  }

  // ---------------------------------------
  // Pagination
  // ---------------------------------------
  const page = parseInt(options.page || 1, 10);
  const limit = Math.min(parseInt(options.limit || 50, 10), 500);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);

  return {
    rows: data || [],
    total: typeof count === 'number' ? count : (data?.length || 0),
    page,
    limit,
  };
}


  static async createApprovalRecord(orderId, approverId, action, comment = null) {
    if (!isValidUUID(orderId)) throw new Error('Invalid orderId UUID');
    if (!isValidUUID(approverId)) throw new Error('Invalid approverId UUID');
    const { data, error } = await supabase
      .from('order_approvals')
      .insert({
        order_id: orderId,
        approver_id: approverId,
        action,
        comment,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }
}

module.exports = OrderModel;