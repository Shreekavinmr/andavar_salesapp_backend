const express = require("express");
const { authenticateToken, requireAdmin } = require("../middleware/auth");
const ProductController = require("../controllers/productController");

const router = express.Router();

// Brands
router.post("/brands", authenticateToken, requireAdmin, ProductController.createBrand);
router.get("/brands", authenticateToken, ProductController.getBrands);
router.delete("/brands/:brand_id", authenticateToken, requireAdmin, ProductController.deleteBrand);

// Types (water/juice)
router.post("/types", authenticateToken, requireAdmin, ProductController.createType);
router.get("/types", authenticateToken, ProductController.getTypes);
router.delete("/types/:type_id", authenticateToken, requireAdmin, ProductController.deleteType);

// Flavours (only for juice)
router.post("/flavours", authenticateToken, requireAdmin, ProductController.createFlavour);
router.get("/flavours", authenticateToken, ProductController.getFlavours);
router.delete("/flavours/:flavour_id", authenticateToken, requireAdmin, ProductController.deleteFlavour);

// Sizes
router.post("/sizes", authenticateToken, requireAdmin, ProductController.createSize);
router.get("/sizes", authenticateToken, ProductController.getSizes);
router.delete("/sizes/:size_id", authenticateToken, requireAdmin, ProductController.deleteSize);

// Shapes (normal/square)
router.post("/shapes", authenticateToken, requireAdmin, ProductController.createShape);
router.get("/shapes", authenticateToken, ProductController.getShapes);
router.delete("/shapes/:shape_id", authenticateToken, requireAdmin, ProductController.deleteShape);

// Products (brand + type + flavour? + size + shape)
router.post("/products", authenticateToken, requireAdmin, ProductController.createProduct);
router.get("/products", authenticateToken, ProductController.getProducts);
router.delete("/products/:product_id", authenticateToken, requireAdmin, ProductController.deleteProduct);

// Prices
router.post("/product-prices", authenticateToken, requireAdmin, ProductController.addPrice);
router.get("/product-prices/:product_id", authenticateToken, ProductController.getPrices);
router.put("/product-prices/:price_id", authenticateToken, requireAdmin, ProductController.updatePrice);
router.delete("/product-prices/:price_id", authenticateToken, requireAdmin, ProductController.deletePrice);
router.get("/products/list", authenticateToken, ProductController.getProductsList);

module.exports = router;