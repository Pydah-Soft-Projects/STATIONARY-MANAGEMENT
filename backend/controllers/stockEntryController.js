const { StockEntry } = require('../models/stockEntryModel');
const { Product } = require('../models/productModel');
const { Vendor } = require('../models/vendorModel');

/**
 * @desc    Create a new stock entry and update product stock
 * @route   POST /api/stock-entries
 * @access  Public
 */
const createStockEntry = async (req, res) => {
  try {
    const { 
      // Shared fields
      vendor, invoiceNumber, invoiceDate, remarks, createdBy, college, 
      // Legacy single fields
      product, quantity, purchasePrice,
      // Batch fields
      items 
    } = req.body;

    // Normalize items into array
    let stockItems = [];
    if (items && Array.isArray(items) && items.length > 0) {
      stockItems = items;
    } else if (product && quantity) {
      stockItems = [{ product, quantity, purchasePrice }];
    } else {
      return res.status(400).json({ message: 'No items provided for stock entry' });
    }

    if (!vendor) {
      return res.status(400).json({ message: 'Vendor is required' });
    }

    // Verify vendor exists
    const vendorDoc = await Vendor.findById(vendor);
    if (!vendorDoc) {
      return res.status(404).json({ message: 'Vendor not found' });
    }

    // Verify college if provided
    let collegeDoc = null;
    if (college) {
      const { College } = require('../models/collegeModel');
      collegeDoc = await College.findById(college);
      if (!collegeDoc) {
        return res.status(404).json({ message: 'Destination college not found' });
      }
    }

    // Process each item
    const createdEntries = [];
    const errors = [];

    // Pre-load current College stock if applicable
    const collegeStockMap = new Map();
    if (collegeDoc) {
        collegeDoc.stock.forEach(s => collegeStockMap.set(s.product.toString(), s));
    }

    for (const item of stockItems) {
      try {
        if (!item.product || !item.quantity || item.quantity < 1) {
           errors.push({ item, error: 'Invalid product or quantity' });
           continue; 
        }
        
        const productDoc = await Product.findById(item.product);
        if (!productDoc) {
           errors.push({ item, error: 'Product not found' });
           continue;
        }

        const totalCost = (item.purchasePrice || 0) * item.quantity;

        const stockEntry = new StockEntry({
          product: item.product,
          vendor,
          college: college || null,
          quantity: item.quantity,
          invoiceNumber: invoiceNumber?.trim() || '',
          invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
          purchasePrice: item.purchasePrice || 0,
          totalCost,
          remarks: remarks?.trim() || '',
          createdBy: createdBy?.trim() || 'System',
        });

        const savedEntry = await stockEntry.save();
        createdEntries.push(savedEntry);

        // Update Central Stock if not for a college
        if (!collegeDoc) {
           productDoc.stock = (productDoc.stock || 0) + Number(item.quantity);
           await productDoc.save();
        }

      } catch (err) {
        errors.push({ item, error: err.message });
      }
    }

    // Save College Doc once if needed
    if (collegeDoc) {
        // We need to re-apply the logic properly.
        // Let's iterate stockItems again to apply to collegeDoc to ensure we didn't miss anything or mess up async
        // Actually, the previous loop didn't apply to collegeDoc correctly because of the map complexity.
        // Let's do it cleanly:
        
        // 1. Map productID -> totalQty from the batch
        const batchQtyMap = new Map();
        createdEntries.forEach(entry => {
             const pid = entry.product.toString();
             const qty = entry.quantity;
             batchQtyMap.set(pid, (batchQtyMap.get(pid) || 0) + qty);
        });

        // 2. Update College Doc
        batchQtyMap.forEach((qty, pid) => {
             const existingInfo = collegeDoc.stock.find(s => s.product.toString() === pid);
             if (existingInfo) {
                 existingInfo.quantity = (existingInfo.quantity || 0) + qty;
             } else {
                 collegeDoc.stock.push({ product: pid, quantity: qty });
             }
        });
        
        await collegeDoc.save();
    }

    if (createdEntries.length === 0 && errors.length > 0) {
        return res.status(400).json({ message: 'Failed to create entries', errors });
    }

    // Return success (maybe partial)
    res.status(201).json({ 
        message: `Successfully created ${createdEntries.length} entries`, 
        entries: createdEntries,
        errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Error in createStockEntry:', error);
    res.status(400).json({ message: 'Error creating stock entry', error: error.message });
  }
};

/**
 * @desc    Get all stock entries
 * @route   GET /api/stock-entries
 * @access  Public
 */
const getStockEntries = async (req, res) => {
  try {
    const { product, vendor, startDate, endDate, college } = req.query;
    const filter = {};

    if (product) filter.product = product;
    if (vendor) filter.vendor = vendor;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }
    if (college) {
      if (college === 'central') {
        // Entries for central warehouse have no college assigned
        filter.college = { $in: [null, undefined] };
      } else {
        filter.college = college;
      }
    }

    const stockEntries = await StockEntry.find(filter)
      .populate('product', 'name price')
      .populate('vendor', 'name')
      .populate('college', 'name')
      .sort({ createdAt: -1 });

    res.status(200).json(stockEntries);
  } catch (error) {
    console.error('Error in getStockEntries:', error);
    res.status(500).json({ message: 'Error fetching stock entries', error: error.message });
  }
};

/**
 * @desc    Get a single stock entry by ID
 * @route   GET /api/stock-entries/:id
 * @access  Public
 */
const getStockEntryById = async (req, res) => {
  try {
    const stockEntry = await StockEntry.findById(req.params.id)
      .populate('product', 'name price stock')
      .populate('vendor', 'name contactPerson email phone')
      .populate('college', 'name');

    if (stockEntry) {
      res.status(200).json(stockEntry);
    } else {
      res.status(404).json({ message: 'Stock entry not found' });
    }
  } catch (error) {
    console.error('Error in getStockEntryById:', error);
    res.status(500).json({ message: 'Error fetching stock entry', error: error.message });
  }
};

/**
 * @desc    Update a stock entry
 * @route   PUT /api/stock-entries/:id
 * @access  Public
 */
const updateStockEntry = async (req, res) => {
  try {
    const stockEntry = await StockEntry.findById(req.params.id);
    if (!stockEntry) {
      return res.status(404).json({ message: 'Stock entry not found' });
    }

    const { quantity, invoiceNumber, invoiceDate, purchasePrice, remarks } = req.body;
    // Convert to numbers to ensure proper comparison
    const oldQuantity = Number(stockEntry.quantity) || 0;
    const newQuantity = quantity !== undefined ? Number(quantity) : oldQuantity;
    const oldProductId = stockEntry.product.toString();

    // If quantity is being changed, update stock accordingly
    // Use strict numeric comparison to avoid type coercion issues
    if (quantity !== undefined && newQuantity !== oldQuantity) {
      const quantityDiff = newQuantity - oldQuantity;
      
      if (stockEntry.college) {
        const { College } = require('../models/collegeModel');
        const college = await College.findById(stockEntry.college);
        if (college) {
          const stockItem = college.stock.find(s => s.product.toString() === oldProductId);
          if (stockItem) {
            // Calculate new stock: current stock - old entry quantity + new entry quantity
            // This ensures we're replacing the old entry's contribution, not adding on top
            const currentStock = Number(stockItem.quantity) || 0;
            const newStock = currentStock - oldQuantity + newQuantity;
            
            if (newStock < 0) {
              return res.status(400).json({ message: 'Cannot reduce college stock below 0' });
            }
            stockItem.quantity = newStock;
          } else if (quantityDiff > 0) {
            // If stock item doesn't exist, only add if we're increasing
            college.stock.push({ product: oldProductId, quantity: newQuantity });
          } else {
            return res.status(400).json({ message: 'Insufficient college stock to reduce' });
          }
          await college.save();
        }
      } else {
        const product = await Product.findById(stockEntry.product);
        if (!product) {
          return res.status(404).json({ message: 'Product not found' });
        }

        // Calculate new stock: current stock - old entry quantity + new entry quantity
        const currentStock = Number(product.stock) || 0;
        const newStock = currentStock - oldQuantity + newQuantity;
        
        if (newStock < 0) {
          return res.status(400).json({ message: 'Cannot reduce central stock below 0' });
        }
        product.stock = newStock;
        await product.save();
      }
    }

    // Update stock entry fields
    if (quantity !== undefined) {
      stockEntry.quantity = newQuantity;
      // Recalculate total cost
      stockEntry.totalCost = (stockEntry.purchasePrice || 0) * newQuantity;
    }
    if (invoiceNumber !== undefined) stockEntry.invoiceNumber = invoiceNumber?.trim() || '';
    if (invoiceDate !== undefined) stockEntry.invoiceDate = new Date(invoiceDate);
    if (purchasePrice !== undefined) {
      stockEntry.purchasePrice = purchasePrice;
      // Recalculate total cost using current quantity (newQuantity if quantity was updated, otherwise oldQuantity)
      const currentQuantity = quantity !== undefined ? newQuantity : oldQuantity;
      stockEntry.totalCost = purchasePrice * currentQuantity;
    }
    if (remarks !== undefined) stockEntry.remarks = remarks?.trim() || '';

    const updated = await stockEntry.save();
    await updated.populate('product', 'name price');
    await updated.populate('vendor', 'name');

    res.json(updated);
  } catch (error) {
    console.error('Error in updateStockEntry:', error);
    res.status(400).json({ message: 'Error updating stock entry', error: error.message });
  }
};

/**
 * @desc    Delete a stock entry and restore product stock
 * @route   DELETE /api/stock-entries/:id
 * @access  Public
 */
const deleteStockEntry = async (req, res) => {
  try {
    const stockEntry = await StockEntry.findById(req.params.id);
    if (!stockEntry) {
      return res.status(404).json({ message: 'Stock entry not found' });
    }

    // Revert stock changes
    if (stockEntry.college) {
      const { College } = require('../models/collegeModel');
      const college = await College.findById(stockEntry.college);
      if (college) {
        const stockItem = college.stock.find(s => s.product.toString() === stockEntry.product.toString());
        if (stockItem) {
          stockItem.quantity = Math.max(0, (stockItem.quantity || 0) - stockEntry.quantity);
          // Optional: remove if 0? Let's keep for consistency with other parts
          await college.save();
        }
      }
    } else {
      const product = await Product.findById(stockEntry.product);
      if (product) {
        product.stock = Math.max(0, (product.stock || 0) - stockEntry.quantity);
        await product.save();
      }
    }

    await StockEntry.findByIdAndDelete(req.params.id);

    res.json({ message: 'Stock entry removed' });
  } catch (error) {
    console.error('Error in deleteStockEntry:', error);
    res.status(500).json({ message: 'Error deleting stock entry', error: error.message });
  }
};

module.exports = {
  createStockEntry,
  getStockEntries,
  getStockEntryById,
  updateStockEntry,
  deleteStockEntry,
};

