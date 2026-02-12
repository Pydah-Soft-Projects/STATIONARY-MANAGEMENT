const express = require("express");
const { connectDB } = require("./config/db"); // Assuming db.js is in a 'config' folder
const { connectMySQL } = require("./config/mysql");
const productRoutes = require("./routes/productRoutes");
const cors = require("cors");
const dotenv = require("dotenv");
const subAdminRoutes = require("./routes/subAdminRoutes");
const transactionRoutes = require("./routes/transactionRoutes");
const vendorRoutes = require("./routes/vendorRoutes");
const stockEntryRoutes = require("./routes/stockEntryRoutes");
const stockTransferRoutes = require("./routes/stockTransferRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const auditLogRoutes = require("./routes/auditLogRoutes");
const sqlStudentRoutes = require("./routes/sqlStudentRoutes");
const generalProductRoutes = require("./routes/generalProductRoutes");
const generalPurchaseRoutes = require("./routes/generalPurchaseRoutes");
const generalDistributionRoutes = require("./routes/generalDistributionRoutes");

dotenv.config();

const app = express();

// Connect to MongoDB
connectDB();
// Connect to MySQL
connectMySQL();

// CORS configuration
const allowedOrigins = [
  "https://pydah-stationary-management.vercel.app",
  "http://localhost:5173",
  "http://localhost:5000",
  "http://localhost:3000",
];

// Normalize origin for comparison (remove trailing slashes, convert to lowercase)
const normalizeOrigin = (origin) => {
  if (!origin) return null;
  return origin.trim().toLowerCase().replace(/\/+$/, '');
};

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }

    const normalizedOrigin = normalizeOrigin(origin);
    const normalizedAllowed = allowedOrigins.map(normalizeOrigin);

    // Check if origin is in allowed list (case-insensitive, trailing slash insensitive)
    if (normalizedAllowed.includes(normalizedOrigin)) {
      callback(null, true);
    } else {
      // Log for debugging
      console.log("CORS blocked request from:", origin);
      console.log("Normalized origin:", normalizedOrigin);
      console.log("Allowed origins:", allowedOrigins);
      // For development, allow all origins
      if (process.env.NODE_ENV === 'development') {
        callback(null, true);
      } else {
        // In production, be strict but log the issue
        console.error(`CORS Error: Origin ${origin} not allowed`);
        callback(new Error("Not allowed by CORS"));
      }
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-auth-token",
    "Origin",
    "Accept",
    "X-Requested-With",
  ],
  exposedHeaders: ["Authorization"],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204,
  maxAge: 86400, // 24 hours
};

// Enable CORS
app.use(cors(corsOptions));

// Additional CORS headers middleware (fallback - ensures headers are always set)
app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Normalize and check origin
  if (origin) {
    const normalizedOrigin = normalizeOrigin(origin);
    const normalizedAllowed = allowedOrigins.map(normalizeOrigin);

    if (normalizedAllowed.includes(normalizedOrigin)) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-auth-token, Origin, Accept, X-Requested-With');
    } else {
      // Log for debugging CORS issues
      if (req.path.includes('/api/sql')) {
        console.log(`[CORS Debug] SQL route request from origin: ${origin}`);
        console.log(`[CORS Debug] Normalized: ${normalizedOrigin}`);
        console.log(`[CORS Debug] Allowed origins: ${allowedOrigins.join(', ')}`);
      }
    }
  } else if (process.env.NODE_ENV === 'development') {
    // In development, allow requests without origin
    res.header('Access-Control-Allow-Origin', '*');
  }

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
});

// Middleware to parse JSON
app.use(express.json());

// Sample route
app.get("/", (req, res) => {
  res.send("Server is running.........! 😉😉😉😉😉😉");

});

// Mount product routes
app.use("/api/products", productRoutes);

// Mount sub-admin routes
app.use("/api", subAdminRoutes);
// Mount transaction routes
app.use("/api/transactions", transactionRoutes);
// Mount vendor routes
app.use("/api/vendors", vendorRoutes);
// Mount stock entry routes
app.use("/api/stock-entries", stockEntryRoutes);
app.use("/api/stock-transfers", stockTransferRoutes);
// Settings routes
app.use("/api/settings", settingsRoutes);
// Audit log routes
app.use("/api/audit-logs", auditLogRoutes);
// MySQL-backed student data
app.use("/api/sql", sqlStudentRoutes);
// General product and purchase routes
app.use("/api/general-products", generalProductRoutes);
app.use("/api/general-purchases", generalPurchaseRoutes);
app.use("/api/general-distributions", generalDistributionRoutes);

// SQL Academic Routes (Courses, Branches)
const sqlAcademicRoutes = require("./routes/sqlAcademicRoutes");
app.use("/api/sql/academic", sqlAcademicRoutes);

// SQL Dues Routes
const sqlDuesRoutes = require("./routes/sqlDuesRoutes");
app.use("/api/sql", sqlDuesRoutes); // Mounts as /api/sql/dues

// Error handling middleware (must be after all routes)
app.use((err, req, res, next) => {
  // Set CORS headers even for errors
  const origin = req.headers.origin;
  if (origin) {
    const normalizedOrigin = normalizeOrigin(origin);
    const normalizedAllowed = allowedOrigins.map(normalizeOrigin);
    if (normalizedAllowed.includes(normalizedOrigin)) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
    }
  }

  console.error("Error:", err);
  console.error("Stack:", err.stack);
  const statusCode = err.statusCode || res.statusCode || 500;
  res.status(statusCode).json({
    message: err.message || "Internal Server Error",
    error: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
});

// 404 handler
app.use((req, res) => {
  // Set CORS headers even for 404 errors
  const origin = req.headers.origin;
  if (origin) {
    const normalizedOrigin = normalizeOrigin(origin);
    const normalizedAllowed = allowedOrigins.map(normalizeOrigin);
    if (normalizedAllowed.includes(normalizedOrigin)) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
    }
  }

  res.status(404).json({ message: "Route not found" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
  console.log("Enjoy your day! 😉");
});
