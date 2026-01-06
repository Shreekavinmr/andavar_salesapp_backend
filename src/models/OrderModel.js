const supabase = require('../config/supabase');
const logger = require('../utils/logger');
const DealerModel = require('./dealerModel');

const isValidUUID = (str) => {
  if (!str) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str.toString());
};

class OrderModel {
  /**
   * Determine product type from order lines
   * Returns: 'water', 'juice', or 'mixed'
   */
  static async determineProductType(orderLines) {
    if (!Array.isArray(orderLines) || orderLines.length === 0) {
      return 'mixed'; // default fallback
    }

    // Get product IDs from order lines
    const productIds = orderLines
      .map(line => line.product_id)
      .filter(Boolean);

    if (productIds.length === 0) return 'mixed';

    // Fetch product types for all products in order
    const { data: products, error } = await supabase
      .from('products')
      .select('id, type_id, product_types(name)')
      .in('id', productIds);

    if (error || !products || products.length === 0) {
      logger.warn('determineProductType: Could not fetch products', error);
      return 'mixed';
    }

    // Extract type names
    const types = products
      .map(p => p.product_types?.name?.toLowerCase())
      .filter(Boolean);

    if (types.length === 0) return 'mixed';

    // Check if all same type
    const uniqueTypes = [...new Set(types)];
    
    if (uniqueTypes.length === 1) {
      return uniqueTypes[0]; // 'water' or 'juice'
    }

    return 'mixed'; // Multiple types in one order
  }

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
      status = 'draft',
      approved_by = null,
    } = payload;

    // Validate UUIDs before insert
    if (!isValidUUID(dealer_id)) throw new Error('Invalid dealer_id UUID');
  if (!isValidUUID(created_by)) throw new Error('Invalid created_by UUID');
  if (placed_on && !isValidUUID(placed_on)) throw new Error('Invalid placed_on UUID');
  if (approved_by && !isValidUUID(approved_by)) throw new Error('Invalid approved_by UUID');

    // Determine product type from order lines
    const product_type = await this.determineProductType(order_lines);

    // Insert order with product_type
    const { data: order, error: ordErr } = await supabase
      .from('orders')
      .insert({
        dealer_id,
        placed_on,
        created_by,
        status,
        total_amount,
        notes,
        product_type, // NEW: Add product type
        approved_by,
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

  static async updateOrderStatus(orderId, status, updaterId, approvedBy = null) {
    if (!isValidUUID(orderId)) throw new Error('Invalid orderId UUID');
    if (!isValidUUID(updaterId)) throw new Error('Invalid updaterId UUID');
    const payload = { status, updated_at: new Date().toISOString() };
    if (approvedBy && isValidUUID(approvedBy)) {
    payload.approved_by = approvedBy;
  }

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
        placed_on_profile:profiles_onboard!orders_placed_on_fkey(id, full_name, email, phone, role),
        approved_by_profile:profiles_onboard!orders_approved_by_fkey(id, full_name, email, phone, role)
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

      q = q.or(`and(status.eq.draft,created_by.in.(${visibleUsers.join(',')})),and(status.neq.draft,placed_on.in.(${visibleUsers.join(',')}))`);
    }

    // ---------------------------------------
    // NEW: Product Type Filter (water/juice/mixed)
    // ---------------------------------------
    if (filter.product_type) {
      const validTypes = ['water', 'juice', 'mixed'];
      const typeFilter = filter.product_type.toLowerCase();
      
      if (validTypes.includes(typeFilter)) {
        q = q.eq('product_type', typeFilter);
      }
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

  /**
   * Get order statistics by product type
   */
  static async getOrderStatsByType(actorId, filter = {}) {
    if (!actorId) throw new Error('actorId required');

    const role = await DealerModel.getRoleName(actorId);

    let q = supabase
      .from('orders')
      .select('product_type, status, total_amount', { count: 'exact' })
      .eq('is_active', true);

    // Apply same visibility rules
    if (!['gm', 'owner', 'admin'].includes(role)) {
      const reportees = await DealerModel.getAllReportees(actorId);
      const visibleUsers = [actorId, ...reportees];
      q = q.in('placed_on', visibleUsers);
    }

    // Apply date filters if provided
    if (filter.start_date) q = q.gte('created_at', filter.start_date);
    if (filter.end_date) q = q.lte('created_at', filter.end_date);
    if (filter.dealer_id) q = q.eq('dealer_id', filter.dealer_id);

    const { data, error } = await q;

    if (error) throw new Error(error.message);

    // Aggregate by type
    const stats = {
      water: { count: 0, total_amount: 0 },
      juice: { count: 0, total_amount: 0 },
      mixed: { count: 0, total_amount: 0 }
    };

    (data || []).forEach(order => {
      const type = order.product_type || 'mixed';
      if (stats[type]) {
        stats[type].count++;
        stats[type].total_amount += parseFloat(order.total_amount || 0);
      }
    });

    return stats;
  }

  static async canApproveDraft(draftCreatorId, approverId) {
  if (!isValidUUID(draftCreatorId)) return false;
  if (!isValidUUID(approverId)) return false;

  const approverRole = await DealerModel.getRoleName(approverId);
  
  if (['sales_officer'].includes(approverRole)) return false;

  // Check if draft creator reports to approver
  const reportees = await DealerModel.getAllReportees(approverId);
  return reportees.includes(draftCreatorId);
}
}

module.exports = OrderModel;