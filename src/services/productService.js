const ProductModel = require("../models/productModel");
const logger = require("../utils/logger");

class ProductService {
  // BRAND
  static async createBrand(payload) {
    return await ProductModel.createBrand(payload);
  }

  static async getBrands() {
    return await ProductModel.getBrands();
  }

  static async deleteBrand(brandId) {
    return await ProductModel.deleteBrand(brandId);
  }

  // TYPE (water/juice)
  static async createType(payload) {
    return await ProductModel.createType(payload);
  }

  static async getTypes() {
    return await ProductModel.getTypes();
  }

  static async deleteType(typeId) {
    return await ProductModel.deleteType(typeId);
  }

  // FLAVOUR
  static async createFlavour(payload) {
    return await ProductModel.createFlavour(payload);
  }

  static async getFlavours(query) {
    return await ProductModel.getFlavours(query.brand_id);
  }

  static async deleteFlavour(flavourId) {
    return await ProductModel.deleteFlavour(flavourId);
  }

  // SIZE
  static async createSize(payload) {
    return await ProductModel.createSize(payload);
  }

  static async getSizes() {
    return await ProductModel.getSizes();
  }

  static async deleteSize(sizeId) {
    return await ProductModel.deleteSize(sizeId);
  }

  // SHAPE
  static async createShape(payload) {
    return await ProductModel.createShape(payload);
  }

  static async getShapes() {
    return await ProductModel.getShapes();
  }

  static async deleteShape(shapeId) {
    return await ProductModel.deleteShape(shapeId);
  }

  // PRODUCT
  static async createProduct(payload) {
    return await ProductModel.createProduct(payload);
  }

  static async getProducts(query) {
    return await ProductModel.getProducts(query);
  }

  static async deleteProduct(productId) {
    return await ProductModel.deleteProduct(productId);
  }

  // PRICE
  static async addPrice(payload) {
    return await ProductModel.addPrice(payload);
  }

  static async getPrices(product_id) {
    return await ProductModel.getPrices(product_id);
  }

  static async updatePrice(priceId, newPrice) {
    return await ProductModel.updatePrice(priceId, newPrice);
  }

  static async deletePrice(priceId) {
    return await ProductModel.deletePrice(priceId);
  }
   static async fetchProducts(query) {
    // query: page, limit, q, brand_id, type_id, flavour_id, size_id, shape_id
    return await ProductModel.fetchProducts(query);
  }
}

module.exports = ProductService;