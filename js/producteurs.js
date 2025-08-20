// js/producteurs.js
// ======================================================
// Catalogue + panier (bulle & tiroir)
// Nécessite : window.SUPABASE_URL, window.SUPABASE_ANON_KEY (js/config.js)
// et <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
// ======================================================

// --- i18n (FR/EN) ---
const LANG = (document.documentElement.lang || 'fr').toLowerCase().startsWith('en') ? 'en' : 'fr';
const I18N = {
  fr: {
    add: 'Ajouter',
    remove: 'Supprimer',
    clear: 'Vider',
    qty: 'Qté',
    price: 'Prix',
    stock: 'Stock',
    subtotal: 'Sous-total',
    emptyToast: 'Votre panier est vide',
    maxStock: 'Stock maximum atteint pour cet article.'
  },
  en: {
    add: 'Add',
    remove: 'Remove',
    clear: 'Clear',
    qty: 'Qty',
    price: 'Price',
    stock: 'Stock',
    subtotal: 'Subtotal',
    emptyToast: 'Your cart is empty',
    maxStock: 'Max stock reached for this item.'
  }
};
const t = (k) => (I18N[LANG] && I18N[LANG][k]) || I18N.fr[k] || k;

// 0) Client Supabase (UMD)
const supabase = window.supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY
);

// 1) Références DOM
const elStatus    = document.getElementById('status');
const elBody      = document.querySelector('#tbl tbody');

const cartTable   = document.getElementById('cart');           // <table id="cart">
const cartHead    = document.querySelector('#cart thead');     // entête du panier
const cartBody    = document.querySelector('#cart tbody');     // lignes du panier
const cartTotal   = document.getElementById('cartTotal');      // total € (texte)
const btnClear    = document.getElementById('btnClear');       // vider panier

const cartFab     = document.getElementById('cartFab');        // bulle “Mon panier”
const cartCount   = document.getElementById('cartCount');      // badge (nb produits distincts)
const cartPanel   = document.getElementById('cartPanel');      // tiroir
const cartOverlay = document.getElementById('cartOverlay');    // overlay
const cartClose   = document.getElementById('cartClose');      // bouton X

// Placeholder “panier vide”
let cartEmpty = document.getElementById('cartEmpty');
if (!cartEmpty) {
  cartEmpty = document.createElement('div');
  cartEmpty.id = 'cartEmpty';
  cartEmpty.className = 'cart-empty';
  cartEmpty.innerHTML = `
    <div class="cart-empty-card">
      <p>${t('emptyToast')}</p>
    </div>`;
  // On insère le placeholder juste AVANT le tableau dans le panneau
  cartTable.parentNode.insertBefore(cartEmpty, cartTable);
}

const fmtPrice = new Intl.NumberFormat('fr-FR', { style:'currency', currency:'EUR' });

// 2) Panier en mémoire : slug -> { name, price, qty, stock }
window.cart = (window.cart instanceof Map) ? window.cart : new Map();
const cart = window.cart;

// 3) Utilitaires
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
function getInCart(slug){ return cart.get(slug)?.qty ?? 0; }

function setHeaderOffset(){
  const h = (document.querySelector('.site-header')?.offsetHeight) || 64;
  document.documentElement.style.setProperty('--header-h', `${h}px`);
}
window.addEventListener('load', setHeaderOffset);
window.addEventListener('resize', setHeaderOffset);

// 4) Charger les produits disponibles
async function loadAvailable(){
  try{
    if (elStatus) elStatus.textContent = 'Chargement…';

    const { data, error } = await supabase
      .from('products')
      .select('slug,name_fr,name_en,price_eur,unit,quantity,bio, categories:category_id(name_fr,name_en,sort_order)')
      .eq('is_active', true)
      .gt('quantity', 0);

    if (error) throw error;

    const rows = data.sort((a,b)=>{
      const ca = a.categories?.sort_order ?? 0;
      const cb = b.categories?.sort_order ?? 0;
      if (ca !== cb) return ca - cb;
      const aName = (LANG === 'en' && a.name_en) ? a.name_en : a.name_fr;
      const bName = (LANG === 'en' && b.name_en) ? b.name_en : b.name_fr;
      return (aName || '').localeCompare(bName || '', LANG);
    });

    if (elStatus) elStatus.textContent = (LANG==='en')
      ? `Available products: ${rows.length}`
      : `Produits disponibles : ${rows.length}`;

    return rows;
  }catch(e){
    console.error(e);
    if (elStatus) elStatus.textContent = 'Erreur : ' + (e.message || e);
    return [];
  }
}

