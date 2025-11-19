// controllers/AdminController.js
const Order = require("../models/order");

const formatDateTime = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-SG", { hour12: false });
};

// Render orders dashboard for admins
exports.ordersDashboard = (req, res) => {
  Order.listAllWithUsers((err, rows) => {
    if (err) {
      console.error("Failed to load orders:", err);
      return res.render("adminOrders", {
        orders: [],
        user: req.session.user || null,
        errors: ["Unable to load orders dashboard right now."],
        messages: [],
      });
    }

    const orders = (rows || []).map((o) => {
      const paymentMethod = o.paymentMethod || "N/A";
      const paid =
        typeof o.paid !== "undefined"
          ? Boolean(o.paid)
          : paymentMethod.toLowerCase() !== "cod";

      return {
        id: o.id,
        orderNumber: o.orderNumber || "-",
        customerName: o.customerName || "Guest checkout",
        total: Number(o.total || 0),
        paymentMethod,
        itemsCount: o.itemsCount || 0,
        paid,
        createdAt: o.createdAt || o.created_at || null,
        displayDate: formatDateTime(o.createdAt || o.created_at),
      };
    });

    res.render("adminOrders", {
      orders,
      user: req.session.user || null,
      errors: [],
      messages: [],
    });
  });
};
