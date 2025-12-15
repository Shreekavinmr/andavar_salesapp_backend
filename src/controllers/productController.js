const ProductService = require("../services/productService");
const { sendResponse } = require("../utils/responseHandler");
const logger = require("../utils/logger");

class ProductController {
  // BRAND
  static async createBrand(req, res) {
    try {
      const brand = await ProductService.createBrand(req.body);
      sendResponse(res, 201, "Brand created", brand);
    } catch (e) {
      logger.error(e.message);
      sendResponse(res, 400, e.message);
    }
  }

  static async getBrands(req, res) {
    try {
      const brands = await ProductService.getBrands();
      sendResponse(res, 200, "Brands fetched", brands);
    } catch (e) {
      sendResponse(res, 400, e.message);
    }
  }

  static async deleteBrand(req, res) {
    try {
      const brandId = req.params.brand_id;
      await ProductService.deleteBrand(brandId);
      sendResponse(res, 200, "Brand deleted");
    } catch (e) {
      logger.error(`Delete brand error: ${e.message}`);
      sendResponse(res, 400, e.message);
    }
  }

  // TYPE (water/juice)
  static async createType(req, res) {
    try {
      const type = await ProductService.createType(req.body);
      sendResponse(res, 201, "Type created", type);
    } catch (e) {
      sendResponse(res, 400, e.message);
    }
  }

  static async getTypes(req, res) {
    try {
      const types = await ProductService.getTypes();
      sendResponse(res, 200, "Types fetched", types);
    } catch (e) {
      sendResponse(res, 400, e.message);
    }
  }

  static async deleteType(req, res) {
    try {
      const typeId = req.params.type_id;
      await ProductService.deleteType(typeId);
      sendResponse(res, 200, "Type deleted");
    } catch (e) {
      logger.error(`Delete type error: ${e.message}`);
      sendResponse(res, 400, e.message);
    }
  }

  // FLAVOURS (only for juice)
  static async createFlavour(req, res) {
    try {
      const flavour = await ProductService.createFlavour(req.body);
      sendResponse(res, 201, "Flavour created", flavour);
    } catch (e) {
      sendResponse(res, 400, e.message);
    }
  }

  static async getFlavours(req, res) {
    try {
      const flavours = await ProductService.getFlavours(req.query);
      sendResponse(res, 200, "Flavours fetched", flavours);
    } catch (e) {
      sendResponse(res, 400, e.message);
    }
  }

  static async deleteFlavour(req, res) {
    try {
      const flavourId = req.params.flavour_id;
      await ProductService.deleteFlavour(flavourId);
      sendResponse(res, 200, "Flavour deleted");
    } catch (e) {
      logger.error(`Delete flavour error: ${e.message}`);
      sendResponse(res, 400, e.message);
    }
  }

  // SIZES
  static async createSize(req, res) {
    try {
      const size = await ProductService.createSize(req.body);
      sendResponse(res, 201, "Size created", size);
    } catch (e) {
      sendResponse(res, 400, e.message);
    }
  }

  static async getSizes(req, res) {
    try {
      const sizes = await ProductService.getSizes();
      sendResponse(res, 200, "Sizes fetched", sizes);
    } catch (e) {
      sendResponse(res, 400, e.message);
    }
  }

  static async deleteSize(req, res) {
    try {
      const sizeId = req.params.size_id;
      await ProductService.deleteSize(sizeId);
      sendResponse(res, 200, "Size deleted");
    } catch (e) {
      logger.error(`Delete size error: ${e.message}`);
      sendResponse(res, 400, e.message);
    }
  }

  // SHAPES (normal/square)
  static async createShape(req, res) {
    try {
      const shape = await ProductService.createShape(req.body);
      sendResponse(res, 201, "Shape created", shape);
    } catch (e) {
      sendResponse(res, 400, e.message);
    }
  }

  static async getShapes(req, res) {
    try {
      const shapes = await ProductService.getShapes();
      sendResponse(res, 200, "Shapes fetched", shapes);
    } catch (e) {
      sendResponse(res, 400, e.message);
    }
  }

  static async deleteShape(req, res) {
    try {
      const shapeId = req.params.shape_id;
      await ProductService.deleteShape(shapeId);
      sendResponse(res, 200, "Shape deleted");
    } catch (e) {
      logger.error(`Delete shape error: ${e.message}`);
      sendResponse(res, 400, e.message);
    }
  }

  // PRODUCT (brand + type + flavour? + size + shape)
  static async createProduct(req, res) {
    try {
      const product = await ProductService.createProduct(req.body);
      sendResponse(res, 201, "Product created", product);
    } catch (e) {
      sendResponse(res, 400, e.message);
    }
  }

  static async getProducts(req, res) {
    try {
      const products = await ProductService.getProducts(req.query);
      sendResponse(res, 200, "Products fetched", products);
    } catch (e) {
      sendResponse(res, 400, e.message);
    }
  }

  static async deleteProduct(req, res) {
    try {
      const productId = req.params.product_id;
      await ProductService.deleteProduct(productId);
      sendResponse(res, 200, "Product deleted");
    } catch (e) {
      logger.error(`Delete product error: ${e.message}`);
      sendResponse(res, 400, e.message);
    }
  }

  // PRICE
  static async addPrice(req, res) {
    try {
      const price = await ProductService.addPrice(req.body);
      sendResponse(res, 201, "Price added", price);
    } catch (e) {
      sendResponse(res, 400, e.message);
    }
  }

  static async getPrices(req, res) {
    try {
      const prices = await ProductService.getPrices(req.params.product_id);
      sendResponse(res, 200, "Prices fetched", prices);
    } catch (e) {
      sendResponse(res, 400, e.message);
    }
  }

  static async updatePrice(req, res) {
    try {
      const priceId = req.params.price_id;
      const { price } = req.body;
      const updated = await ProductService.updatePrice(priceId, price);
      sendResponse(res, 200, "Price updated", updated);
    } catch (e) {
      logger.error(`Update price error: ${e.message}`);
      sendResponse(res, 400, e.message);
    }
  }

  static async deletePrice(req, res) {
    try {
      const priceId = req.params.price_id;
      await ProductService.deletePrice(priceId);
      sendResponse(res, 200, "Product price deleted");
    } catch (e) {
      logger.error(`Delete price error: ${e.message}`);
      sendResponse(res, 400, e.message);
    }
  }

  static async getProductsList(req, res) {
    try {
      // req.query: page, limit, q, brand_id, type_id, flavour_id, size_id, shape_id
      const result = await ProductService.fetchProducts(req.query);
      // result = { products, total, page, limit }
      sendResponse(res, 200, "Product list fetched", result);
    } catch (e) {
      logger.error(`Get product list error: ${e.message}`);
      sendResponse(res, 400, e.message);
    }
  }
}

module.exports = ProductController;