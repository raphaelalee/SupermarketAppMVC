// controllers/CheckoutController.js
// Session-based checkout (no DB dependency required for PayPal render)

const Order = require("../models/order");
const UserCart = require("../models/userCart");
const paypal = require("./services/paypal");

exports.renderCheckout = (req, res) => {
	const items = res.locals.cartDetailed || [];
	// calculate subtotal defensively: prefer i.subtotal, else price * qty
	const subtotal = items.reduce((sum, i) => {
		const line = typeof i.subtotal === 'number' ? i.subtotal : (Number(i.price || 0) * Number(i.qty || 0));
		return sum + (Number(line) || 0);
	}, 0);

	// Render checkout with PayPal client id + currency for frontend SDK
	res.render("checkout", {
		total: subtotal,
		items,
		user: req.session.user || null,
		paypalClientId: process.env.PAYPAL_CLIENT_ID,
		paypalCurrency: process.env.PAYPAL_CURRENCY || "SGD",
	});
};

/**
 * POST /paypal/create-order
 * Creates PayPal order using server-calculated total (cart + selected delivery fee).
 */
exports.createPaypalOrder = async (req, res) => {
	try {
		// Prefer server-side cart snapshot (session), but accept client-provided
		// items/subtotal when the request originates from PayPal UI where the
		// cookie may not be sent.
		let items = res.locals.cartDetailed || [];

		// If client sent items (embedded in view), use them
		if ((!items || items.length === 0) && Array.isArray(req.body.items) && req.body.items.length > 0) {
			items = req.body.items;
		}

		if (!items || items.length === 0) return res.status(400).json({ error: "Cart is empty" });

		const deliveryFee = parseFloat(req.body.deliveryFee || 0);
		if (!Number.isFinite(deliveryFee) || deliveryFee < 0) {
			return res.status(400).json({ error: "Invalid delivery fee" });
		}

		// allow client to provide subtotal (safe fallback), otherwise compute
		const subtotal = typeof req.body.subtotal === 'number' || typeof req.body.subtotal === 'string'
			? parseFloat(req.body.subtotal) || items.reduce((s, i) => s + (i.subtotal || 0), 0)
			: items.reduce((s, i) => s + (i.subtotal || 0), 0);

		const total = subtotal + deliveryFee;

		const order = await paypal.createOrder(total);

		// Store the expected total in session to validate later (if session exists)
		if (req.session) {
			req.session.paypalPending = {
				orderId: order.id,
				total: Number(total.toFixed(2)),
				createdAt: Date.now(),
			};
		}

		return res.json({ id: order.id });
	} catch (err) {
		console.error("createPaypalOrder:", err);
		return res.status(500).json({ error: "Failed to create PayPal order" });
	}
};

/**
 * POST /paypal/capture-order
 * Captures PayPal order and stores proof in session.
 */
exports.capturePaypalOrder = async (req, res) => {
	try {
		const { orderId } = req.body;
		if (!orderId) return res.status(400).json({ error: "Missing orderId" });

		const capture = await paypal.captureOrder(orderId);

		const status = capture.status;
		if (status !== "COMPLETED") {
			req.session.paypalCapture = null;
			return res.status(400).json({ error: "Payment not completed", capture });
		}

		req.session.paypalCapture = {
			orderId,
			status,
			captureId: capture?.purchase_units?.[0]?.payments?.captures?.[0]?.id || null,
			payerEmail: capture?.payer?.email_address || null,
			payerId: capture?.payer?.payer_id || null,
			capturedAt: Date.now(),
		};

		return res.json({ ok: true, capture });
	} catch (err) {
		console.error("capturePaypalOrder:", err);
		return res.status(500).json({ error: "Failed to capture PayPal order" });
	}
};

