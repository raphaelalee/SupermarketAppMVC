// public/js/cart.js
document.addEventListener('DOMContentLoaded', () => {
  const drawer = document.getElementById('cart-drawer');
  if (!drawer) return;

  const openButtons = document.querySelectorAll('[data-open-cart], #openCart');
  const closeBtn = document.getElementById('cart-close');
  const itemsContainer = drawer.querySelector('[data-cart-items]');
  const emptyMessage = drawer.querySelector('[data-cart-empty]');
  const overlay = document.getElementById('cart-overlay');

  function openDrawer() {
    drawer.classList.add('open');
    if (overlay) overlay.classList.add('show');
    document.body.classList.add('cart-open');
  }

  function closeDrawer() {
    drawer.classList.remove('open');
    if (overlay) overlay.classList.remove('show');
    document.body.classList.remove('cart-open');
  }

  function toggleEmptyState() {
    if (!itemsContainer || !emptyMessage) return;
    const hasItems = itemsContainer.querySelectorAll('.cart-item').length > 0;
    itemsContainer.classList.toggle('d-none', !hasItems);
    emptyMessage.classList.toggle('d-none', hasItems);
  }

  function applyItemUpdate(target, data) {
    if (!target || !data) return;
    const qtySpan = target.querySelector('.cart-item-qty');
    if (qtySpan) qtySpan.textContent = data.quantity;

    const subEl = target.querySelector('.cart-item-sub');
    if (subEl) {
      const subtotal = Number(data.subtotal) || 0;
      subEl.textContent = `Subtotal: $${subtotal.toFixed(2)}`;
    }
  }

  function updateCartTotal(data) {
    const totalEl = document.getElementById('cart-total');
    if (!totalEl) return;

    let total = data;
    if (data && typeof data === 'object' && 'total' in data) {
      total = data.total;
    }

    const numericTotal = typeof total === 'number' ? total : parseFloat(total) || 0;
    totalEl.textContent = `$${numericTotal.toFixed(2)}`;
  }

  function updateCartCount(cartData) {
    const countEls = document.querySelectorAll('[data-cart-count]');
    if (!countEls.length) return;

    let totalQty = 0;

    if (cartData && typeof cartData === 'object' && 'count' in cartData) {
      totalQty = cartData.count;
    } else if (cartData) {
      totalQty = Object.values(cartData).reduce((sum, q) => sum + (parseInt(q, 10) || 0), 0);
    }

    countEls.forEach((el) => {
      el.textContent = totalQty;
    });
  }

  function applyCartSummary(summary) {
    if (!summary) return;
    updateCartCount(summary);
    updateCartTotal(summary);
    toggleEmptyState();
  }

  openButtons.forEach((btn) =>
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openDrawer();
    })
  );

  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  if (overlay) overlay.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && drawer.classList.contains('open')) {
      closeDrawer();
    }
  });

  drawer.addEventListener('click', (e) => {
    const inc = e.target.closest('.qty-increase');
    const dec = e.target.closest('.qty-decrease');
    const rem = e.target.closest('.remove-item');
    if (!(inc || dec || rem)) return;

    const item = e.target.closest('.cart-item');
    const id = item && item.dataset.id;
    if (!id) return;

    if (inc || dec) {
      const qtySpan = item.querySelector('.cart-item-qty');
      let qty = parseInt(qtySpan.textContent, 10) || 0;
      qty = inc ? qty + 1 : Math.max(0, qty - 1);

      fetch(`/cart/update/${id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ quantity: qty }),
      })
        .then((r) => r.json())
        .then((json) => {
          if (!json.success) return;

          if (qty === 0) {
            item.remove();
          } else if (json.item) {
            applyItemUpdate(item, json.item);
          } else {
            qtySpan.textContent = qty;
          }

          applyCartSummary(json.cart);
        })
        .catch(console.error);
    }

    if (rem) {
      fetch(`/cart/remove/${id}`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
      })
        .then((r) => r.json())
        .then((json) => {
          if (!json.success) return;
          item.remove();
          applyCartSummary(json.cart);
        })
        .catch(console.error);
    }
  });
});
