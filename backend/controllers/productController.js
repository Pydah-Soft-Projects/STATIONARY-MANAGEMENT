const { Product } = require('../models/productModel');
const { College } = require('../models/collegeModel');

const sanitizeSetItems = async (setItems) => {
  if (!Array.isArray(setItems) || setItems.length === 0) return [];

  const normalizedItems = setItems
    .map((item) => {
      const productId = item?.productId || item?.product || item?._id;
      if (!productId) return null;
      const quantityRaw = Number(item?.quantity);
      const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? Math.round(quantityRaw) : 1;
      return { productId, quantity };
    })
    .filter(Boolean);

  if (normalizedItems.length === 0) return [];

  const productIds = [...new Set(normalizedItems.map((item) => String(item.productId)))];

  const existingProducts = await Product.find({
    _id: { $in: productIds },
    $or: [{ isSet: { $exists: false } }, { isSet: false }],
  }).select('name price');

  const existingMap = new Map(existingProducts.map((prod) => [String(prod._id), prod]));

  return normalizedItems
    .map((item) => {
      const match = existingMap.get(String(item.productId));
      if (!match) return null;
      return {
        product: match._id,
        quantity: item.quantity,
        productNameSnapshot: match.name,
        productPriceSnapshot: match.price,
      };
    })
    .filter(Boolean);
};

/**
 * @desc    Create a new product
 * @route   POST /api/products
 * @access  Public
 */
const createProduct = async (req, res) => {
  try {

    console.log('POST /api/products body:', req.body);
    // Diagnostic: print the year schema options to ensure the loaded schema allows year=0
    try {
      console.log('Product.year schema options:', Product.schema.path('year') && Product.schema.path('year').options);
    } catch (diagErr) {
      console.warn('Could not read Product schema year options:', diagErr);
    }
    const { name, description, price, stock, imageUrl, forCourse, branch, years, year, remarks, isSet, setItems, lowStockThreshold, semesters, collegeId } = req.body;
    // Handle years array - if years is provided, use it; otherwise fallback to year for backward compatibility
    let parsedYears = [];
    if (years && Array.isArray(years)) {
      parsedYears = years.map(y => Number(y)).filter(y => !isNaN(y) && y >= 0 && y <= 10);
    } else if (year !== undefined && year !== null && year !== '') {
      const parsedYear = Number(year);
      if (!isNaN(parsedYear) && parsedYear >= 0 && parsedYear <= 10) {
        parsedYears = parsedYear === 0 ? [] : [parsedYear]; // 0 means all years (empty array)
      }
    }

    // Handle branch array - if branch is provided as array, use it; otherwise handle string for backward compatibility
    let parsedBranches = [];
    if (branch !== undefined && branch !== null) {
      if (Array.isArray(branch)) {
        parsedBranches = branch.filter(b => typeof b === 'string' && b.trim().length > 0).map(b => b.trim());
      } else if (typeof branch === 'string' && branch.trim().length > 0) {
        parsedBranches = [branch.trim()]; // Convert single string to array for backward compatibility
      }
    }

    // sanitize numeric fields
    const parsedPrice = price !== undefined && price !== null && price !== '' ? Number(price) : 0;
    let parsedStock = stock !== undefined && stock !== null && stock !== '' ? Number(stock) : 0;

    const sanitizedSetItems = isSet ? await sanitizeSetItems(setItems) : [];
    if (isSet && sanitizedSetItems.length === 0) {
      return res.status(400).json({ message: 'Set products must include at least one existing item' });
    }
    if (isSet) {
      parsedStock = parsedStock < 0 ? 0 : parsedStock;
    }

    const thresholdNumber = lowStockThreshold !== undefined && lowStockThreshold !== null && lowStockThreshold !== ''
      ? Math.max(0, Number(lowStockThreshold) || 0)
      : undefined;

    const product = new Product({
      name,
      description: description || '', // Description is optional, can be added later
      price: parsedPrice,
      category: 'Other', // Default category since we're removing it from form
      stock: parsedStock,
      imageUrl,
      forCourse: forCourse || '',
      branch: parsedBranches,
      years: parsedYears,
      year: parsedYears.length === 1 ? parsedYears[0] : (parsedYears.length === 0 ? 0 : parsedYears[0]), // Backward compatibility
      remarks: remarks || '',
      lastPriceUpdated: new Date(), // Set initial price update date
      isSet: Boolean(isSet),
      setItems: sanitizedSetItems,
      lowStockThreshold: Boolean(isSet) ? 0 : thresholdNumber,
      semesters: (semesters || []).map(Number).filter(s => s === 1 || s === 2),
      stock: collegeId ? 0 : parsedStock, // If collegeId, central stock is 0
    });

    const createdProduct = await product.save();

    // If collegeId is provided and there's initial stock, add it to the college
    if (collegeId && parsedStock > 0) {
      const college = await College.findById(collegeId);
      if (college) {
        if (!college.stock) college.stock = [];
        college.stock.push({ product: createdProduct._id, quantity: parsedStock });
        await college.save();
        console.log(`Initialized stock for product ${name} in college ${college.name} with ${parsedStock}`);
      }
    }
    await createdProduct.populate({ path: 'setItems.product', select: 'name price isSet' });
    console.log('Created product id:', createdProduct._id);
    res.status(201).json(createdProduct);
  } catch (error) {
    console.error('Error in createProduct:', error.stack || error.message || error);
    res.status(400).json({ message: 'Error creating product', error: error.message });
  }
};

