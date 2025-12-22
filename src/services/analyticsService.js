// src/services/analyticsService.js - COMPLETE FILE
const supabase = require("../config/supabase");
const DealerModel = require("../models/dealerModel");
const logger = require("../utils/logger");

class AnalyticsService {
  /* =====================================================
     HELPER: GET USER ROLE
  ====================================================== */
  static async getUserRole(userId) {
    return await DealerModel.getRoleName(userId);
  }

  /* =====================================================
     HELPER: APPLY DATE FILTERS
  ====================================================== */
  static applyDateFilter(query, filter = {}) {
    if (!filter || !filter.type) return query;

    if (filter.type === "year" && filter.year) {
      return query
        .gte("created_at", `${filter.year}-01-01`)
        .lte("created_at", `${filter.year}-12-31`);
    }

    if (filter.type === "month" && filter.year && filter.month) {
      const m = String(filter.month).padStart(2, "0");
      const lastDay = new Date(filter.year, filter.month, 0).getDate();
      return query
        .gte("created_at", `${filter.year}-${m}-01`)
        .lte("created_at", `${filter.year}-${m}-${lastDay}`);
    }

    if (filter.type === "custom" && filter.from && filter.to) {
      return query.gte("created_at", filter.from).lte("created_at", filter.to);
    }

    return query;
  }

  /* =====================================================
     HELPER: GET ALL SOs UNDER USER (HIERARCHY BASED)
  ====================================================== */
  static async getSalesOfficersUnderUser(userId) {
    const role = await this.getUserRole(userId);

    // Admin/Owner/GM see all SOs
    if (["admin", "owner", "gm"].includes(role)) {
      const { data, error } = await supabase
        .from("profiles_onboard")
        .select("id, full_name, email, role, phone, employee_code")
        .ilike("role", "%sales_officer%")
        .eq("is_active", true);

      if (error) throw new Error(error.message);
      return data || [];
    }

    // If user is SO, return only themselves
    if (role === "sales_officer" || (role && role.includes("sales_officer"))) {
      const { data, error } = await supabase
        .from("profiles_onboard")
        .select("id, full_name, email, role, phone, employee_code")
        .eq("id", userId)
        .single();

      if (error) throw new Error(error.message);
      return data ? [data] : [];
    }

    // For ASM/RSM: get all reportees recursively, filter SOs
    const reportees = await DealerModel.getAllReportees(userId);
    const allIds = [userId, ...reportees];

    const { data, error } = await supabase
      .from("profiles_onboard")
      .select("id, full_name, email, role, phone, employee_code")
      .in("id", allIds)
      .eq("is_active", true);

    if (error) throw new Error(error.message);

    // Filter only sales officers
    const sos = (data || []).filter((p) => {
      const roleStr = (p.role || "").toString().toLowerCase();
      return roleStr.includes("sales_officer") || roleStr === "so";
    });

    return sos;
  }

  /* =====================================================
     CORE: GET METRICS FOR A SINGLE SO
  ====================================================== */
  static async getMetricsForSO(soId, filter = {}) {
    try {
      // 1. Get dealers assigned to this SO
      const dealerIds = await DealerModel.getDealersAssignedTo(soId);

      if (!dealerIds || dealerIds.length === 0) {
        return {
          so_id: soId,
          orders_count: 0,
          order_value: 0,
          collected: 0,
          pending: 0,
        };
      }

      // 2. Orders placed ON this SO (placed_on field)
      let orderQuery = supabase
        .from("orders")
        .select("id, total_amount, status")
        .eq("placed_on", soId)
        .in("status", ["placed", "approved", "delivered"])
        .eq("is_active", true);

      orderQuery = this.applyDateFilter(orderQuery, filter);
      const { data: orders, error: ordersError } = await orderQuery;

      if (ordersError) {
        logger.error(`Error fetching orders for SO ${soId}: ${ordersError.message}`);
      }

      const ordersCount = orders?.length || 0;
      const orderValue = (orders || []).reduce(
        (sum, o) => sum + Number(o.total_amount || 0),
        0
      );

      // 3. Payments collected from dealers assigned to this SO
      let paymentQuery = supabase
        .from("dealer_ledger")
        .select("amount, created_at")
        .eq("transaction_type", "payment")
        .in("dealer_id", dealerIds);

      paymentQuery = this.applyDateFilter(paymentQuery, filter);
      const { data: payments, error: paymentsError } = await paymentQuery;

      if (paymentsError) {
        logger.error(`Error fetching payments for SO ${soId}: ${paymentsError.message}`);
      }

      const collected = (payments || []).reduce(
        (sum, p) => sum + Math.abs(Number(p.amount || 0)),
        0
      );

      // 4. Pending amount from dealers assigned to this SO
      const { data: pendingData, error: pendingError } = await supabase
        .from("dealer_pending_amounts")
        .select("pending_amount")
        .in("dealer_id", dealerIds);

      if (pendingError) {
        logger.error(`Error fetching pending for SO ${soId}: ${pendingError.message}`);
      }

      const pending = (pendingData || []).reduce(
        (sum, p) => sum + Number(p.pending_amount || 0),
        0
      );

      return {
        so_id: soId,
        orders_count: ordersCount,
        order_value: orderValue,
        collected: collected,
        pending: pending,
      };
    } catch (error) {
      logger.error(`getMetricsForSO error for SO ${soId}: ${error.message}`);
      return {
        so_id: soId,
        orders_count: 0,
        order_value: 0,
        collected: 0,
        pending: 0,
      };
    }
  }

