// controllers/AdminController.js
const util = require("util"); // Core Node.js module used to promisify callback-based functions
let PDFDocument = null; // Variable to hold the lazy-loaded pdfkit module (for receipt generation)
const Order = require("../models/order"); // Model for database interaction with 'orders' table
const Product = require("../models/supermarket"); // Model for database interaction with 'products' table

// Helper function to format timestamps into a localized Singapore string format (en-SG)
const formatDateTime = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-SG", { hour12: false });
};

// ======================================
// CONFIGURATION CONSTANTS FOR DASHBOARD
// ======================================
const LOW_STOCK_THRESHOLD = 10;
const LOW_STOCK_LIMIT = 5;
const RECENT_ORDERS_LIMIT = 5;
const DAILY_SALES_DAYS = 7;
const SALES_HOURS_WINDOW = 24;
const ORDER_STATUSES = ["pending", "processing", "completed"]; // Defined valid states for an order
const DEFAULT_STATUS = ORDER_STATUSES[0];

// ======================================
// PROMISIFIED MODEL FUNCTIONS
// Promisifying converts callback-based model methods to return Promises,
// enabling the use of modern async/await syntax in the controller.
// ======================================
const listOrdersAsync = util.promisify(Order.listAllWithUsers);
const productCountAsync = util.promisify(Product.countAll);
const lowStockAsync = util.promisify(Product.getLowStock);
const orderDetailAsync = util.promisify(Order.getOrderWithItems);
const updateStatusAsync = util.promisify(Order.updateOrderStatus);
const bestSellersAsync = util.promisify(Order.getBestSellingProducts);
const categorySalesAsync = util.promisify(Order.getSalesByCategory);
const hourlySalesAsync = util.promisify(Order.getSalesByHourRange);
const returningCustomersAsync = util.promisify(Order.getReturningCustomers);

// Helper function to map raw database order results into a consistent, decorated object
const mapOrderRow = (o) => {
  const paymentMethod = o.paymentMethod || "N/A";
  // Logic to determine if an order is 'paid'. Defaults to true unless explicitly 'cod'.
  const paid =
    typeof o.paid !== "undefined"
      ? Boolean(o.paid)
      : paymentMethod.toLowerCase() !== "cod";

  const createdRaw = o.createdAt || o.created_at || o.placedAt || null;
  const statusRaw = (o.status || DEFAULT_STATUS).toString().toLowerCase();
  // Ensure status is one of the valid defined statuses
  const status = ORDER_STATUSES.includes(statusRaw)
    ? statusRaw
    : DEFAULT_STATUS;

  return {
    id: o.id,
    orderNumber: o.orderNumber || "-",
    customerName: o.customerName || "Guest checkout",
    total: Number(o.total || 0),
    paymentMethod,
    itemsCount: o.itemsCount || 0,
    paid,
    createdAt: createdRaw,
    displayDate: formatDateTime(createdRaw),
    status,
  };
};

// Generates an array of data points for charting daily sales over a given window.
// Crucially, this fills in zero values for days where no orders occurred.
const buildDailySalesSeries = (rows, windowDays) => {
  if (!windowDays || windowDays <= 0) {
    return { labels: [], revenue: [], orders: [] };
  }

  const lookup = {};
  // Aggregate data from database rows into a lookup object keyed by date (YYYY-MM-DD)
  (rows || []).forEach((row) => {
    if (!row || !row.day) return;

    let key = null;
    if (row.day instanceof Date) {
      key = row.day.toISOString().slice(0, 10);
    } else {
      const parsed = new Date(row.day);
      if (Number.isNaN(parsed.getTime())) return;
      key = parsed.toISOString().slice(0, 10);
    }

    lookup[key] = {
      revenue: Number(row.revenue || 0),
      ordersCount: Number(row.ordersCount || 0),
    };
  });

  // Calculate the starting date for the rolling window
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (windowDays - 1));

  const labels = [];
  const revenue = [];
  const orders = [];

  // Iterate for each day in the window to build the chart series
  for (let i = 0; i < windowDays; i += 1) {
    const current = new Date(start);
    current.setDate(start.getDate() + i);
    const key = current.toISOString().slice(0, 10);
    const stats = lookup[key] || { revenue: 0, ordersCount: 0 }; // Use 0 if no data exists

    labels.push(
      current.toLocaleDateString("en-SG", { day: "numeric", month: "short" })
    );
    revenue.push(stats.revenue);
    orders.push(stats.ordersCount);
  }

  return { labels, revenue, orders };
};