/**
 * @desc    Get all products
 * @route   GET /api/products
 * @access  Public
 */
const getProducts = async (req, res) => {
  try {
    const filter = {};
    // optional query param: ?course=b.tech to fetch products only for that course
    if (req.query.course) filter.forCourse = req.query.course;
    if (req.query.year) {
      const py = Number(req.query.year);
      if (!isNaN(py)) {
        // Support both year field and years array
        filter.$or = [
          { year: py },
          { years: py }
        ];
      }
    }
    const products = await Product.find(filter).populate({ path: 'setItems.product', select: 'name price isSet' });
    res.status(200).json(products);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching products', error: error.message });
  }
};

/**
 * @desc    Get a single product by ID
 * @route   GET /api/products/:id
 * @access  Public
 */
const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate({ path: 'setItems.product', select: 'name price isSet' });

    if (product) {
      res.status(200).json(product);
    } else {
      res.status(404).json({ message: 'Product not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error fetching product', error: error.message });
  }
};

/**
 * @desc    Update a product
 * @route   PUT /api/products/:id
 * @access  Public
 */
const updateProduct = async (req, res) => {
  try {
    console.log(`PUT /api/products/${req.params.id} body:`, req.body);
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    // Track old name for updating transactions if name changes
    const oldName = product.name;

    const { name, description, price, stock, imageUrl, forCourse, branch, years, year, remarks, isSet, setItems, lowStockThreshold, semesters } = req.body;
    // Handle years array - if years is provided, use it; otherwise fallback to year for backward compatibility
    let parsedYears = undefined;
    if (years !== undefined && Array.isArray(years)) {
      parsedYears = years.map(y => Number(y)).filter(y => !isNaN(y) && y >= 0 && y <= 10);
    } else if (year !== undefined && year !== null && year !== '') {
      const parsedYear = Number(year);
      if (!isNaN(parsedYear) && parsedYear >= 0 && parsedYear <= 10) {
        parsedYears = parsedYear === 0 ? [] : [parsedYear];
      }
    }

    // Handle branch array - if branch is provided as array, use it; otherwise handle string for backward compatibility
    let parsedBranches = undefined;
    if (branch !== undefined && branch !== null) {
      if (Array.isArray(branch)) {
        parsedBranches = branch.filter(b => typeof b === 'string' && b.trim().length > 0).map(b => b.trim());
      } else if (typeof branch === 'string' && branch.trim().length > 0) {
        parsedBranches = [branch.trim()]; // Convert single string to array for backward compatibility
      } else {
        parsedBranches = []; // Empty array if branch is empty string or null
      }
    }

    // Track price change before updating
    const oldPrice = product.price;
    let newPrice = product.price;
    if (price !== undefined && price !== null && price !== '') {
      const parsed = Number(price);
      newPrice = !isNaN(parsed) ? parsed : product.price;
    }

    // If price is being changed, add old price to history and update timestamp
    if (price !== undefined && price !== null && price !== '' && newPrice !== oldPrice) {
      // Initialize price history if it doesn't exist
      if (!product.priceHistory || !Array.isArray(product.priceHistory)) {
        product.priceHistory = [];
      }
      // Add old price to history before updating to new price
      product.priceHistory.push({
        price: oldPrice,
        updatedAt: new Date(),
        updatedBy: 'System',
      });
      // Update timestamp for price change
      product.lastPriceUpdated = new Date();
    }

    product.name = name ?? product.name;
    product.description = description ?? product.description;
    product.price = newPrice;
    // If collegeId is provided, we update college stock instead of global stock
    const { collegeId } = req.body;
    if (collegeId) {
      const college = await College.findById(collegeId);
      if (college) {
        if (!college.stock) college.stock = [];

        const stockIndex = college.stock.findIndex(item => item.product.toString() === product._id.toString());

        let newQuantity = 0;
        if (stock !== undefined && stock !== null) {
          const parsed = Number(stock);
          newQuantity = (!isNaN(parsed) && parsed >= 0) ? parsed : 0;
        }

        if (stockIndex !== -1) {
          college.stock[stockIndex].quantity = newQuantity;
        } else {
          college.stock.push({ product: product._id, quantity: newQuantity });
        }

        await college.save();
        console.log(`Updated stock for product ${product.name} in college ${college.name} to ${newQuantity}`);
      }
    } else {
      // Only update product.stock if NOT updating a specific college
      if (stock !== undefined && stock !== null) {
        const parsedStock = Number(stock);
        product.stock = (stock === '' || isNaN(parsedStock)) ? 0 : parsedStock;
      }
    }
    product.imageUrl = imageUrl ?? product.imageUrl;
    product.forCourse = forCourse ?? product.forCourse;
    if (parsedBranches !== undefined) {
      product.branch = parsedBranches;
    }
    if (parsedYears !== undefined) {
      product.years = parsedYears;
      product.year = parsedYears.length === 1 ? parsedYears[0] : (parsedYears.length === 0 ? 0 : parsedYears[0]); // Backward compatibility
    }
    if (semesters !== undefined) {
      product.semesters = Array.isArray(semesters) ? semesters.map(Number).filter(s => s === 1 || s === 2) : [];
    }
    product.remarks = remarks !== undefined ? remarks : product.remarks;

    // Robust parsing for isSet to handle string "false" from FormData or loose typing
    let isSetFlag = product.isSet;
    if (isSet !== undefined) {
      if (typeof isSet === 'string') {
        isSetFlag = (isSet.toLowerCase() === 'true');
      } else {
        isSetFlag = Boolean(isSet);
      }
    }
    let sanitizedSetItems = product.setItems;

    if (isSetFlag) {
      const incomingSetItems = setItems !== undefined ? setItems : product.setItems;
      sanitizedSetItems = await sanitizeSetItems(incomingSetItems);
      if (sanitizedSetItems.length === 0) {
        return res.status(400).json({ message: 'Set products must include at least one existing item' });
      }
    }

    product.isSet = isSetFlag;
    if (product.isSet) {
      product.setItems = sanitizedSetItems;
      if (product.stock < 0) {
        product.stock = 0;
      }
      product.lowStockThreshold = 0;
    } else if (isSet !== undefined && !product.isSet) {
      product.setItems = [];
    }

    if (!product.isSet && lowStockThreshold !== undefined) {
      const thresholdNumber = Math.max(0, Number(lowStockThreshold) || 0);
      product.lowStockThreshold = thresholdNumber;
    }

    const updated = await product.save();
    await updated.populate({ path: 'setItems.product', select: 'name price isSet' });

    // If the product name changed, update it in all related records
    const newName = updated.name;
    if (oldName !== newName) {
      try {
        const { Transaction } = require('../models/transactionModel');
        const { User } = require('../models/userModel');

        // Helper to convert product name to items key format
        const nameToKey = (name) => name?.toLowerCase().replace(/\s+/g, '_') || '';
        const oldKey = nameToKey(oldName);
        const newKey = nameToKey(newName);

        // Update product name in transaction items
        await Transaction.updateMany(
          { 'items.productId': updated._id },
          { $set: { 'items.$[item].name': newName } },
          { arrayFilters: [{ 'item.productId': updated._id }] }
        );

        // Update product name in setComponents (when this product is part of a set)
        await Transaction.updateMany(
          { 'items.setComponents.productId': updated._id },
          { $set: { 'items.$[].setComponents.$[comp].name': newName } },
          { arrayFilters: [{ 'comp.productId': updated._id }] }
        );

        // Also update productNameSnapshot in other products' setItems that reference this product
        await Product.updateMany(
          { 'setItems.product': updated._id },
          { $set: { 'setItems.$[item].productNameSnapshot': newName } },
          { arrayFilters: [{ 'item.product': updated._id }] }
        );

        // Update the items key in all students who have this product
        // Rename the key from old name format to new name format
        if (oldKey && newKey && oldKey !== newKey) {
          // Find all users who have the old key in their items
          const usersWithOldKey = await User.find({ [`items.${oldKey}`]: { $exists: true } });

          for (const user of usersWithOldKey) {
            const oldValue = user.items[oldKey];
            // Use $unset to remove old key and $set to add new key
            await User.updateOne(
              { _id: user._id },
              {
                $unset: { [`items.${oldKey}`]: "" },
                $set: { [`items.${newKey}`]: oldValue }
              }
            );
          }

          console.log(`Updated items key from "${oldKey}" to "${newKey}" for ${usersWithOldKey.length} students`);
        }

        console.log(`Product name updated from "${oldName}" to "${newName}" in all transactions and sets`);
      } catch (syncError) {
        // Log but don't fail the update if transaction sync fails
        console.error('Failed to sync product name to related records:', syncError);
      }
    }

    res.json(updated);
  } catch (error) {
    console.error('Update Product Error:', error);
    res.status(400).json({ message: 'Error updating product', error: error.message });
  }
};

/**
 * @desc    Delete a product
 * @route   DELETE /api/products/:id
 * @access  Public
 */
const deleteProduct = async (req, res) => {
  try {
    console.log('DELETE /api/products called with id:', req.params.id);
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    console.log('Product deleted from products collection:', product._id);

    // Also remove this product key from any user's items map (if present)
    try {
      const key = product.name.toLowerCase().replace(/\s+/g, '_');
      const { User } = require('../models/userModel');
      // Unset the nested items.<key> field for all users
      await User.updateMany({ [`items.${key}`]: { $exists: true } }, { $unset: { [`items.${key}`]: "" } });
    } catch (innerErr) {
      // Log but don't fail the deletion if user update fails
      console.error('Failed to remove item key from users:', innerErr);
    }

    res.json({ message: 'Product removed' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting product', error: error.message });
  }
};

module.exports = { createProduct, getProducts, getProductById, updateProduct, deleteProduct };