  /* =====================================================
     MAIN DASHBOARD: OVERALL + ALL SOs UNDER USER
  ====================================================== */
  static async getDashboard(userId, filter = {}) {
    try {
      const role = await this.getUserRole(userId);

      // Get all SOs under this user (hierarchy-based)
      const salesOfficers = await this.getSalesOfficersUnderUser(userId);

      if (!salesOfficers || salesOfficers.length === 0) {
        return {
          overall: {
            orders_count: 0,
            order_value: 0,
            collected: 0,
            pending: 0,
          },
          sales_officers: [],
        };
      }

      // Calculate metrics for each SO
      const soMetrics = [];
      let totalOrders = 0;
      let totalOrderValue = 0;
      let totalCollected = 0;
      let totalPending = 0;

      for (const so of salesOfficers) {
        const metrics = await this.getMetricsForSO(so.id, filter);

        totalOrders += metrics.orders_count;
        totalOrderValue += metrics.order_value;
        totalCollected += metrics.collected;
        totalPending += metrics.pending;

        soMetrics.push({
          so_id: so.id,
          so_name: so.full_name,
          so_email: so.email,
          so_phone: so.phone,
          so_employee_code: so.employee_code,
          orders_count: metrics.orders_count,
          order_value: metrics.order_value,
          collected: metrics.collected,
          pending: metrics.pending,
        });
      }

      return {
        overall: {
          orders_count: totalOrders,
          order_value: totalOrderValue,
          collected: totalCollected,
          pending: totalPending,
        },
        sales_officers: soMetrics,
      };
    } catch (error) {
      logger.error(`getDashboard error: ${error.message}`);
      throw error;
    }
  }

  /* =====================================================
     DRILL-DOWN: SO → DEALERS WITH METRICS
  ====================================================== */
  static async getSoDealersDrilldown(soId, filter = {}) {
    try {
      // Get dealers assigned to this SO
      const dealerIds = await DealerModel.getDealersAssignedTo(soId);

      if (!dealerIds || dealerIds.length === 0) {
        return {
          so_id: soId,
          dealers: [],
        };
      }

      // Get dealer details
      const { data: dealers, error: dealersError } = await supabase
        .from("dealers")
        .select("id, name, dealer_code, phone, email, address, state")
        .in("id", dealerIds)
        .eq("is_active", true);

      if (dealersError) throw new Error(dealersError.message);

      // For each dealer, calculate metrics
      const dealerMetrics = [];

      for (const dealer of dealers || []) {
        // Orders placed by this SO for this dealer
        let orderQuery = supabase
          .from("orders")
          .select("id, total_amount, status")
          .eq("dealer_id", dealer.id)
          .eq("placed_on", soId)
          .in("status", ["placed", "approved", "delivered"])
          .eq("is_active", true);

        orderQuery = this.applyDateFilter(orderQuery, filter);
        const { data: orders } = await orderQuery;

        const ordersCount = orders?.length || 0;
        const orderValue = (orders || []).reduce(
          (sum, o) => sum + Number(o.total_amount || 0),
          0
        );

        // Payments collected from this dealer
        let paymentQuery = supabase
          .from("dealer_ledger")
          .select("amount")
          .eq("dealer_id", dealer.id)
          .eq("transaction_type", "payment");

        paymentQuery = this.applyDateFilter(paymentQuery, filter);
        const { data: payments } = await paymentQuery;

        const collected = (payments || []).reduce(
          (sum, p) => sum + Math.abs(Number(p.amount || 0)),
          0
        );

        // Pending amount for this dealer
        const { data: pendingData } = await supabase
          .from("dealer_pending_amounts")
          .select("pending_amount")
          .eq("dealer_id", dealer.id)
          .single();

        const pending = pendingData ? Number(pendingData.pending_amount || 0) : 0;

        dealerMetrics.push({
          dealer_id: dealer.id,
          dealer_name: dealer.name,
          dealer_code: dealer.dealer_code,
          dealer_phone: dealer.phone,
          dealer_email: dealer.email,
          dealer_address: dealer.address,
          dealer_state: dealer.state,
          orders_count: ordersCount,
          order_value: orderValue,
          collected: collected,
          pending: pending,
        });
      }

      return {
        so_id: soId,
        dealers: dealerMetrics,
      };
    } catch (error) {
      logger.error(`getSoDealersDrilldown error: ${error.message}`);
      throw error;
    }
  }

