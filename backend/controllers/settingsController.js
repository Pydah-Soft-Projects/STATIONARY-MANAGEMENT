const asyncHandler = require('express-async-handler');
const { Settings } = require('../models/settingsModel');
const { getMySqlPool } = require('../config/mysql');

const ensureSettings = async () => {
  let settings = await Settings.findOne();
  if (!settings) {
    settings = await Settings.create({});
  }
  return settings;
};

const getSettings = asyncHandler(async (req, res) => {
  const { course } = req.query; // Optional course parameter for receipt settings
  
  const settings = await ensureSettings();
  
  // If course is specified, try to get course-specific receipt settings from MySQL
  if (course) {
    const normalizeCourse = (value) => {
      if (!value) return '';
      return String(value).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    };
    
    const normalizedCourse = normalizeCourse(course);
    
    try {
      const pool = getMySqlPool();
      if (pool) {
        // Fetch course from MySQL to check for metadata overrides
        // We match by name since we don't have ID here
        // Note: 'receipt_header' and 'receipt_subheader' columns removed as they don't exist in DB schema yet.
        // We rely on 'metadata' JSON field for overrides.
        const [rows] = await pool.query("SELECT name, metadata FROM courses WHERE is_active = 1");
        
        const courseConfig = rows.find(c => normalizeCourse(c.name) === normalizedCourse);
        
        // If course config exists, use course-specific receipt headers with fallback to global
        if (courseConfig) {
          // Check for direct columns (if added in future) or metadata JSON
          let header = null; // courseConfig.receipt_header; (Column does not exist)
          let subheader = null; // courseConfig.receipt_subheader; (Column does not exist)

          // If not in columns, check metadata
          if (!header || !subheader) {
            const metadata = typeof courseConfig.metadata === 'string' 
              ? JSON.parse(courseConfig.metadata || '{}') 
              : (courseConfig.metadata || {});
            
            if (!header) header = metadata.receipt_header || metadata.receiptHeader;
            if (!subheader) subheader = metadata.receipt_subheader || metadata.receiptSubheader;
          }

          if (header || subheader) {
            return res.json({
              // App branding (always from global settings)
              appName: settings.appName || settings.receiptHeader,
              appSubheader: settings.appSubheader || settings.receiptSubheader,
              // Receipt settings (course-specific if configured)
              receiptHeader: header || settings.receiptHeader,
              receiptSubheader: subheader || settings.receiptSubheader,
              updatedAt: settings.updatedAt,
              course: courseConfig.name,
            });
          }
        }
      }
    } catch (err) {
      console.warn("Error fetching course settings from MySQL:", err);
      // Fallback to global settings on error
    }
  }
  
  // Return all settings (app branding + receipt settings)
  res.json({
    appName: settings.appName || settings.receiptHeader,
    appSubheader: settings.appSubheader || settings.receiptSubheader,
    receiptHeader: settings.receiptHeader,
    receiptSubheader: settings.receiptSubheader,
    updatedAt: settings.updatedAt,
  });
});

const updateSettings = asyncHandler(async (req, res) => {
  const { appName, appSubheader, receiptHeader, receiptSubheader } = req.body || {};
  const settings = await ensureSettings();

  // Update app branding
  if (appName !== undefined) {
    settings.appName = String(appName).trim();
  }

  if (appSubheader !== undefined) {
    settings.appSubheader = String(appSubheader).trim();
  }

  // Update receipt headers
  if (receiptHeader !== undefined) {
    settings.receiptHeader = String(receiptHeader).trim();
  }

  if (receiptSubheader !== undefined) {
    settings.receiptSubheader = String(receiptSubheader).trim();
  }

  await settings.save();

  res.json({
    appName: settings.appName || settings.receiptHeader,
    appSubheader: settings.appSubheader || settings.receiptSubheader,
    receiptHeader: settings.receiptHeader,
    receiptSubheader: settings.receiptSubheader,
    updatedAt: settings.updatedAt,
  });
});

module.exports = { getSettings, updateSettings };

