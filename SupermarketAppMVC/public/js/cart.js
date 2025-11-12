// public/js/cart.js
document.addEventListener('DOMContentLoaded', () => {
  const drawer = document.getElementById('cart-drawer');
  if (!drawer) return;

  const openButtons = document.querySelectorAll('[data-open-cart], a[href="/cart"]');
  const closeBtn = document.getElementById('cart-close');

  function openDrawer() { drawer.classList.add('open'); }
  function closeDrawer() { drawer.classList.remove('open'); }

  openButtons.forEach(b => b.addEventListener('click', (e) => { e.preventDefault(); openDrawer(); }));
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);

  // quantity handlers
  drawer.addEventListener('click', (e) => {
    const inc = e.target.closest('.qty-increase');
    const dec = e.target.closest('.qty-decrease');
    const rem = e.target.closest('.remove-item');
    if (!(inc || dec || rem)) return;

    const item = e.target.closest('.cart-item');
    const id = item && item.dataset.id;
    if (!id) return;

    if (inc || dec) {
      // get current qty from span
      const qtySpan = item.querySelector('.cart-item-qty');
      let qty = parseInt(qtySpan.textContent, 10) || 0;
      qty = inc ? qty + 1 : Math.max(0, qty - 1);
      // update on server
      fetch(`/cart/update/${id}`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ quantity: qty })
      }).then(r => r.json()).then(json => {
        if (json.success) {
          if (qty === 0) {
            item.remove();
          } else {
            qtySpan.textContent = qty;
          }
          updateCartCount(json.cart);
        }
      }).catch(console.error);
    }

    if (rem) {
      fetch(`/cart/remove/${id}`, { method: 'POST' }).then(r => r.json()).then(json => {
        if (json.success) {
          item.remove();
          updateCartCount(json.cart);
        }
      }).catch(console.error);
    }
  });

  function updateCartCount(cart) {
    const countEl = document.getElementById('cart-count');
    if (!countEl) return;
    if (!cart) { countEl.textContent = 0; return; }
    // sum quantities
    const totalQty = Object.values(cart).reduce((s, q) => s + (parseInt(q, 10) || 0), 0);
    countEl.textContent = totalQty;
  }
});