  /* =====================================================
     PRODUCT-WISE ANALYTICS
  ====================================================== */
  static async getProductWiseAnalytics(userId, filter = {}) {
    try {
      const salesOfficers = await this.getSalesOfficersUnderUser(userId);
      const soIds = salesOfficers.map((so) => so.id);

      if (!soIds || soIds.length === 0) {
        return [];
      }

      // Get all orders placed by these SOs
      let orderQuery = supabase
        .from("orders")
        .select("id")
        .in("placed_on", soIds)
        .in("status", ["placed", "approved", "delivered"])
        .eq("is_active", true);

      orderQuery = this.applyDateFilter(orderQuery, filter);
      const { data: orders } = await orderQuery;

      if (!orders || orders.length === 0) {
        return [];
      }

      const orderIds = orders.map((o) => o.id);

      // Get order lines for these orders
      const { data: orderLines, error: linesError } = await supabase
        .from("order_lines")
        .select("product_id, product_name, quantity, unit_price, amount")
        .in("order_id", orderIds);

      if (linesError) throw new Error(linesError.message);

      // Aggregate by product
      const productMap = {};

      for (const line of orderLines || []) {
        const productId = line.product_id || line.product_name;
        if (!productMap[productId]) {
          productMap[productId] = {
            product_id: line.product_id,
            product_name: line.product_name,
            total_quantity: 0,
            total_amount: 0,
          };
        }

        productMap[productId].total_quantity += Number(line.quantity || 0);
        productMap[productId].total_amount += Number(line.amount || 0);
      }

      return Object.values(productMap).sort((a, b) => b.total_amount - a.total_amount);
    } catch (error) {
      logger.error(`getProductWiseAnalytics error: ${error.message}`);
      throw error;
    }
  }

  /* =====================================================
     SO-WISE ANALYTICS (FOR CHARTS)
  ====================================================== */
  static async getSoWiseAnalytics(userId, filter = {}) {
    try {
      const salesOfficers = await this.getSalesOfficersUnderUser(userId);

      const soAnalytics = [];

      for (const so of salesOfficers) {
        const metrics = await this.getMetricsForSO(so.id, filter);

        soAnalytics.push({
          so_id: so.id,
          so_name: so.full_name,
          orders_count: metrics.orders_count,
          order_value: metrics.order_value,
          collected: metrics.collected,
          pending: metrics.pending,
        });
      }

      return soAnalytics.sort((a, b) => b.order_value - a.order_value);
    } catch (error) {
      logger.error(`getSoWiseAnalytics error: ${error.message}`);
      throw error;
    }
  }