// Helper for sorting: converts a date value to a numeric timestamp for reliable sorting
const toTimestamp = (value) => {
  if (!value) return 0;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 0;
  return d.getTime();
};

// Sorts orders by creation time (newest first) and limits the result
const buildRecentOrders = (orders, limit) => {
  if (!Array.isArray(orders) || !orders.length) return [];
  const numericLimit = Number(limit);
  const count =
    Number.isFinite(numericLimit) && numericLimit > 0
      ? Math.floor(numericLimit)
      : 5;
  // Sorts descending by timestamp (newest first) and takes the top N
  return [...orders]
    .sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt))
    .slice(0, count);
};

// Groups and summarizes a list of orders by the day they were created (for charting input)
const summarizeOrdersByDay = (orders) => {
  if (!Array.isArray(orders) || !orders.length) return [];
  const buckets = {};

  orders.forEach((order) => {
    const timestamp = toTimestamp(order.createdAt);
    if (!timestamp) return;
    const dayKey = new Date(timestamp).toISOString().slice(0, 10); // Extract YYYY-MM-DD key

    if (!buckets[dayKey]) {
      buckets[dayKey] = { day: dayKey, revenue: 0, ordersCount: 0 };
    }
    buckets[dayKey].revenue += Number(order.total || 0); // Accumulate total revenue
    buckets[dayKey].ordersCount += 1; // Count total orders
  });

  return Object.values(buckets).sort((a, b) =>
    a.day.localeCompare(b.day, undefined, { numeric: true })
  );
};

// Computes total orders and total revenue from a list of mapped order objects
const computeOrderTotals = (orderList) =>
  orderList.reduce(
    (acc, order) => {
      acc.orders += 1;
      acc.revenue += Number(order.total || 0);
      return acc;
    },
    { orders: 0, revenue: 0 }
  );

// Handles the result of a Promise.allSettled call, providing graceful fallback/logging on failure
// This is critical for preventing a single slow or failed query from crashing the entire dashboard.
const extractValue = (result, fallback, errors, errorMessage) => {
  if (result.status === "fulfilled") {
    return result.value;
  }

  console.error(errorMessage || "Failed to load dashboard data:", result.reason);
  if (errorMessage) errors.push(errorMessage); // Collect user-facing error messages
  return fallback;
};

// Provides a safe default/empty data structure in case the dashboard fails entirely
const buildDashboardFallback = () => ({
  totals: { products: 0, orders: 0, revenue: 0 },
  lowStock: [],
  recentOrders: [],
  dailySales: { labels: [], revenue: [], orders: [] },
  analytics: {
    bestSellers: [],
    salesByCategory: [],
    salesByHour: { labels: [], revenue: [], orders: [] },
    returningCustomers: [],
  },
  meta: {
    lowStockThreshold: LOW_STOCK_THRESHOLD,
    recentOrdersLimit: RECENT_ORDERS_LIMIT,
    dailySalesDays: DAILY_SALES_DAYS,
  },
});

// Helper for formatting currency display (e.g., "S$ 12.34")
const formatCurrency = (value) => `S$ ${Number(value || 0).toFixed(2)}`;

// Generates an array of data points for charting hourly sales over the defined window
const buildHourlySalesSeries = (rows) => {
  if (!rows || !rows.length) {
    return { labels: [], revenue: [], orders: [] };
  }

  const labels = [];
  const revenue = [];
  const orders = [];

  // Maps database bucket data (hourly timestamp) to chart-friendly arrays
  rows.forEach((row) => {
    if (!row || !row.bucket) return;
    const date = new Date(row.bucket);
    if (Number.isNaN(date.getTime())) return;
    labels.push(
      // Format label to show hour, minute, day, and month (e.g., "14:00 24 Nov")
      date.toLocaleString("en-SG", {
        hour: "2-digit",
        minute: "2-digit",
        day: "numeric",
        month: "short",
      })
    );
    revenue.push(Number(row.revenue || 0));
    orders.push(Number(row.ordersCount || 0));
  });

  return { labels, revenue, orders };
};

// Decorates raw category sales results for final presentation format
const decorateCategorySales = (rows) =>
  (rows || []).map((row) => ({
    category: row.category || "Uncategorized",
    revenue: Number(row.revenue || 0),
    quantity: Number(row.quantity || 0),
  }));