// 5) Rendu du catalogue
function renderTable(rows){
  if (!elBody) return;
  elBody.innerHTML = '';

  rows.forEach(p=>{
    const price   = Number(p.price_eur ?? 0);
    const priceStr= (p.price_eur==null) ? '—' : fmtPrice.format(price);
    const unitStr = p.unit;
    const stock   = Number(p.quantity ?? 0);
    const displayName = (LANG === 'en' && p.name_en) ? p.name_en : p.name_fr;
    const bioLabel = p.bio ? (LANG === 'en' ? 'organic' : 'bio') : '';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="padding:10px 14px;border-top:1px solid rgba(36,48,39,.06)">${p.categories?.name_fr ?? 'Autres'}</td>
      <td style="padding:10px 14px;border-top:1px solid rgba(36,48,39,.06)">
        ${displayName}
        ${bioLabel ? '<span style="margin-left:8px;font-size:.85em;color:#2f6e4e;border:1px solid rgba(47,110,78,.2);padding:2px 6px;border-radius:999px;background:rgba(47,110,78,.06)">' + bioLabel + '</span>' : ''}
      </td>
      <td style="padding:10px 14px;border-top:1px solid rgba(36,48,39,.06);text-align:right">
        ${priceStr}${priceStr!=='—' ? ` <span style="opacity:.7;font-size:.9em">/ ${unitStr}</span>` : ''}
      </td>
      <td style="padding:10px 14px;border-top:1px solid rgba(36,48,39,.06);text-align:right">${stock}</td>
      <td style="padding:10px 14px;border-top:1px solid rgba(36,48,39,.06);text-align:right">
        <div class="add-group" style="display:inline-flex;align-items:center;gap:10px">
          <div class="qty-control" aria-label="Quantité">
            <button class="qty-dec" type="button" aria-label="Moins">−</button>
            <span class="qty-val">1</span>
            <button class="qty-inc" type="button" aria-label="Plus">+</button>
          </div>
          <button class="btn add-btn"
                  data-slug="${p.slug}"
                  data-name="${encodeURIComponent(displayName)}"
                  data-price="${price}"
                  data-stock="${stock}">
            ${t('add')}
          </button>
        </div>
      </td>
    `;
    elBody.appendChild(tr);
  });
}

// 6) Mini animation “+N”
function flashAdd(btn, qty){
  const wrap = btn.closest('.add-group');
  if (!wrap) return;
  const tEl = document.createElement('span');
  tEl.className = 'add-toast';
  tEl.textContent = `+${qty}`;
  wrap.appendChild(tEl);
  setTimeout(()=> tEl.remove(), 900);
}

// 7) Interactions catalogue (délégation)
elBody?.addEventListener('click', (e)=>{
  const dec = e.target.closest?.('.qty-dec');
  const inc = e.target.closest?.('.qty-inc');
  if (dec || inc){
    const group = e.target.closest('.add-group');
    const valEl = group.querySelector('.qty-val');
    const addBtn= group.querySelector('.add-btn');
    const stock = Number(addBtn.dataset.stock || 0);
    const slug  = addBtn.dataset.slug;

    const current = Math.max(1, parseInt(valEl.textContent, 10) || 1);
    const inCart  = getInCart(slug);
    const maxAdd  = Math.max(1, stock - inCart);

    valEl.textContent = String(clamp(current + (inc ? +1 : -1), 1, maxAdd));
    return;
  }

  const btn = e.target.closest?.('.add-btn');
  if (btn){
    const group   = btn.closest('.add-group');
    const slug    = btn.dataset.slug;
    const name    = decodeURIComponent(btn.dataset.name);
    const price   = Number(btn.dataset.price || 0);
    const stock   = Number(btn.dataset.stock || 0);
    const valEl   = group.querySelector('.qty-val');

    const requested = Math.max(1, parseInt(valEl.textContent, 10) || 1);
    const remaining = Math.max(0, stock - getInCart(slug));
    const toAdd     = clamp(requested, 1, Math.max(1, remaining));

    if (remaining <= 0){
      if (elStatus) elStatus.textContent = t('maxStock');
      return;
    }

    addToCart({ slug, name, price, qty: toAdd, stock });
    flashAdd(btn, toAdd);
    valEl.textContent = '1';
  }
});

// 8) Logique panier
function addToCart({ slug, name, price, qty, stock }){
  const it = cart.get(slug);
  if (it){
    it.qty = clamp(it.qty + qty, 1, stock);
    it.price = price;
    it.stock = stock;
  } else {
    cart.set(slug, { name, price, qty: clamp(qty, 1, stock), stock });
  }
  renderCart();
}

function changeCartQty(slug, delta){
  const it = cart.get(slug);
  if (!it) return;
  it.qty = clamp(it.qty + delta, 1, it.stock); // min 1
  renderCart();
}

function removeFromCart(slug){
  cart.delete(slug);
  renderCart();
}

btnClear?.addEventListener('click', ()=>{
  cart.clear();
  renderCart();
});

// Rendu du panier
function renderCart(){
  if (!cartBody) return;
  cartBody.innerHTML = '';
  let total = 0;

  // Panier vide -> message + on cache thead
  if (cart.size === 0){
    cartHead?.classList.add('hidden');
    if (cartEmpty) cartEmpty.hidden = false;
    if (cartTotal) cartTotal.textContent = fmtPrice.format(0);
    if (cartCount) cartCount.textContent = '0';
    return;
  } else {
    cartHead?.classList.remove('hidden');
    if (cartEmpty) cartEmpty.hidden = true;
  }

  for (const [slug, it] of cart.entries()){
    const subtotal = (it.price || 0) * it.qty;
    total += subtotal;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="padding:10px 8px;border-top:1px solid rgba(36,48,39,.08)">${it.name}</td>
      <td style="padding:10px 8px;border-top:1px solid rgba(36,48,39,.08);text-align:right">${fmtPrice.format(it.price || 0)}</td>
      <td style="padding:6px 8px;border-top:1px solid rgba(36,48,39,.08);text-align:center">
        <div class="qty-control" aria-label="Quantité dans le panier">
          <button class="cart-dec" data-slug="${slug}" aria-label="Retirer 1" ${it.qty <= 1 ? 'disabled' : ''}>−</button>
          <span class="qty-val">${it.qty}</span>
          <button class="cart-inc" data-slug="${slug}" aria-label="Ajouter 1">+</button>
        </div>
      </td>
      <td style="padding:10px 8px;border-top:1px solid rgba(36,48,39,.08);text-align:right">${fmtPrice.format(subtotal)}</td>
      <td style="padding:10px 8px;border-top:1px solid rgba(36,48,39,.08);text-align:right">
        <button class="btn ghost is-compact cart-rm" data-slug="${slug}">${t('remove')}</button>
      </td>
    `;
    cartBody.appendChild(tr);
  }


  if (cartTotal) cartTotal.textContent = fmtPrice.format(total);
  if (cartCount) cartCount.textContent = String(cart.size);

  // Délégation +/−/supprimer
  cartBody.onclick = (e)=>{
    const inc = e.target.closest?.('.cart-inc');
    const dec = e.target.closest?.('.cart-dec');
    const rm  = e.target.closest?.('.cart-rm');
    if (inc) changeCartQty(inc.dataset.slug, +1);
    if (dec) changeCartQty(dec.dataset.slug, -1);
    if (rm)  removeFromCart(rm.dataset.slug);
  };
}

function openCart(){
  setHeaderOffset();
  const panel   = document.getElementById('cartPanel');
  const overlay = document.getElementById('cartOverlay');

  panel?.classList.add('open');
  cartFab?.classList.add('hidden');
  cartFab?.setAttribute('aria-expanded','true');
  if (overlay) overlay.hidden = false;

  setCartDrawerResponsive(); // ← applique largeur fixe/100% selon écran
}

function openCart(){
  setHeaderOffset();
  const panel   = document.getElementById('cartPanel');
  const overlay = document.getElementById('cartOverlay');

  panel?.classList.add('open');
  cartFab?.classList.add('hidden');
  cartFab?.setAttribute('aria-expanded','true');
  if (overlay) overlay.hidden = false;

  setCartDrawerResponsive(); // ← applique largeur fixe/100% selon écran
}

// --- Ajoute cette fonction utilitaire ---
function resetCartDrawerStyles() {
  const panel = document.getElementById('cartPanel');
  if (!panel) return;

  // Place le tiroir hors-écran tout de suite
  panel.style.transform = 'translateX(110%)';

  // Nettoie les styles inline pour rendre la main au CSS de base
  ['position','top','right','left','width','maxWidth','height','borderRadius','boxShadow']
    .forEach(p => panel.style.removeProperty(p));

  const scroll = panel.querySelector('.cart-scroll');
  if (scroll) {
    ['maxHeight','overflowY','overflowX'].forEach(p => scroll.style.removeProperty(p));
  }
}

// --- Remplace entièrement ta fonction closeCart() par celle-ci ---
function closeCart(){
  const panel   = document.getElementById('cartPanel');
  const overlay = document.getElementById('cartOverlay');

  if (panel) {
    panel.classList.remove('open');

    // anime la sortie puis nettoie les styles inline
    panel.style.transform = 'translateX(110%)';
    panel.addEventListener('transitionend', function handler(){
      resetCartDrawerStyles();
      panel.removeEventListener('transitionend', handler);
    }, { once: true });
  }

  if (overlay) overlay.hidden = true;

  cartFab?.classList.remove('hidden');
  cartFab?.setAttribute('aria-expanded','false');

  // réactive le scroll de la page
  document.documentElement.style.removeProperty('overflow');
  document.body.style.removeProperty('overflow');
}

// Largeur fixe desktop, 100% en mobile
function setCartDrawerResponsive() {
  const panel   = document.getElementById('cartPanel');
  const overlay = document.getElementById('cartOverlay');
  if (!panel) return;

  const headerH = (document.querySelector('.site-header')?.offsetHeight || 0);
  const isMobile = window.matchMedia('(max-width: 700px)').matches; // point de bascule
  const isOpen   = panel.classList.contains('open');

  // ← fixe sur desktop (ajuste la valeur si tu veux 400/420/460px)
  const width = isMobile ? '100vw' : '650px';

  Object.assign(panel.style, {
    position: 'fixed',
    top: headerH + 'px',
    right: '0',
    left:  isMobile ? '0' : 'auto',
    width,
    maxWidth: width,
    height: `calc(100svh - ${headerH}px)`,
    borderRadius: isMobile ? '0' : '16px 0 0 16px',
    boxShadow:   isMobile ? '0 0 0 rgba(0,0,0,0)' : '0 8px 22px rgba(36,48,39,.12)',
    transform:   isOpen ? 'translateX(0)' : 'translateX(110%)'
  });

  const scroll = panel.querySelector('.cart-scroll');
  const head   = panel.querySelector('.cart-header');
  const foot   = panel.querySelector('.cart-footer');
  const hH = head?.offsetHeight || 0;
  const fH = foot?.offsetHeight || 0;
  if (scroll){
    Object.assign(scroll.style, {
      maxHeight: `calc(100% - ${hH + fH}px)`,
      overflowY: 'auto',
      overflowX: 'hidden',
    });
  }

  if (overlay) overlay.style.inset = '0';

  if (isOpen){
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
  } else {
    document.documentElement.style.removeProperty('overflow');
    document.body.style.removeProperty('overflow');
  }
}


// Ouvertures / Fermetures
cartFab?.addEventListener('click', openCart);
cartClose?.addEventListener('click', closeCart);
cartOverlay?.addEventListener('click', closeCart);
document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') closeCart(); });

window.addEventListener('resize', () => {
  setHeaderOffset();
  setCartDrawerResponsive();
});


// 10) Init
(async function init(){
  setHeaderOffset();
  const rows = await loadAvailable();
  renderTable(rows);
  renderCart(); // badge à 0 et “panier vide”
})();

// Expose le panier pour payments.js
window.prepareCheckoutItems = () =>
  Array.from(cart.entries()).map(([slug, it]) => ({ slug, qty: it.qty }));

window.cartIsEmpty = () => cart.size === 0;

/* ========= Mise en page mobile du tableau produits (sans changer le HTML) ========= */
(function () {
  const MQ = '(max-width: 640px)';
  const L = { price: t('price'), stock: t('stock') };

  function ensureLabel(td, labelText) {
    if (!td || td.dataset.labeled === '1') return;

    const value = document.createElement('span');
    value.className = 'col-value';
    while (td.firstChild) value.appendChild(td.firstChild);

    const label = document.createElement('span');
    label.className = 'col-label';
    label.textContent = labelText;

    td.style.display = 'flex';
    td.style.justifyContent = 'space-between';
    td.style.alignItems = 'center';
    td.style.padding = '10px 6px';
    td.style.borderTop = td.parentElement && td.cellIndex ? '1px solid rgba(36,48,39,.08)' : '0';
    td.style.whiteSpace = 'normal';
    td.style.overflowWrap = 'anywhere';

    label.style.fontSize = '0.95rem';
    label.style.opacity = '0.85';
    label.style.color = 'var(--brand-700, #4E6A57)';
    label.style.marginRight = '12px';
    label.style.flex = '0 0 auto';

    value.style.fontWeight = '600';
    value.style.textAlign = 'right';
    value.style.flex = '1 1 auto';

    td.appendChild(label);
    td.appendChild(value);
    td.dataset.labeled = '1';
  }

  function removeLabel(td) {
    if (!td) return;
    const label = td.querySelector(':scope > .col-label');
    const val   = td.querySelector(':scope > .col-value');
    if (val) {
      while (val.firstChild) td.insertBefore(val.firstChild, label || null);
      val.remove();
    }
    if (label) label.remove();
    delete td.dataset.labeled;

    td.style.removeProperty('display');
    td.style.removeProperty('justify-content');
    td.style.removeProperty('align-items');
    td.style.removeProperty('padding');
    td.style.removeProperty('border-top');
    td.style.removeProperty('white-space');
    td.style.removeProperty('overflow-wrap');
    td.style.removeProperty('text-align');
  }

  function styleRowMobile(tr) {
    const tds = Array.from(tr.cells);
    if (tds.length < 4) return;

    const category = tds[0];          // 0 = catégorie (déjà masquée par ton CSS)
    const name     = tds[1];          // 1 = produit
    const price    = tds[2];          // 2 = prix
    const stock    = tds[3];          // 3 = stock
    const actions  = tds[4] || tds[tds.length - 1]; // 4 = zone boutons

    if (category) category.style.display = 'none'; // reste masquée

    tr.style.display = 'block';
    tr.style.margin = '12px 0';

    if (name) {
      name.style.display = 'block';
      name.style.padding = '10px 6px';
      name.style.fontWeight = '600';
      name.style.borderTop = '0';
    }

    ensureLabel(price, L.price);
    ensureLabel(stock, L.stock);

    if (actions) {
      const box = actions.querySelector('.add-group') || actions.firstElementChild || actions;
      box.style.display = 'grid';
      box.style.gridTemplateColumns = 'auto 1fr'; // stepper + bouton
      box.style.alignItems = 'center';
      box.style.gap = '12px';
      box.style.width = '100%';

      const btn = actions.querySelector('.btn');
      if (btn) {
        btn.style.width = '100%';
        btn.style.justifyContent = 'center';
      }

      // Stepper à largeur naturelle
      const stepper = actions.querySelector('.qty-control');
      if (stepper) {
        stepper.style.justifySelf = 'start';
        stepper.style.width = 'auto';
      }

      actions.style.display = 'block';
      actions.style.padding = '10px 6px';
      actions.style.borderTop = '1px solid rgba(36,48,39,.08)';
    }
  }

  function resetRowDesktop(tr) {
    const tds = Array.from(tr.cells);
    tr.style.removeProperty('display');
    tr.style.removeProperty('margin');

    if (tds[0]) tds[0].style.removeProperty('display');

    removeLabel(tds[2]); // price
    removeLabel(tds[3]); // stock

    const name = tds[1];
    if (name) {
      name.style.removeProperty('display');
      name.style.removeProperty('padding');
      name.style.removeProperty('font-weight');
      name.style.removeProperty('border-top');
    }

    const actions = tds[4] || tds[tds.length - 1];
    if (actions) {
      const box = actions.querySelector('.add-group') || actions.firstElementChild;
      if (box) {
        box.style.removeProperty('display');
        box.style.removeProperty('grid-template-columns');
        box.style.removeProperty('align-items');
        box.style.removeProperty('gap');
        box.style.removeProperty('width');
      }
      const btn = actions.querySelector('.btn');
      if (btn) btn.style.removeProperty('width');
      const stepper = actions.querySelector('.qty-control');
      if (stepper) {
        stepper.style.removeProperty('justify-self');
        stepper.style.removeProperty('width');
      }
      actions.style.removeProperty('display');
      actions.style.removeProperty('padding');
      actions.style.removeProperty('border-top');
    }
  }

  function adapt() {
    const table = document.getElementById('tbl');
    if (!table || !table.tBodies || !table.tBodies[0]) return;

    const mobile = window.matchMedia(MQ).matches;
    const tbody  = table.tBodies[0];
    const thead  = table.tHead;

    if (mobile) {
      if (thead) thead.style.display = 'none';
      Array.from(tbody.rows).forEach(styleRowMobile);
    } else {
      if (thead) thead.style.removeProperty('display');
      Array.from(tbody.rows).forEach(resetRowDesktop);
    }
  }

  document.addEventListener('DOMContentLoaded', adapt);
  window.addEventListener('resize', adapt);

  const observer = new MutationObserver(() => requestAnimationFrame(adapt));
  document.addEventListener('DOMContentLoaded', () => {
    const target = document.querySelector('#tbl tbody');
    if (target) observer.observe(target, { childList: true });
  });
})();

/* ========= Mise en page mobile du tableau du panier (sans toucher au HTML) ========= */
(function () {
  const MQ = '(max-width: 640px)';
  const L = { price: t('price'), qty: t('qty'), subtotal: t('subtotal') };

  function ensureLabel(td, labelText) {
    if (!td || td.dataset.labeled === '1') return;

    const value = document.createElement('span');
    value.className = 'col-value';
    while (td.firstChild) value.appendChild(td.firstChild);

    const label = document.createElement('span');
    label.className = 'col-label';
    label.textContent = labelText;

    td.style.display = 'flex';
    td.style.justifyContent = 'space-between';
    td.style.alignItems = 'center';
    td.style.padding = '10px 8px';
    td.style.borderTop = '1px solid rgba(36,48,39,.08)';
    td.style.whiteSpace = 'normal';
    td.style.overflowWrap = 'anywhere';

    label.style.fontSize = '0.95rem';
    label.style.opacity = '0.85';
    label.style.color = 'var(--brand-700, #4E6A57)';
    label.style.marginRight = '12px';
    label.style.flex = '0 0 auto';

    value.style.fontWeight = '600';
    value.style.textAlign = 'right';
    value.style.flex = '1 1 auto';

    td.appendChild(label);
    td.appendChild(value);
    td.dataset.labeled = '1';
  }

  function removeLabel(td) {
    if (!td) return;
    const label = td.querySelector(':scope > .col-label');
    const val   = td.querySelector(':scope > .col-value');
    if (val) {
      while (val.firstChild) td.insertBefore(val.firstChild, label || null);
      val.remove();
    }
    if (label) label.remove();
    delete td.dataset.labeled;

    td.style.removeProperty('display');
    td.style.removeProperty('justify-content');
    td.style.removeProperty('align-items');
    td.style.removeProperty('padding');
    td.style.removeProperty('border-top');
    td.style.removeProperty('white-space');
    td.style.removeProperty('overflow-wrap');
    td.style.removeProperty('text-align');
  }

  function styleCartRowMobile(tr) {
    const tds = Array.from(tr.cells);
    if (tds.length < 4) return;

    const name     = tds[0]; // Produit
    const price    = tds[1]; // Prix
    const qty      = tds[2]; // Qté (stepper)
    const subtotal = tds[3]; // Sous-total
    const remove   = tds[4]; // bouton supprimer

    tr.style.display = 'block';
    tr.style.margin  = '12px 0';

    if (name) {
      name.style.display = 'block';
      name.style.padding = '10px 8px';
      name.style.fontWeight = '600';
      name.style.borderTop = '0';
    }

    ensureLabel(price, L.price);
    ensureLabel(qty,   L.qty);
    ensureLabel(subtotal, L.subtotal);

    const qtyControl = qty?.querySelector('.qty-control');
    if (qtyControl) {
      qtyControl.style.justifySelf = 'start';
      qtyControl.style.width = 'auto';
    }

    if (remove) {
      remove.style.display = 'block';
      remove.style.textAlign = 'right';
      remove.style.padding = '10px 8px';
      remove.style.borderTop = '1px solid rgba(36,48,39,.08)';
    }
  }

  function resetCartRowDesktop(tr) {
    const tds = Array.from(tr.cells);
    tr.style.removeProperty('display');
    tr.style.removeProperty('margin');

    ['padding','font-weight','border-top','display','text-align'].forEach(p => {
      if (tds[0]) tds[0].style.removeProperty(p);
    });

    removeLabel(tds[1]);
    removeLabel(tds[2]);
    removeLabel(tds[3]);

    if (tds[4]) {
      tds[4].style.removeProperty('display');
      tds[4].style.removeProperty('text-align');
      tds[4].style.removeProperty('padding');
      tds[4].style.removeProperty('border-top');
    }
  }

  function layoutCart() {
    const table = document.getElementById('cart');
    if (!table || !table.tBodies || !table.tBodies[0]) return;

    const mobile = window.matchMedia(MQ).matches;
    const tbody  = table.tBodies[0];
    const thead  = table.tHead;

    if (mobile) {
      if (thead) thead.style.display = 'none';
      Array.from(tbody.rows).forEach(styleCartRowMobile);
    } else {
      if (thead) thead.style.removeProperty('display');
      Array.from(tbody.rows).forEach(resetCartRowDesktop);
    }
  }

  document.addEventListener('DOMContentLoaded', layoutCart);
  window.addEventListener('resize', layoutCart);

  // Observer les lignes ajoutées/supprimées
  const mo = new MutationObserver(() => requestAnimationFrame(layoutCart));
  document.addEventListener('DOMContentLoaded', () => {
    const target = document.querySelector('#cart tbody');
    if (target) mo.observe(target, { childList: true });
  });

  // Recalcule à chaque ouverture/fermeture (pour garder l’affichage propre)
  ['click','transitionend'].forEach(ev => {
    document.addEventListener(ev, (e) => {
      const id = e.target?.id;
      if (id === 'cartFab' || id === 'cartClose' || id === 'cartOverlay') {
        requestAnimationFrame(layoutCart);
      }
    });
  });
})();