  /* =====================================================
     EXCEL EXPORT: COMPREHENSIVE REPORT
  ====================================================== */
  static async getExcelData(userId, filter = {}) {
  try {
    // ⭐ RUN INDEPENDENT QUERIES IN PARALLEL
    const [dashboard, productWise, dealerWiseOrders, dealerWisePending] = await Promise.all([
      this.getDashboard(userId, filter),
      this.getProductWiseAnalytics(userId, filter),
      this.getDealerWiseOrdersForExcel(userId, filter),
      this.getDealerWisePendingForExcel(userId, filter)
    ]);

    // ⭐ OPTIMIZE: Fetch all SO details in parallel instead of sequentially
    const soDetailsPromises = dashboard.sales_officers.map(async (so) => {
      const dealerData = await this.getSoDealersDrilldown(so.so_id, filter);
      
      // ⭐ OPTIMIZE: Fetch all dealer details in parallel
      const dealersWithDetailsPromises = dealerData.dealers.map(async (dealer) => {
        const [orders, payments] = await Promise.all([
          this.getDealerOrderDetails(dealer.dealer_id, so.so_id, filter),
          this.getDealerPaymentDetails(dealer.dealer_id, filter)
        ]);
        
        return {
          ...dealer,
          orders: orders,
          payments: payments,
        };
      });
      
      const dealersWithDetails = await Promise.all(dealersWithDetailsPromises);
      
      return {
        so_info: so,
        dealers: dealersWithDetails,
      };
    });

    const soDetails = await Promise.all(soDetailsPromises);

    return {
      overall: dashboard.overall,
      sales_officers: dashboard.sales_officers,
      so_details: soDetails,
      product_wise: productWise,
      dealer_wise_orders: dealerWiseOrders,
      dealer_wise_pending: dealerWisePending,
      filter: filter,
      generated_at: new Date().toISOString(),
      generated_by: userId,
    };
  } catch (error) {
    logger.error(`getExcelData error: ${error.message}`);
    throw error;
  }
}


static async getHomeStats(userId, filter = {}) {
  try {
    const role = await this.getUserRole(userId);

    // Get all SOs under this user (hierarchy-based)
    const salesOfficers = await this.getSalesOfficersUnderUser(userId);
    const soIds = salesOfficers.map(so => so.id);

    // Get all dealers under these SOs
    let allDealerIds = [];
    if (soIds.length > 0) {
      allDealerIds = await DealerModel.getDealersAssignedToMany(soIds);
    }

    // If no dealers found, return zeros
    if (allDealerIds.length === 0) {
      return {
        pending_collection_amount: 0,
        pending_payment_approvals: 0,
        pending_order_approvals: 0,
        approved_delivered_orders: 0,
        cash_collected: 0,
        new_dealers_added: 0,
      };
    }

    // 1. PENDING COLLECTION AMOUNT
    const { data: pendingData } = await supabase
      .from("dealer_pending_amounts")
      .select("pending_amount")
      .in("dealer_id", allDealerIds);

    const pendingCollectionAmount = (pendingData || []).reduce(
      (sum, p) => sum + Number(p.pending_amount || 0),
      0
    );

    // 2. PENDING PAYMENT APPROVALS (GM/Owner only)
    let pendingPaymentApprovals = 0;
    if (["gm", "owner", "admin"].includes(role)) {
      const { count } = await supabase
        .from("dealer_payment_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");

      pendingPaymentApprovals = count || 0;
    }

    // 3. PENDING ORDER APPROVALS (with filter)
    let pendingOrderQuery = supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("dealer_id", allDealerIds)
      .eq("status", "placed")
      .eq("is_active", true);

    pendingOrderQuery = this.applyDateFilter(pendingOrderQuery, filter);
    const { count: pendingOrderCount } = await pendingOrderQuery;

    // 4. APPROVED/DELIVERED ORDERS (with filter)
    let approvedOrderQuery = supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("dealer_id", allDealerIds)
      .in("status", ["approved", "delivered"])
      .eq("is_active", true);

    approvedOrderQuery = this.applyDateFilter(approvedOrderQuery, filter);
    const { count: approvedOrderCount } = await approvedOrderQuery;

    // 5. CASH COLLECTED (with filter)
    let cashQuery = supabase
      .from("dealer_ledger")
      .select("amount")
      .eq("transaction_type", "payment")
      .in("dealer_id", allDealerIds);

    cashQuery = this.applyDateFilter(cashQuery, filter);
    const { data: payments } = await cashQuery;

    const cashCollected = (payments || []).reduce(
      (sum, p) => sum + Math.abs(Number(p.amount || 0)),
      0
    );

    // 6. NEW DEALERS ADDED (with filter)
    let dealerQuery = supabase
      .from("dealers")
      .select("id", { count: "exact", head: true })
      .in("id", allDealerIds)
      .eq("status", "approved")
      .eq("is_active", true);

    dealerQuery = this.applyDateFilter(dealerQuery, filter);
    const { count: newDealersCount } = await dealerQuery;

    return {
      pending_collection_amount: pendingCollectionAmount,
      pending_payment_approvals: pendingPaymentApprovals,
      pending_order_approvals: pendingOrderCount || 0,
      approved_delivered_orders: approvedOrderCount || 0,
      cash_collected: cashCollected,
      new_dealers_added: newDealersCount || 0,
    };
  } catch (error) {
    logger.error(`getHomeStats error: ${error.message}`);
    throw error;
  }
}