// Decorates raw best seller results for final presentation format
const decorateBestSellers = (rows) =>
  (rows || []).map((row) => ({
    productId: row.productId,
    productName: row.productName || "Unnamed",
    totalQuantity: Number(row.totalQuantity || 0),
    totalRevenue: Number(row.totalRevenue || 0),
  }));

// Decorates raw returning customer results for final presentation format
const decorateReturningCustomers = (rows) =>
  (rows || []).map((row) => ({
    id: row.id,
    username: row.username || "Customer",
    ordersCount: Number(row.ordersCount || 0),
    totalSpent: Number(row.totalSpent || 0),
  }));

// ======================================
// 1. DASHBOARD HANDLER (GET /admin/orders)
// Uses Promise.allSettled for concurrent, resilient data loading.
// ======================================
exports.ordersDashboard = async (req, res) => {
  try {
    // Collect existing flash messages and errors from middleware
    const baseErrors = Array.isArray(res.locals.errors)
      ? [...res.locals.errors]
      : [];
    const baseMessages = Array.isArray(res.locals.messages)
      ? [...res.locals.messages]
      : [];
    const loadErrors = []; // To collect errors encountered during data fetching

    // 1. Fetch core data concurrently (Performance Optimization)
    const [ordersResult, productsResult, lowStockResult] = await Promise.allSettled([
      listOrdersAsync(), // Fetches all orders with user info
      productCountAsync(), // Gets total number of products
      lowStockAsync(LOW_STOCK_THRESHOLD, LOW_STOCK_LIMIT), // Gets products low in stock
    ]);

    // Extract values, safely handling any individual query failure
    const orderRows = extractValue(
      ordersResult,
      [],
      loadErrors,
      "Unable to load orders right now."
    );
    const productCount = extractValue(
      productsResult,
      0,
      loadErrors,
      "Unable to load product stats."
    );
    const lowStockRows = extractValue(
      lowStockResult,
      [],
      loadErrors,
      "Unable to load low stock alerts."
    );

    // 2. Fetch analytics data concurrently
    const [bestSellersResult, categorySalesResult, hourlySalesResult, returningResult] =
      await Promise.allSettled([
        bestSellersAsync(5),
        categorySalesAsync(),
        hourlySalesAsync(SALES_HOURS_WINDOW),
        returningCustomersAsync(5),
      ]);

    // Extract and decorate analytics data
    const analytics = {
      bestSellers: decorateBestSellers(
        extractValue(
          bestSellersResult,
          [],
          loadErrors,
          "Unable to load best sellers."
        )
      ),
      salesByCategory: decorateCategorySales(
        extractValue(
          categorySalesResult,
          [],
          loadErrors,
          "Unable to load category sales."
        )
      ),
      salesByHour: buildHourlySalesSeries(
        extractValue(
          hourlySalesResult,
          [],
          loadErrors,
          "Unable to load hourly sales."
        )
      ),
      returningCustomers: decorateReturningCustomers(
        extractValue(
          returningResult,
          [],
          loadErrors,
          "Unable to load returning customers."
        )
      ),
    };

    // 3. Process and assemble dashboard object
    const orders = (orderRows || []).map(mapOrderRow); // Full list of orders
    const recentOrders = buildRecentOrders(orders, RECENT_ORDERS_LIMIT); // Top 5 recent orders
    const dailySalesRows = summarizeOrdersByDay(orders);
    const orderTotals = computeOrderTotals(orders); // Sum total orders and revenue
    
    const dashboard = {
      // Compiled key metrics
      totals: {
        products: Number(productCount || 0),
        orders: orderTotals.orders,
        revenue: Number(orderTotals.revenue || 0),
      },
      // Low stock mapping for display
      lowStock: (lowStockRows || []).map((item) => ({
        id: item.id,
        productName: item.productName || "Unnamed product",
        quantity: Number(item.quantity || 0),
      })),
      recentOrders,
      // Daily sales data mapped for chart consumption
      dailySales: buildDailySalesSeries(dailySalesRows, DAILY_SALES_DAYS),
      analytics,
      meta: {
        lowStockThreshold: LOW_STOCK_THRESHOLD,
        recentOrdersLimit: RECENT_ORDERS_LIMIT,
        dailySalesDays: DAILY_SALES_DAYS,
      },
    };

    // Render the dashboard view with all compiled data
    res.render("adminOrders", {
      orders,
      dashboard,
      user: req.session.user || null,
      errors: baseErrors.concat(loadErrors), // Combine all errors for display
      messages: baseMessages,
    });
  } catch (error) {
    // Catches catastrophic errors (e.g., database connection down)
    console.error("Failed to load orders dashboard:", error);
    res.render("adminOrders", {
      orders: [],
      dashboard: buildDashboardFallback(), // Render safe fallback view
      user: req.session.user || null,
      errors: (Array.isArray(res.locals.errors) ? res.locals.errors : []).concat(
        "Unable to load orders dashboard right now."
      ),
      messages: Array.isArray(res.locals.messages) ? res.locals.messages : [],
    });
  }
};