exports.processCheckout = (req, res) => {
	const items = res.locals.cartDetailed || [];

	if (!items || !items.length) {
		req.flash("error", "Your cart is empty.");
		return res.redirect("/cart");
	}

	const deliveryMethod = req.body.deliveryMethod || "standard";
	const deliveryFee = parseFloat(req.body.deliveryFee || 0);

	const rawPhone = (req.body.shippingPhone || "").toString();
	const digitsOnly = rawPhone.replace(/\D/g, "");

	if (deliveryMethod !== "pickup") {
		const last8 = digitsOnly.slice(-8);
		if (!/^\d{8}$/.test(last8)) {
			req.flash("error", "Contact number must be exactly 8 digits.");
			return res.redirect("/checkout");
		}
	}

	const paymentMethod = (req.body.payment || "paynow").toLowerCase();
	const subtotal = items.reduce((sum, i) => {
		const line = typeof i.subtotal === 'number' ? i.subtotal : (Number(i.price || 0) * Number(i.qty || 0));
		return sum + (Number(line) || 0);
	}, 0);
	const total = subtotal + deliveryFee;

	// Determine paid flag: only card payments are considered paid immediately here.
	// PayPal will be validated separately below.
	let paid = false;
	let paypalMeta = null;
	if (paymentMethod === 'card') paid = true;

	if (paymentMethod === "paypal") {
		const cap = req.session.paypalCapture;
		const pending = req.session.paypalPending;

		if (!cap || cap.status !== "COMPLETED") {
			req.flash("error", "PayPal payment not completed. Please pay first.");
			return res.redirect("/checkout");
		}

		if (pending?.orderId && pending.orderId !== cap.orderId) {
			req.flash("error", "PayPal order mismatch. Please try again.");
			return res.redirect("/checkout");
		}

		if (pending?.total && Number(total.toFixed(2)) !== Number(pending.total)) {
			req.flash("error", "Cart total changed. Please pay again.");
			return res.redirect("/checkout");
		}

		paid = true;
		paypalMeta = {
			paypalOrderId: cap.orderId,
			paypalCaptureId: cap.captureId,
			paypalPayerEmail: cap.payerEmail,
			paypalPayerId: cap.payerId,
		};
	}

	// Build payment instructions for non-immediate methods
	let paymentInstructions = null;
	const payRef = `REF-${Date.now().toString().slice(-6)}-${Math.floor(Math.random()*900+100)}`;
	if (paymentMethod === 'paynow') {
		paymentInstructions = {
			method: 'paynow',
			note: 'Scan the PayNow QR or transfer using the reference below.',
			reference: payRef,
			qrImage: '/images/paynow-qr.png'
		};
	} else if (paymentMethod === 'bank') {
		paymentInstructions = {
			method: 'bank',
			bankName: 'DBS Bank',
			accountNumber: '123-456789-0',
			accountName: 'FreshMart Pte Ltd',
			reference: payRef,
			note: 'Please include the reference when making bank transfer.'
		};
	} else if (paymentMethod === 'cod') {
		paymentInstructions = {
			method: 'cod',
			note: 'Pay the delivery driver in cash upon receipt. Please have the exact amount ready.'
		};
	}

	const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;

	const orderPayload = {
		orderNumber,
		userId: req.session.user ? req.session.user.id : null,
		subtotal,
		deliveryFee,
		total,
		deliveryMethod,
		paymentMethod,
		shippingPhone: digitsOnly ? digitsOnly.slice(-8) : null,
		customerName: req.body.shippingName || (req.session.user && req.session.user.username) || null,
		customerEmail: (req.session.user && req.session.user.email) || (req.body.customerEmail || null),
		customerPhone: digitsOnly ? digitsOnly.slice(-8) : null,
		paid,
		createdAt: new Date().toISOString(),
		items,
		paymentInstructions: paymentInstructions,
		...(paypalMeta ? paypalMeta : {}),
	};

	Order.createOrder(orderPayload, items, (err, orderId) => {
		if (err) {
			console.error("Order save failed:", err);
			req.flash("error", "Order placed but not saved.");
		} else {
			if (orderId) orderPayload.id = orderId;
			req.flash("success", "Order placed successfully!");
		}

		req.session.lastOrder = orderPayload;
		req.session.cart = {};

		// Clear PayPal session proof after use
		req.session.paypalCapture = null;
		req.session.paypalPending = null;

		if (req.session.user?.id) {
			UserCart.clearCart(req.session.user.id, (clearErr) => {
				if (clearErr) console.error(`Failed clearing user cart:`, clearErr);
			});
		}

		res.redirect(`/order/${orderNumber}`);
	});
};

exports.renderReceipt = (req, res) => {
	const orderNumber = req.params.orderNumber;
	const stored = req.session.lastOrder;

	if (!stored || stored.orderNumber !== orderNumber) {
		req.flash("error", "Order not found. Complete a checkout first.");
		return res.redirect("/shopping");
	}

	res.render("receipt", {
		order: stored,
		items: stored.items || [],
		user: req.session.user || null,
	});
};

// POST /order/confirm-payment
// Called by customer when they've completed an offline payment (PayNow / Bank / COD confirmation)
exports.confirmPayment = (req, res) => {
	const orderNumber = req.body.orderNumber || (req.session.lastOrder && req.session.lastOrder.orderNumber);
	if (!orderNumber) {
		req.flash('error', 'Missing order reference.');
		return res.redirect('/');
	}

	// Optionally accept a payment reference from customer
	const paymentRef = req.body.paymentRef || null;

	const OrderModel = require('../models/order');
	OrderModel.getOrderByNumber(orderNumber, (err, orderRow) => {
		if (err) {
			console.error('confirmPayment: lookup error', err);
			req.flash('error', 'Could not verify order.');
			return res.redirect(`/order/${orderNumber}`);
		}

		if (!orderRow) {
			req.flash('error', 'Order not found.');
			return res.redirect('/');
		}

		// Mark DB order as paid
		OrderModel.markOrderPaid(orderNumber, { reference: paymentRef }, (markErr) => {
			if (markErr) {
				console.error('confirmPayment: mark paid error', markErr);
				req.flash('error', 'Failed to mark payment. Try again later.');
				return res.redirect(`/order/${orderNumber}`);
			}

			// Update session copy if present
			if (req.session.lastOrder && req.session.lastOrder.orderNumber === orderNumber) {
				req.session.lastOrder.paid = true;
				req.session.lastOrder.paymentConfirmedAt = new Date().toISOString();
				if (!req.session.lastOrder.paymentInstructions) req.session.lastOrder.paymentInstructions = {};
				req.session.lastOrder.paymentInstructions.confirmed = { byUser: req.session.user ? req.session.user.id : null, reference: paymentRef };
			}

			req.flash('success', 'Payment marked as complete. Thank you.');
			return res.redirect(`/order/${orderNumber}`);
		});
	});
};