  /* =====================================================
     DEALER DRILL-DOWN: ORDER DETAILS
  ====================================================== */
  static async getDealerOrderDetails(dealerId, soId, filter = {}) {
    try {
      let orderQuery = supabase
        .from("orders")
        .select(`
          id,
          created_at,
          total_amount,
          status,
          notes,
          order_lines (
            id,
            product_name,
            quantity,
            case_type,
            unit_price,
            amount
          )
        `)
        .eq("dealer_id", dealerId)
        .eq("placed_on", soId)
        .eq("is_active", true);

      orderQuery = this.applyDateFilter(orderQuery, filter);
      const { data: orders, error } = await orderQuery.order("created_at", { ascending: false });

      if (error) throw new Error(error.message);

      return orders || [];
    } catch (error) {
      logger.error(`getDealerOrderDetails error: ${error.message}`);
      throw error;
    }
  }

  /* =====================================================
     DEALER DRILL-DOWN: PAYMENT DETAILS
  ====================================================== */
  static async getDealerPaymentDetails(dealerId, filter = {}) {
    try {
      let paymentQuery = supabase
        .from("dealer_ledger")
        .select(`
          id,
          created_at,
          amount,
          payment_mode,
          description,
          created_by_profile:profiles_onboard!dealer_ledger_created_by_fkey(
            id, full_name, role
          ),
          collected_by_profile:profiles_onboard!dealer_ledger_collected_by_fkey(
            id, full_name, role
          )
        `)
        .eq("dealer_id", dealerId)
        .eq("transaction_type", "payment");

      paymentQuery = this.applyDateFilter(paymentQuery, filter);
      const { data: payments, error } = await paymentQuery.order("created_at", { ascending: false });

      if (error) throw new Error(error.message);

      return (payments || []).map((p) => ({
        id: p.id,
        date: p.created_at,
        amount: Math.abs(Number(p.amount || 0)),
        payment_mode: p.payment_mode,
        description: p.description,
        created_by: p.created_by_profile?.full_name || "N/A",
        collected_by: p.collected_by_profile?.full_name || "N/A",
      }));
    } catch (error) {
      logger.error(`getDealerPaymentDetails error: ${error.message}`);
      throw error;
    }
  }