// Helper to normalize and validate the incoming order status string against valid statuses
const normalizeStatus = (value) => {
  const candidate = (value || "").toString().toLowerCase();
  return ORDER_STATUSES.includes(candidate) ? candidate : null;
};

// ======================================
// 2. VIEW SINGLE ORDER HANDLER (GET /admin/orders/:id)
// ======================================
exports.viewOrder = async (req, res) => {
  const orderId = req.params.id;
  try {
    const result = await orderDetailAsync(orderId); // Fetches order header + associated items

    if (!result) {
      req.flash("error", "Order not found.");
      return res.redirect("/admin/orders");
    }

    const { order, items } = result;
    // Ensure all money/quantity values are explicitly numbers for view logic
    const decoratedItems = (items || []).map((item) => ({
      ...item,
      subtotal: Number(item.subtotal || 0),
      price: Number(item.price || 0),
      quantity: Number(item.quantity || 0),
    }));

    const status = normalizeStatus(order.status) || DEFAULT_STATUS;
    // Creates a list of statuses for the visual status timeline/progress bar in the view
    const timeline = ORDER_STATUSES.map((value) => ({
      label: value.charAt(0).toUpperCase() + value.slice(1),
      value,
      active: status === value,
      // Mark as complete if its index is less than or equal to the current status's index
      complete: ORDER_STATUSES.indexOf(value) <= ORDER_STATUSES.indexOf(status),
    }));

    return res.render("adminOrderDetail", {
      order: {
        ...order,
        status,
        displayDate: formatDateTime(order.createdAt || order.created_at),
        subtotal: Number(order.subtotal || 0),
        deliveryFee: Number(order.deliveryFee || 0),
        total: Number(order.total || 0),
        paymentMethod: order.paymentMethod || "N/A",
        deliveryMethod: order.deliveryMethod || "standard",
      },
      items: decoratedItems,
      timeline,
      statuses: ORDER_STATUSES,
      user: req.session.user || null,
      errors: Array.isArray(res.locals.errors) ? res.locals.errors : [],
      messages: Array.isArray(res.locals.messages) ? res.locals.messages : [],
    });
  } catch (err) {
    console.error("Failed to render order:", err);
    req.flash("error", "Unable to load order details right now.");
    return res.redirect("/admin/orders");
  }
};

// ======================================
// 3. UPDATE ORDER STATUS HANDLER (POST /admin/orders/:id/status)
// ======================================
exports.updateOrderStatus = async (req, res) => {
  const orderId = req.params.id;
  const nextStatus = normalizeStatus(req.body.status); // Validate input status

  if (!nextStatus) {
    req.flash("error", "Invalid status selection.");
    return res.redirect(`/admin/orders/${orderId}`);
  }

  try {
    await updateStatusAsync(orderId, nextStatus); // Database update
    req.flash("success", "Order status updated.");
  } catch (err) {
    console.error("Failed to update status:", err);
    req.flash("error", "Unable to update order status.");
  }

  return res.redirect(`/admin/orders/${orderId}`);
};

