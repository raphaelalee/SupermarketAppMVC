// controllers/CheckoutController.js
// Session-based checkout (no DB dependency required for PayPal render)

const util = require("util");
const Order = require("../models/order");
const UserCart = require("../models/userCart");
const paypal = require("../services/paypal");
const stripeSvc = require("../services/stripe");



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
		stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
		stripeCurrency: (process.env.STRIPE_CURRENCY || "SGD").toUpperCase(),
	});
};

/**
 * POST /paypal/create-order
 * Creates PayPal order using server-calculated total (cart + selected delivery fee).
 */
exports.createPaypalOrder = async (req, res) => {
	try {
		console.log('createPaypalOrder: incoming request', { url: req.originalUrl, ip: req.ip });
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

		// Use shipping name if provided so PayPal approval screen shows recipient
		const shippingName = req.body.shippingName || (req.session.user && req.session.user.username) || null;

		const order = await paypal.createOrder(total, { shippingName });

		// Store the expected total in session to validate later (if session exists)
		if (req.session) {
			req.session.paypalPending = {
				orderId: order.id,
				total: Number(total.toFixed(2)),
				shippingName: shippingName || null,
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
		console.log('capturePaypalOrder: incoming request', { url: req.originalUrl, ip: req.ip, body: req.body });
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

/**
 * POST /stripe/create-payment-intent
 * Creates a PaymentIntent using server-side cart and returns client secret.
 */
exports.createStripePaymentIntent = async (req, res) => {
	try {
		const items = res.locals.cartDetailed || [];
		if (!items || !items.length) return res.status(400).json({ error: "Cart is empty" });

		const deliveryFee = parseFloat(req.body.deliveryFee || 0);
		const allowedFees = [0, 3.5, 6.0];
		if (!Number.isFinite(deliveryFee) || deliveryFee < 0) {
			return res.status(400).json({ error: "Invalid delivery fee" });
		}
		const safeDeliveryFee = Number(deliveryFee.toFixed(2));
		if (!allowedFees.includes(safeDeliveryFee)) {
			return res.status(400).json({ error: "Unsupported delivery option" });
		}

		const subtotal = items.reduce((sum, i) => {
			const line = typeof i.subtotal === "number" ? i.subtotal : (Number(i.price || 0) * Number(i.qty || 0));
			return sum + (Number(line) || 0);
		}, 0);

		const total = subtotal + safeDeliveryFee;

		const intent = await stripeSvc.createPaymentIntent(total, {
			userId: req.session.user ? req.session.user.id : "guest",
			source: "checkout",
		});

		if (req.session) {
			req.session.stripePending = {
				intentId: intent.id,
				amount: intent.amount,
				total: Number(total.toFixed(2)),
				createdAt: Date.now(),
			};
		}

		return res.json({
			clientSecret: intent.client_secret,
			intentId: intent.id,
			amount: intent.amount,
			currency: intent.currency,
		});
	} catch (err) {
		console.error("createStripePaymentIntent error:", err);
		return res.status(500).json({ error: "Failed to create payment intent" });
	}
};

// GET /stripe/intent-status/:id  -- lightweight polling endpoint for client
exports.getStripeIntentStatus = async (req, res) => {
	try {
		const intentId = req.params.id;
		if (!intentId) return res.status(400).json({ error: "Missing intent id" });
		const intent = await stripeSvc.retrievePaymentIntent(intentId);
		return res.json({ status: intent?.status || null });
	} catch (err) {
		console.error("getStripeIntentStatus error:", err);
		return res.status(500).json({ error: "Unable to fetch intent status" });
	}
};

exports.processCheckout = async (req, res) => {
	const items = res.locals.cartDetailed || [];

	if (!items || !items.length) {
		req.flash("error", "Your cart is empty.");
		return res.redirect("/cart");
	}

	const deliveryMethod = req.body.deliveryMethod || "standard";
	const allowedFees = [0, 3.5, 6.0];
	let deliveryFee = parseFloat(req.body.deliveryFee || 0);
	if (!Number.isFinite(deliveryFee)) deliveryFee = 0;
	const safeDeliveryFee = Number(deliveryFee.toFixed(2));
	if (!allowedFees.includes(safeDeliveryFee)) {
		req.flash("error", "Unsupported delivery option.");
		return res.redirect("/checkout");
	}
	deliveryFee = safeDeliveryFee;

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
	const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;

	// Determine paid flag: only card payments are considered paid immediately here.
	// PayPal will be validated separately below.
	let paid = false;
	let paypalMeta = null;
	let stripeMeta = null;
	let paidAt = null;
	if (paymentMethod === 'card') paid = true;

	// Build payment instructions for non-immediate methods (declare early so wallet branch can access)
	const payRef = `REF-${Date.now().toString().slice(-6)}-${Math.floor(Math.random()*900+100)}`;
	const paymentInstructions = (() => {
		if (paymentMethod === 'paynow') {
			return {
				method: 'paynow',
				note: 'Scan the PayNow QR or transfer using the reference below.',
				reference: payRef,
				qrImage: '/images/paynow-qr.png'
			};
		}
		if (paymentMethod === 'bank') {
			return {
				method: 'bank',
				bankName: 'DBS Bank',
				accountNumber: '123-456789-0',
				accountName: 'FreshMart Pte Ltd',
				reference: payRef,
				note: 'Please include the reference when making bank transfer.'
			};
		}
		if (paymentMethod === 'cod') {
			return {
				method: 'cod',
				note: 'Pay the delivery driver in cash upon receipt. Please have the exact amount ready.'
			};
		}
		return null;
	})();

	// Wallet payment path (persistent DB)
	if (paymentMethod === 'wallet') {
		if (!req.session.user) {
			req.flash("error", "Please log in to use wallet.");
			return res.redirect("/login");
		}
		const Wallet = require('../models/wallet');
		return Wallet.debit(
			req.session.user.id,
			total,
			'wallet',
			'Checkout payment',
			orderNumber,
			null,
			(err) => {
				if (err) {
					const msg = err.message === 'INSUFFICIENT_FUNDS'
						? 'Insufficient wallet balance.'
						: 'Wallet payment failed.';
					req.flash('error', msg);
					return res.redirect('/checkout');
				}
				paid = true;
				paidAt = new Date().toISOString();
				finalizeOrder();
			}
		);
	}

	if (paymentMethod === "nets") {
		if (!req.session.netsPaid) {
			req.flash("error", "NETS payment not confirmed. Please scan and pay first.");
			return res.redirect("/checkout");
		}
		paid = true;
	}

	if (paymentMethod === "paypal") {
		const cap = req.session.paypalCapture;
		const pending = req.session.paypalPending;
		// Fallback to hidden form fields (in case session was lost between PayPal fetch calls)
		const formOrderId = req.body.paypalOrderId || null;
		const formCaptureId = req.body.paypalCaptureId || null;
		const formPaidFlag = String(req.body.paypalPaid || "") === "1";

		// Prefer session capture data
		let paypalProof = null;
		if (cap && cap.status === "COMPLETED") {
			paypalProof = {
				orderId: cap.orderId,
				captureId: cap.captureId,
				payerEmail: cap.payerEmail,
				payerId: cap.payerId,
			};
		} else if (formPaidFlag && formCaptureId) {
			// Accept form-provided proof when session capture is missing (e.g., cookie not sent on fetch)
			paypalProof = {
				orderId: formOrderId,
				captureId: formCaptureId,
				payerEmail: null,
				payerId: null,
			};
		}

		if (!paypalProof) {
			req.flash("error", "PayPal payment not completed. Please pay first.");
			return res.redirect("/checkout");
		}

		if (pending?.orderId && pending.orderId !== paypalProof.orderId) {
			req.flash("error", "PayPal order mismatch. Please try again.");
			return res.redirect("/checkout");
		}

		if (pending?.total && Number(total.toFixed(2)) !== Number(pending.total)) {
			req.flash("error", "Cart total changed. Please pay again.");
			return res.redirect("/checkout");
		}

		paid = true;
		// MySQL DATETIME doesn't accept the trailing 'Z'; store as 'YYYY-MM-DD HH:MM:SS'
		paidAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
		paypalMeta = {
			paypalOrderId: paypalProof.orderId,
			paypalCaptureId: paypalProof.captureId,
			paypalPayerEmail: paypalProof.payerEmail,
			paypalPayerId: paypalProof.payerId,
		};
	}

	if (paymentMethod === "stripe") {
		const intentId = req.body.stripePaymentIntentId || null;
		if (!intentId) {
			req.flash("error", "Stripe payment not completed. Please pay first.");
			return res.redirect("/checkout");
		}

		try {
			const intent = await stripeSvc.retrievePaymentIntent(intentId);
			const status = intent?.status;
			// PayNow / GrabPay flows can return "processing" or "requires_capture" after redirect
			const okStatuses = ["succeeded", "processing", "requires_capture"];
			if (!okStatuses.includes(status)) {
				req.flash("error", "Stripe payment not completed. Please try again.");
				return res.redirect("/checkout");
			}

			const pending = req.session?.stripePending || null;
			const centsTotal = Math.round(total * 100);
			if (pending?.intentId && pending.intentId !== intentId) {
				req.flash("error", "Stripe payment mismatch. Please try again.");
				return res.redirect("/checkout");
			}
			if (Number(intent.amount) !== centsTotal) {
				req.flash("error", "Payment amount mismatch. Please pay again.");
				return res.redirect("/checkout");
			}

			paid = true;
			paidAt = new Date(intent.created * 1000).toISOString().slice(0, 19).replace("T", " ");
			stripeMeta = {
				stripePaymentIntentId: intent.id,
				stripeAmount: intent.amount,
				stripeCurrency: intent.currency,
				stripeStatus: status,
				stripeChargeId: intent.latest_charge || null,
			};
		} catch (err) {
			console.error("Stripe verify error:", err);
			req.flash("error", "Could not verify Stripe payment. Please try again.");
			return res.redirect("/checkout");
		}
	}

	// Build payment instructions for non-immediate methods
	// paymentInstructions already built above; reuse it

	const status = paid ? "paid" : "pending";
	if (paid && !paidAt) paidAt = new Date();

	function finalizeOrder() {
		const toMysqlDateTime = (value) => {
			if (!value) return null;
			const d = new Date(value);
			if (Number.isNaN(d.getTime())) return null;
			return d.toISOString().slice(0, 19).replace("T", " ");
		};

		const paidAtMysql = paid ? toMysqlDateTime(paidAt) : null;
		const createdAtMysql = toMysqlDateTime(new Date());

		const orderPayload = {
			orderNumber,
			userId: req.session.user ? req.session.user.id : null,
			subtotal,
			deliveryFee,
			total,
			deliveryMethod,
			paymentMethod,
			status: paid ? "paid" : "pending",
			shippingPhone: digitsOnly ? digitsOnly.slice(-8) : null,
			customerName: req.body.shippingName || (req.session.user && req.session.user.username) || null,
			customerEmail: (req.session.user && req.session.user.email) || (req.body.customerEmail || null),
			customerPhone: digitsOnly ? digitsOnly.slice(-8) : null,
			paid,
			paidAt: paidAtMysql,
			createdAt: createdAtMysql,
			items,
			paymentInstructions: paymentInstructions,
			...(paymentMethod === "nets" && req.session.netsTxnRef ? { netsTxnRef: req.session.netsTxnRef } : {}),
			...(paypalMeta ? paypalMeta : {}),
			...(stripeMeta ? stripeMeta : {}),
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
			req.session.netsPaid = null;
			req.session.netsTxnRef = null;
			req.session.pendingNetsCheckout = null;
			req.session.stripePending = null;
			req.session.walletPaidAmount = null;

			if (req.session.user?.id) {
				UserCart.clearCart(req.session.user.id, (clearErr) => {
					if (clearErr) console.error(`Failed clearing user cart:`, clearErr);
				});
			}

			res.redirect(`/order/${orderNumber}`);
		});
	}

	// Non-wallet methods reach here and finalize immediately
	if (paymentMethod !== 'wallet') {
		finalizeOrder();
	}
};

const getOrderByNumberAsync = util.promisify(Order.getOrderByNumber);
const getOrderWithItemsAsync = util.promisify(Order.getOrderWithItems);

exports.renderReceipt = async (req, res) => {
	const orderNumber = req.params.orderNumber;
	let stored = req.session.lastOrder;

	try {
		// If session copy is missing or does not match, fall back to DB lookup
		if (!stored || stored.orderNumber !== orderNumber) {
			const row = await getOrderByNumberAsync(orderNumber);
			if (!row) {
				req.flash("error", "Order not found. Complete a checkout first.");
				return res.redirect("/shopping");
			}

			// Optional ownership check: allow guest orders (no userId) or matching user
			if (row.userId && req.session.user?.id && row.userId !== req.session.user.id) {
				req.flash("error", "Order not found for your account.");
				return res.redirect("/history");
			}

			const detail = await getOrderWithItemsAsync(row.id);
			stored = {
				...(detail?.order || row),
				items: detail?.items || [],
			};
		}

		const maskedEmail = stored.customerEmail
			? (() => {
					const parts = String(stored.customerEmail).split("@");
					if (parts.length !== 2) return "****";
					const [user, domain] = parts;
					if (user.length <= 2) return `${user[0] || ""}*@${domain}`;
					return `${user[0]}***${user[user.length - 1]}@${domain}`;
			  })()
			: null;

		const maskedPhone = stored.customerPhone
			? `****${String(stored.customerPhone).slice(-4)}`
			: null;

		res.render("receipt", {
			order: { ...stored, maskedEmail, maskedPhone },
			items: stored.items || [],
			user: req.session.user || null,
		});
	} catch (err) {
		console.error("renderReceipt failed:", err);
		req.flash("error", "Unable to load order receipt right now.");
		return res.redirect("/shopping");
	}
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

// POST /order/request-refund - customer initiates refund on a paid order
exports.requestRefund = (req, res) => {
	const orderNumber = req.body.orderNumber || (req.session.lastOrder && req.session.lastOrder.orderNumber);
	const reason = (req.body.reason || '').toString().trim() || 'No reason provided';

	if (!orderNumber) {
		req.flash('error', 'Missing order reference.');
		return res.redirect('/history');
	}

	const OrderModel = require('../models/order');
	OrderModel.getOrderByNumber(orderNumber, (err, orderRow) => {
		if (err || !orderRow) {
			console.error('requestRefund: lookup error', err);
			req.flash('error', 'Order not found.');
			return res.redirect('/history');
		}

		if (!orderRow.paid) {
			req.flash('error', 'Refunds apply to paid orders only.');
			return res.redirect(`/order/${orderNumber}`);
		}

		OrderModel.updateOrderStatus(orderRow.id, 'refund_requested', (upErr) => {
			if (upErr) {
				console.error('requestRefund: update error', upErr);
				req.flash('error', 'Could not submit refund request.');
				return res.redirect(`/order/${orderNumber}`);
			}

			if (req.session.lastOrder && req.session.lastOrder.orderNumber === orderNumber) {
				req.session.lastOrder.status = 'refund_requested';
				req.session.lastOrder.refundRequestedAt = new Date().toISOString();
				req.session.lastOrder.refundReason = reason;
			}

			console.log(`Refund requested for ${orderNumber}: ${reason}`);
			req.flash('success', 'Refund request submitted.');
			return res.redirect(`/order/${orderNumber}`);
		});
	});
};

// POST /order/resend-payment - resend instructions for unpaid orders
exports.resendPaymentInstructions = (req, res) => {
	const orderNumber = req.body.orderNumber || (req.session.lastOrder && req.session.lastOrder.orderNumber);
	if (!orderNumber) {
		req.flash('error', 'Missing order reference.');
		return res.redirect('/history');
	}

	if (!req.session.lastOrder || req.session.lastOrder.orderNumber !== orderNumber) {
		req.flash('error', 'Order not found in session. Please complete checkout again.');
		return res.redirect('/history');
	}

	const order = req.session.lastOrder;
	if (order.paid) {
		req.flash('info', 'Order already paid. No instructions sent.');
		return res.redirect(`/order/${orderNumber}`);
	}

	console.log('Resend payment instructions', {
		orderNumber,
		method: order.paymentMethod,
		instructions: order.paymentInstructions || null,
	});

	req.session.lastOrder.paymentReminderSentAt = new Date().toISOString();
	req.flash('success', 'Payment instructions resent (logged).');
	return res.redirect(`/order/${orderNumber}`);
};


