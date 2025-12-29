// src/models/DealerPaymentRequestModel.js
const supabase = require("../config/supabase");

class DealerPaymentRequestModel {

  static async createRequest(payload) {
    const { data, error } = await supabase
      .from("dealer_payment_requests")
      .insert(payload)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  static async getPendingRequests() {
    const { data, error } = await supabase
      .from("dealer_payment_requests")
      .select(`
        *,
        dealer:dealers(id, dealer_name),
        requester:profiles_onboard!dealer_payment_requests_requested_by_fkey(
          id, full_name, role
        )
      `)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return data;
  }

  static async getById(id) {
    const { data, error } = await supabase
      .from("dealer_payment_requests")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  static async markApproved(id, reviewerId) {
    const { error } = await supabase
      .from("dealer_payment_requests")
      .update({
        status: "approved",
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) throw new Error(error.message);
  }

  static async markRejected(id, reviewerId, reason) {
    const { error } = await supabase
      .from("dealer_payment_requests")
      .update({
        status: "rejected",
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
        rejection_reason: reason,
      })
      .eq("id", id);

    if (error) throw new Error(error.message);
  }
  static async getPendingByDealer(dealerId) {
  const { data, error } = await supabase
    .from("dealer_payment_requests")
    .select(`
      *,
      requester:profiles_onboard(id, full_name, role)
    `)
    .eq("dealer_id", dealerId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}
static async getPendingRequestsByDealer(dealerId) {
  const { data, error } = await supabase
    .from("dealer_payment_requests")
    .select(`
      *,
      requester:profiles_onboard!dealer_payment_requests_requested_by_fkey(
        id, full_name, role
      )
    `)
    .eq("dealer_id", dealerId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

}

module.exports = DealerPaymentRequestModel;
