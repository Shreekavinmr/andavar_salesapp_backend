const supabase = require("../config/supabase");

class ProductModel {
  // BRAND --------------------------------------------------------
  static async createBrand({ name, description }) {
    const { data, error } = await supabase
      .from("brands")
      .insert({ name, description })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  static async getBrands() {
    const { data, error } = await supabase
      .from("brands")
      .select("*")
      .eq("is_active", true)
      .order("name");

    if (error) throw new Error(error.message);
    return data;
  }

  // TYPE (water/juice) --------------------------------------------------------
  static async createType({ name, description }) {
    const { data, error } = await supabase
      .from("product_types")
      .insert({ name, description })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  static async getTypes() {
    const { data, error } = await supabase
      .from("product_types")
      .select("*")
      .eq("is_active", true)
      .order("name");

    if (error) throw new Error(error.message);
    return data;
  }

  // FLAVOUR (only for juice) --------------------------------------------------------
  static async createFlavour({ brand_id, name }) {
    const { data, error } = await supabase
      .from("flavours")
      .insert({ brand_id, name })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  static async getFlavours(brand_id) {
    let q = supabase.from("flavours").select("*").eq("is_active", true);
    if (brand_id) q = q.eq("brand_id", brand_id);

    const { data, error } = await q.order("name");
    if (error) throw new Error(error.message);
    return data;
  }

  // SIZE --------------------------------------------------------
  static async createSize({ label, ml }) {
    const { data, error } = await supabase
      .from("sizes")
      .insert({ label, ml })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  static async getSizes() {
    const { data, error } = await supabase
      .from("sizes")
      .select("*")
      .eq("is_active", true)
      .order("ml");

    if (error) throw new Error(error.message);
    return data;
  }

  // SHAPE (normal/square) --------------------------------------------------------
  static async createShape({ name, description }) {
    const { data, error } = await supabase
      .from("bottle_shapes")
      .insert({ name, description })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  static async getShapes() {
    const { data, error } = await supabase
      .from("bottle_shapes")
      .select("*")
      .eq("is_active", true)
      .order("name");

    if (error) throw new Error(error.message);
    return data;
  }

  // PRODUCT --------------------------------------------------------
  static async createProduct({ brand_id, type_id, flavour_id, size_id, shape_id, sku }) {
    // Fetch related data
    const brand = await supabase.from("brands").select("name").eq("id", brand_id).single();
    const type = await supabase.from("product_types").select("name").eq("id", type_id).single();
    const flavour = flavour_id 
      ? await supabase.from("flavours").select("name").eq("id", flavour_id).single() 
      : null;
    const size = await supabase.from("sizes").select("label").eq("id", size_id).single();
    const shape = await supabase.from("bottle_shapes").select("name").eq("id", shape_id).single();

    // Build product name
    // Example: "Coca Cola Juice Mango 500ml Square" or "Aquafina Water 1L Normal"
    const product_name = flavour_id
      ? `${brand.data.name} ${type.data.name} ${flavour.data.name} ${size.data.label} ${shape.data.name}`
      : `${brand.data.name} ${type.data.name} ${size.data.label} ${shape.data.name}`;

    const { data, error } = await supabase
      .from("products")
      .insert({
        brand_id,
        type_id,
        flavour_id,
        size_id,
        shape_id,
        sku,
        product_name,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  static async getProducts({ brand_id, type_id }) {
    let q = supabase
      .from("products")
      .select(`
        *, 
        brands(name), 
        product_types(name),
        flavours(name), 
        sizes(label),
        bottle_shapes(name)
      `)
      .eq("is_active", true);

    if (brand_id) q = q.eq("brand_id", brand_id);
    if (type_id) q = q.eq("type_id", type_id);

    const { data, error } = await q.order("product_name");
    if (error) throw new Error(error.message);
    return data;
  }

  // PRICE --------------------------------------------------------
  static async addPrice({ product_id, price }) {
    const { data, error } = await supabase
      .from("product_prices")
      .insert({ product_id, price })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  static async getPrices(product_id) {
    const { data, error } = await supabase
      .from("product_prices")
      .select("*")
      .eq("product_id", product_id)
      .order("effective_from", { ascending: false });

    if (error) throw new Error(error.message);
    return data;
  }

  static async deleteProduct(productId) {
    if (!productId) throw new Error("Product id required");

    // First delete associated prices
    await supabase
      .from("product_prices")
      .delete()
      .eq("product_id", productId);

    // Then delete the product
    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", productId);

    if (error) throw new Error(error.message);
    return { success: true };
  }

  static async deletePrice(priceId) {
    if (!priceId) throw new Error("Price id required");

    const { error } = await supabase
      .from("product_prices")
      .delete()
      .eq("id", priceId);

    if (error) throw new Error(error.message);
    return { success: true };
  }

  static async deleteBrand(brandId) {
    if (!brandId) throw new Error("Brand id required");

    // Soft delete - set is_active to false
    const { error } = await supabase
      .from("brands")
      .update({ is_active: false })
      .eq("id", brandId);

    if (error) throw new Error(error.message);
    return { success: true };
  }

  static async deleteType(typeId) {
    if (!typeId) throw new Error("Type id required");

    const { error } = await supabase
      .from("product_types")
      .update({ is_active: false })
      .eq("id", typeId);

    if (error) throw new Error(error.message);
    return { success: true };
  }

  static async deleteFlavour(flavourId) {
    if (!flavourId) throw new Error("Flavour id required");

    const { error } = await supabase
      .from("flavours")
      .update({ is_active: false })
      .eq("id", flavourId);

    if (error) throw new Error(error.message);
    return { success: true };
  }

  static async deleteSize(sizeId) {
    if (!sizeId) throw new Error("Size id required");

    const { error } = await supabase
      .from("sizes")
      .update({ is_active: false })
      .eq("id", sizeId);

    if (error) throw new Error(error.message);
    return { success: true };
  }

  static async deleteShape(shapeId) {
    if (!shapeId) throw new Error("Shape id required");

    const { error } = await supabase
      .from("bottle_shapes")
      .update({ is_active: false })
      .eq("id", shapeId);

    if (error) throw new Error(error.message);
    return { success: true };
  }

  // UPDATE PRICE
  static async updatePrice(priceId, newPrice) {
    if (!priceId) throw new Error("Price id required");
    if (newPrice == null) throw new Error("New price required");

    const { data, error } = await supabase
      .from("product_prices")
      .update({ price: newPrice })
      .eq("id", priceId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  static async fetchProducts({
  page = 1,
  limit = 30,
  q,
  brand_id,
  type_id,
  flavour_id,
  size_id,
  shape_id,
} = {}) {
  // normalize numeric params
  page = parseInt(page, 10) || 1;
  limit = parseInt(limit, 10) || 30;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  // Build count query (head:true) to get exact count
  let countQuery = supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);

  if (brand_id) countQuery = countQuery.eq("brand_id", brand_id);
  if (type_id) countQuery = countQuery.eq("type_id", type_id);
  if (flavour_id) countQuery = countQuery.eq("flavour_id", flavour_id);
  if (size_id) countQuery = countQuery.eq("size_id", size_id);
  if (shape_id) countQuery = countQuery.eq("shape_id", shape_id);
  if (q && q.toString().trim() !== "") {
    countQuery = countQuery.ilike("product_name", `%${q}%`);
  }

  const { error: countError, count } = await countQuery;
  if (countError) throw new Error(countError.message);

  // Build data query with joins INCLUDING PRICES
  let dataQuery = supabase
    .from("products")
    .select(`
      *,
      brands(id, name),
      product_types(id, name),
      flavours(id, name),
      sizes(id, label),
      bottle_shapes(id, name),
      product_prices(id, price, effective_from)
    `)
    .eq("is_active", true);

  if (brand_id) dataQuery = dataQuery.eq("brand_id", brand_id);
  if (type_id) dataQuery = dataQuery.eq("type_id", type_id);
  if (flavour_id) dataQuery = dataQuery.eq("flavour_id", flavour_id);
  if (size_id) dataQuery = dataQuery.eq("size_id", size_id);
  if (shape_id) dataQuery = dataQuery.eq("shape_id", shape_id);
  if (q && q.toString().trim() !== "") {
    dataQuery = dataQuery.ilike("product_name", `%${q}%`);
  }

  const { data, error } = await dataQuery
    .order("product_name", { ascending: true })
    .range(from, to);

  if (error) throw new Error(error.message);

  // Transform data to include latest price and flatten structure
  const products = (data || []).map(product => {
    // Get latest price
    const prices = product.product_prices || [];
    const latestPrice = prices.length > 0 
      ? prices.sort((a, b) => new Date(b.effective_from) - new Date(a.effective_from))[0]
      : null;

    return {
      id: product.id,
      product_name: product.product_name,
      sku: product.sku,
      brand_id: product.brands?.id || '',
      brand_name: product.brands?.name || '',
      type_id: product.product_types?.id || '',
      type_name: product.product_types?.name || '',
      flavour_id: product.flavours?.id || null,
      flavour_name: product.flavours?.name || null,
      size_id: product.sizes?.id || '',
      size_label: product.sizes?.label || '',
      shape_id: product.bottle_shapes?.id || '',
      shape_name: product.bottle_shapes?.name || '',
      price: latestPrice?.price || 0,
      price_id: latestPrice?.id || null,
      price_effective_from: latestPrice?.effective_from || null,
    };
  });

  return {
    products,
    total: typeof count === "number" ? count : products.length,
    page,
    limit,
  };
}
}

module.exports = ProductModel;