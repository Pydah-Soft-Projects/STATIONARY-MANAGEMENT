const { GeneralProduct } = require('../models/generalProductModel');
const { College } = require('../models/collegeModel');
const asyncHandler = require('express-async-handler');

/**
 * @desc    Create a new general product
 * @route   POST /api/general-products
 * @access  Public
 */
const createProduct = asyncHandler(async (req, res) => {
  const { name, description, category, price, lowStockThreshold, initialStock, collegeId } = req.body;

  if (!name) {
    res.status(400);
    throw new Error('Product name is required');
  }

  // Check if product already exists
  const existingProduct = await GeneralProduct.findOne({ name });
  if (existingProduct) {
    res.status(400);
    throw new Error('Product with this name already exists');
  }

  const product = await GeneralProduct.create({
    name,
    description: description || '',
    category: category || 'General',
    price: price !== undefined ? Number(price) : 0,
    lowStockThreshold: Number(lowStockThreshold) || 10,
  });

  // If initial stock and collegeId provided, add it to the college
  if (collegeId && initialStock && Number(initialStock) > 0) {
    const college = await College.findById(collegeId);
    if (college) {
      if (!college.generalStock) college.generalStock = [];
      
      const stockIndex = college.generalStock.findIndex(
        s => s.product.toString() === product._id.toString()
      );

      if (stockIndex >= 0) {
        college.generalStock[stockIndex].quantity += Number(initialStock);
      } else {
        college.generalStock.push({
          product: product._id,
          quantity: Number(initialStock),
        });
      }
      
      await college.save();
      console.log(`Initialized stock for general product ${name} in college ${college.name} with ${initialStock}`);
    }
  }

  res.status(201).json(product);
});

/**
 * @desc    Get all general products
 * @route   GET /api/general-products
 * @access  Public
 */
const getAllProducts = asyncHandler(async (req, res) => {
  const { isActive, category } = req.query;

  const filter = {};

  if (isActive !== undefined && isActive !== '') {
    filter.isActive = isActive === 'true';
  }

  if (category) {
    filter.category = category;
  }

  const products = await GeneralProduct.find(filter).sort({ name: 1 });

  res.status(200).json(products);
});

/**
 * @desc    Get product by ID
 * @route   GET /api/general-products/:id
 * @access  Public
 */
const getProductById = asyncHandler(async (req, res) => {
  const product = await GeneralProduct.findById(req.params.id);

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  res.status(200).json(product);
});

/**
 * @desc    Update a product
 * @route   PUT /api/general-products/:id
 * @access  Public
 */
const updateProduct = asyncHandler(async (req, res) => {
  const product = await GeneralProduct.findById(req.params.id);

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  const { name, description, category, price, lowStockThreshold, imageUrl, isActive } = req.body;

  // Check if name is being changed and if it conflicts
  if (name && name !== product.name) {
    const existingProduct = await GeneralProduct.findOne({ name });
    if (existingProduct) {
      res.status(400);
      throw new Error('Product with this name already exists');
    }
    product.name = name;
  }

  if (description !== undefined) product.description = description;
  if (category !== undefined) product.category = category;
  if (price !== undefined) product.price = Number(price);
  if (lowStockThreshold !== undefined) product.lowStockThreshold = Number(lowStockThreshold);
  if (imageUrl !== undefined) product.imageUrl = imageUrl;
  if (isActive !== undefined) product.isActive = isActive;

  const updatedProduct = await product.save();
  res.status(200).json(updatedProduct);
});

/**
 * @desc    Delete a product
 * @route   DELETE /api/general-products/:id
 * @access  Public
 */
const deleteProduct = asyncHandler(async (req, res) => {
  const product = await GeneralProduct.findById(req.params.id);

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  // Remove from all college general stocks
  await College.updateMany(
    { 'generalStock.product': req.params.id },
    { $pull: { generalStock: { product: req.params.id } } }
  );

  await GeneralProduct.findByIdAndDelete(req.params.id);
  res.status(200).json({ message: 'Product deleted successfully' });
});

/**
 * @desc    Add stock to a product at a specific college
 * @route   POST /api/general-products/:id/add-stock
 * @access  Public
 */
const addStock = asyncHandler(async (req, res) => {
  const product = await GeneralProduct.findById(req.params.id);

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  const { quantity, collegeId } = req.body;

  if (quantity === undefined || Number(quantity) <= 0) {
    res.status(400);
    throw new Error('Quantity must be a positive number');
  }

  if (!collegeId) {
    res.status(400);
    throw new Error('College ID is required');
  }

  const college = await College.findById(collegeId);
  if (!college) {
    res.status(404);
    throw new Error('College not found');
  }

  // Find existing stock entry for this product
  const stockIndex = college.generalStock.findIndex(
    s => s.product.toString() === req.params.id
  );

  if (stockIndex >= 0) {
    // Update existing stock
    college.generalStock[stockIndex].quantity += Number(quantity);
  } else {
    // Add new stock entry
    college.generalStock.push({
      product: req.params.id,
      quantity: Number(quantity),
    });
  }

  await college.save();

  res.status(200).json({ 
    message: 'Stock added successfully',
    college: college.name,
    product: product.name,
    newQuantity: stockIndex >= 0 ? college.generalStock[stockIndex].quantity : Number(quantity)
  });
});

/**
 * @desc    Get college general stock
 * @route   GET /api/general-products/colleges/:collegeId/stock
 * @access  Public
 */
const getCollegeStock = asyncHandler(async (req, res) => {
  const college = await College.findById(req.params.collegeId)
    .populate('generalStock.product');

  if (!college) {
    res.status(404);
    throw new Error('College not found');
  }

  res.status(200).json({
    _id: college._id,
    name: college.name,
    generalStock: college.generalStock,
  });
});

module.exports = {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  addStock,
  getCollegeStock,
};
