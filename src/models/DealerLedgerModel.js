// src/models/DealerLedgerModel.js (Full Updated File)
const supabase = require("../config/supabase");
const logger = require("../utils/logger");

class DealerLedgerModel {
  /**
   * Add opening balance for a dealer (admin use before go-live)
   */
  static async addOpeningBalance(dealerId, amount, description, createdBy) {
    const { data, error } = await supabase
      .from("dealer_ledger")
      .insert({
        dealer_id: dealerId,
        transaction_type: "opening_balance",
        amount: amount, // positive = dealer owes us
        reference_type: "manual_adjustment",
        description: description || "Opening balance before system go-live",
        created_by: createdBy,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * Get pending amount for a dealer - Prefer dealer_pending_amounts table
   */
  static async getDealerPendingAmount(dealerId) {
    if (!dealerId) return 0;
    try {
      // Prefer pending_amounts table (single value; assume it's a summary)
      const { data, error } = await supabase
        .from("dealer_pending_amounts")
        .select("pending_amount")
        .eq("dealer_id", dealerId)
        .single();

      if (error && error.code !== "PGRST116") {
        // PGRST116 = no row
        logger.warn(
          `No pending_amounts row for dealer ${dealerId}, falling back to ledger sum`
        );
        return await this._sumLedgerOutstanding(dealerId);
      }
      return data ? parseFloat(data.pending_amount || 0) : 0;
    } catch (e) {
      logger.error(
        `getDealerPendingAmount error for ${dealerId}: ${e.message}`
      );
      return await this._sumLedgerOutstanding(dealerId); // Fallback
    }
  }

  // Internal fallback: Sum from dealer_ledger (positive outstanding - payments)
  static async _sumLedgerOutstanding(dealerId) {
    const { data, error } = await supabase
      .from("dealer_ledger")
      .select("amount")
      .eq("dealer_id", dealerId)
      .eq("is_active", true)
      .in("transaction_type", ["order_charge", "payment", "opening_balance"]); // Adjust types as needed

    if (error) return 0;
    return (data || []).reduce(
      (sum, txn) => sum + parseFloat(txn.amount || 0),
      0
    );
  }

  /**
   * Get ledger transactions for a dealer
   */
  static async getDealerLedger(dealerId, options = {}) {
    let query = supabase
      .from("dealer_ledger")
      .select(
        `
        *,
        created_by_profile:profiles_onboard!dealer_ledger_created_by_fkey(
          id, full_name, email, role
        )
      `,
        { count: "exact" }
      )
      .eq("dealer_id", dealerId)
      .eq("is_active", true);

      if (options.product_type && options.product_type !== 'null') {
  query = query.eq("product_type", options.product_type);
}


    // Pagination
    const page = parseInt(options.page) || 1;
    const limit = Math.min(parseInt(options.limit) || 50, 100);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw new Error(error.message);

    return {
      transactions: data || [],
      total: count || 0,
      page,
      limit,
    };
  }

  /**
   * Get all dealers with their pending amounts
   */
  static async getAllDealersPendingAmounts(options = {}) {
    const { data, error } = await supabase
      .from("dealer_pending_amounts")
      .select("*");

    if (error) throw new Error(error.message);

    return data || [];
  }

  /**
   * Record a payment from dealer (future; decreases outstanding)
   */
  // src/models/DealerLedgerModel.js

  static async recordPayment(
    dealerId,
    amount,
    paymentMode,
    description,
    createdBy,
    meta = {}
  ) {
    // amount stored as negative in your ledger table (you already used -Math.abs(amount))
    const receiptFilename = meta.receipt_filename || null;
    const collectedBy = meta.collected_by || null;

    const { data: ledgerData, error: ledgerError } = await supabase
      .from("dealer_ledger")
      .insert({
        dealer_id: dealerId,
        transaction_type: "payment",
        amount: -Math.abs(amount), // negative = payment received
        reference_type: "payment",
        description: description || "Payment received",
        payment_mode: paymentMode,
        created_by: createdBy,
        collected_by: collectedBy,
        receipt_filename: receiptFilename,
        receipt_storage_path: meta.receipt_storage_path || null,
        receipt_url: meta.receipt_url || null,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (ledgerError) throw new Error(ledgerError.message);

    // Update pending_amounts (decrease)
    const currentPending = await this.getDealerPendingAmount(dealerId);
    const newPending = currentPending - Math.abs(amount);

    const { error: updateError } = await supabase
      .from("dealer_pending_amounts")
      .upsert(
        {
          dealer_id: dealerId,
          pending_amount: newPending,
        },
        { onConflict: "dealer_id" }
      );

    if (updateError)
      logger.warn(
        `Pending update failed after payment for ${dealerId}: ${updateError.message}`
      );

    // return the ledger row (contains receipt_filename etc)
    return ledgerData;
  }

  /**
   * Record order charge to ledger (positive outstanding) - Called on place or approve
   */
  static async recordOrderCharge(dealerId, amount, orderId, createdBy,productType ) {
  const { data: ledgerData, error: ledgerError } = await supabase
    .from("dealer_ledger")
    .insert({
      dealer_id: dealerId,
      transaction_type: "order_charge",
      amount: Math.abs(amount), // POSITIVE
      reference_type: "order",
      reference_id: orderId,
      description: `Order charge for order ${orderId}`,
      created_by: createdBy,
      created_at: new Date().toISOString(),
      product_type: productType || null,
    })
    .select()
    .single();

  if (ledgerError) throw new Error(ledgerError.message);

  const currentPending = await this.getDealerPendingAmount(dealerId);
  const newPending = currentPending + Math.abs(amount);

  await supabase
    .from("dealer_pending_amounts")
    .upsert(
      {
        dealer_id: dealerId,
        pending_amount: newPending,
      },
      { onConflict: "dealer_id" }
    );

  return ledgerData;
}



  /**
   * Check if dealer can place order (no pending amount OR approved)
   */
  static async canPlaceOrder(dealerId, orderAmount = 0) {
    if (!dealerId) throw new Error("dealerId required");

    // get pending
    const pending = await this.getDealerPendingAmount(dealerId); // positive = dealer owes us

    // get credit limit
    const creditLimit =
      await require("../models/dealerModel").getDealerCreditLimit(dealerId);
    // creditLimit is numeric; if 0 means no allowed credit unless you want 0 => no limit - adjust accordingly

    // Decision: treat 0 as "no credit allowed". If you want "no limit" use null on DB and change logic.
    const effectiveLimit = creditLimit == null ? 0 : parseFloat(creditLimit);

    // If you want "null = unlimited", change above accordingly.

    // allow if pending + orderAmount <= effectiveLimit
    const willExceed =
      parseFloat(pending || 0) + parseFloat(orderAmount || 0) > effectiveLimit;

    // if willExceed true => cannot place (approval required)
    return !willExceed;
  }

  static async recordReturnCashback(dealerId, amount, orderId, returnRequestId, createdBy) {
  const { data: ledgerData, error: ledgerError } = await supabase
    .from("dealer_ledger")
    .insert({
      dealer_id: dealerId,
      transaction_type: "return_cashback",
      amount: -Math.abs(amount), // NEGATIVE (credit to dealer)
      reference_type: "return_request",
      reference_id: returnRequestId,
      description: `Return cashback for order ${orderId}, return request ${returnRequestId}`,
      created_by: createdBy,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (ledgerError) throw new Error(ledgerError.message);

  // Update pending_amounts (decrease)
  const currentPending = await this.getDealerPendingAmount(dealerId);
  const newPending = currentPending - Math.abs(amount);

  await supabase
    .from("dealer_pending_amounts")
    .upsert(
      {
        dealer_id: dealerId,
        pending_amount: newPending,
      },
      { onConflict: "dealer_id" }
    );

  return ledgerData;
}
}

module.exports = DealerLedgerModel;