  static async getDealerWiseOrdersForExcel(userId, filter = {}) {
  try {
    const salesOfficers = await this.getSalesOfficersUnderUser(userId);
    
    // ⭐ OPTIMIZE: Process all SOs in parallel
    const dealerOrdersPromises = salesOfficers.map(async (so) => {
      const dealerIds = await DealerModel.getDealersAssignedTo(so.id);

      if (!dealerIds || dealerIds.length === 0) return [];

      // Get dealer details
      const { data: dealers } = await supabase
        .from("dealers")
        .select("id, name, dealer_code, phone, email, address, state")
        .in("id", dealerIds)
        .eq("is_active", true);

      // ⭐ OPTIMIZE: Process all dealers in parallel
      const dealerDataPromises = (dealers || []).map(async (dealer) => {
        let orderQuery = supabase
          .from("orders")
          .select(`
            id,
            created_at,
            total_amount,
            status,
            notes,
            order_lines (
              id,
              product_name,
              quantity,
              case_type,
              unit_price,
              amount
            )
          `)
          .eq("dealer_id", dealer.id)
          .eq("placed_on", so.id)
          .eq("is_active", true);

        orderQuery = this.applyDateFilter(orderQuery, filter);
        const { data: orders } = await orderQuery.order("created_at", { ascending: false });

        if (orders && orders.length > 0) {
          return {
            so_name: so.full_name,
            so_employee_code: so.employee_code,
            dealer_id: dealer.id,
            dealer_name: dealer.name,
            dealer_code: dealer.dealer_code,
            dealer_phone: dealer.phone,
            dealer_email: dealer.email,
            dealer_address: dealer.address,
            dealer_state: dealer.state,
            orders: orders.map(order => ({
              order_id: order.id,
              order_number: order.id.substring(0, 8),
              order_date: order.created_at,
              total_amount: order.total_amount,
              status: order.status,
              notes: order.notes,
              products: (order.order_lines || []).map(line => ({
                product_name: line.product_name,
                quantity: line.quantity,
                case_type: line.case_type,
                unit_price: line.unit_price,
                amount: line.amount
              }))
            }))
          };
        }
        return null;
      });

      const dealerData = await Promise.all(dealerDataPromises);
      return dealerData.filter(d => d !== null);
    });

    const allDealerOrders = await Promise.all(dealerOrdersPromises);
    return allDealerOrders.flat();
  } catch (error) {
    logger.error(`getDealerWiseOrdersForExcel error: ${error.message}`);
    throw error;
  }
}

/* =====================================================
   HELPER: GET DEALER-WISE PENDING AMOUNTS FOR EXCEL
   ✅ No changes needed for this method
====================================================== */
static async getDealerWisePendingForExcel(userId, filter = {}) {
  try {
    const salesOfficers = await this.getSalesOfficersUnderUser(userId);
    
    // ⭐ OPTIMIZE: Process all SOs in parallel
    const dealerPendingPromises = salesOfficers.map(async (so) => {
      const dealerIds = await DealerModel.getDealersAssignedTo(so.id);

      if (!dealerIds || dealerIds.length === 0) return [];

      // Get dealer details
      const { data: dealers } = await supabase
        .from("dealers")
        .select("id, name, dealer_code, phone, email, address, state")
        .in("id", dealerIds)
        .eq("is_active", true);

      // ⭐ OPTIMIZE: Process all dealers in parallel
      const dealerDataPromises = (dealers || []).map(async (dealer) => {
        // ⭐ OPTIMIZE: Run all 3 queries in parallel
        const [pendingResult, ordersResult, paymentsResult] = await Promise.all([
          // Get pending amount
          supabase
            .from("dealer_pending_amounts")
            .select("pending_amount, last_updated")
            .eq("dealer_id", dealer.id)
            .single(),
          
          // Get total order value
          (async () => {
            let orderQuery = supabase
              .from("orders")
              .select("total_amount")
              .eq("dealer_id", dealer.id)
              .eq("placed_on", so.id)
              .in("status", ["placed", "approved", "delivered"])
              .eq("is_active", true);

            orderQuery = this.applyDateFilter(orderQuery, filter);
            return await orderQuery;
          })(),
          
          // Get total collected
          (async () => {
            let paymentQuery = supabase
              .from("dealer_ledger")
              .select("amount")
              .eq("dealer_id", dealer.id)
              .eq("transaction_type", "payment");

            paymentQuery = this.applyDateFilter(paymentQuery, filter);
            return await paymentQuery;
          })()
        ]);

        const pendingAmount = pendingResult.data ? Number(pendingResult.data.pending_amount || 0) : 0;
        
        const totalOrderValue = (ordersResult.data || []).reduce(
          (sum, o) => sum + Number(o.total_amount || 0),
          0
        );

        const totalCollected = (paymentsResult.data || []).reduce(
          (sum, p) => sum + Math.abs(Number(p.amount || 0)),
          0
        );

        return {
          so_name: so.full_name,
          so_employee_code: so.employee_code,
          dealer_id: dealer.id,
          dealer_name: dealer.name,
          dealer_code: dealer.dealer_code,
          dealer_phone: dealer.phone,
          dealer_email: dealer.email,
          dealer_state: dealer.state,
          total_order_value: totalOrderValue,
          total_collected: totalCollected,
          pending_amount: pendingAmount,
          last_updated: pendingResult.data?.last_updated || null
        };
      });

      return await Promise.all(dealerDataPromises);
    });

    const allDealerPending = await Promise.all(dealerPendingPromises);
    const flattenedData = allDealerPending.flat();
    
    // Sort by pending amount (highest first)
    return flattenedData.sort((a, b) => b.pending_amount - a.pending_amount);
  } catch (error) {
    logger.error(`getDealerWisePendingForExcel error: ${error.message}`);
    throw error;
  }
}
}

module.exports = AnalyticsService;