// ======================================
// 4. DOWNLOAD RECEIPT HANDLER (GET /admin/orders/:id/receipt)
// Generates and streams a PDF receipt using pdfkit.
// ======================================
exports.downloadReceipt = async (req, res) => {
  const orderId = req.params.id;

  try {
    // LAZY LOADING: Only load pdfkit when needed (performance optimization).
    if (!PDFDocument) {
      try {
        // eslint-disable-next-line global-require
        PDFDocument = require("pdfkit");
      } catch (err) {
        console.error("PDFKit not installed:", err);
        req.flash("error", "PDF generation requires installing pdfkit (npm install pdfkit).");
        return res.redirect(`/admin/orders/${orderId}`);
      }
    }

    const result = await orderDetailAsync(orderId);
    if (!result) {
      req.flash("error", "Order not found.");
      return res.redirect("/admin/orders");
    }

    const { order, items } = result;
    // Set appropriate headers for file download
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="order-${order.orderNumber}.pdf"`
    );

    const doc = new PDFDocument({ margin: 50 }); // Initialize PDF document
    doc.pipe(res); // Pipe the PDF document data directly to the HTTP response stream

    // Helper function to draw a separator line
    const drawDivider = () => {
      doc
        .moveDown(0.5)
        .lineWidth(1)
        .strokeColor("#e5e5e5")
        .moveTo(doc.page.margins.left, doc.y)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y)
        .stroke()
        .moveDown(0.4);
    };

    // --- PDF CONTENT GENERATION START ---
    // Header/Branding
    doc
      .fillColor("#198754")
      .font("Helvetica-Bold")
      .fontSize(26)
      .text("FreshMart", { align: "left" })
      .fontSize(12)
      .fillColor("#4b5563")
      .text("Receipt & Tax Invoice", { align: "left" })
      .moveDown(0.5)
      .font("Helvetica")
      .fillColor("#6c757d")
      .text("www.freshmart.sg | hello@freshmart.sg");

    drawDivider();

    // Order Details Section
    const statusLabel = (order.status || DEFAULT_STATUS)
      .toString()
      .toUpperCase();
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor("#111")
      .text(`Order #${order.orderNumber}`)
      .font("Helvetica")
      .text(`Placed: ${formatDateTime(order.createdAt) || "-"}`)
      .text(`Status: ${statusLabel}`)
      .text(`Payment: ${order.paymentMethod || "N/A"}`)
      .text(`Delivery: ${order.deliveryMethod || "standard"}`);

    drawDivider();

    // Billing Information Section
    doc.font("Helvetica-Bold").text("Bill To");
    doc
      .font("Helvetica")
      .text(order.customerName || "Guest checkout")
      .text(order.customerEmail || "No email on file")
      .text(order.customerPhone || "No contact");

    drawDivider();

    // Items Table Header
    doc.font("Helvetica-Bold").text("Items").moveDown(0.5);

    const tableTop = doc.y;
    // Define x-coordinates for table columns
    const columnPositions = {
      name: doc.page.margins.left,
      qty: doc.page.margins.left + 280,
      price: doc.page.margins.left + 340,
      subtotal: doc.page.margins.left + 430,
    };

    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .text("Item", columnPositions.name, tableTop)
      .text("Qty", columnPositions.qty, tableTop)
      .text("Price", columnPositions.price, tableTop)
      .text("Subtotal", columnPositions.subtotal, tableTop);

    // Table Header Separator
    doc
      .lineWidth(0.5)
      .strokeColor("#cccccc")
      .moveTo(doc.page.margins.left, tableTop + 15)
      .lineTo(doc.page.width - doc.page.margins.right, tableTop + 15)
      .stroke();

    // Items Table Rows (with basic page break logic)
    let y = tableTop + 25;
    doc.font("Helvetica").fontSize(11);
    (items || []).forEach((item) => {
      doc
        .text(item.name, columnPositions.name, y, { width: 260 })
        .text(item.quantity, columnPositions.qty, y)
        .text(formatCurrency(item.price), columnPositions.price, y)
        .text(formatCurrency(item.subtotal), columnPositions.subtotal, y);
      y += 18;
      // Add a new page if content overflows
      if (y > doc.page.height - 150) {
        doc.addPage();
        y = doc.y;
      }
    });

    drawDivider();

    // Order Summary/Totals Section
    doc.font("Helvetica-Bold").text("Order Summary");
    doc
      .font("Helvetica")
      .text(`Subtotal: ${formatCurrency(order.subtotal)}`)
      .text(`Delivery Fee: ${formatCurrency(order.deliveryFee)}`)
      .font("Helvetica-Bold")
      .text(`Total Paid: ${formatCurrency(order.total)}`);

    drawDivider();

    // Footer/Disclaimer
    doc
      .font("Helvetica-Oblique")
      .fontSize(10)
      .fillColor("#6c757d")
      .text(
        "This is a computer-generated invoice. Thank you for shopping with FreshMart!"
      );

    doc.end(); // Finalize and send the PDF
  } catch (err) {
    // Handles errors during PDF generation or data fetch for the receipt
    console.error("Failed to generate PDF:", err);
    req.flash("error", "Unable to generate receipt.");
    res.redirect("/admin/orders");
  }
};