// js/payments.js
// Detect page language for Stripe Checkout
const PAGE_LANG = (document.documentElement.lang || 'fr').toLowerCase().startsWith('en') ? 'en' : 'fr';

function getCartEntries() {
  const c = window.cart;
  if (!c) return [];
  if (c instanceof Map) return [...c.entries()];
  if (typeof c === 'object') return Object.entries(c);
  return [];
}

async function callCheckout({ items, locale = 'fr' }) {
  const base = window.SUPABASE_URL;
  const key  = window.SUPABASE_ANON_KEY;
  if (!base || !key) throw new Error('Config manquante SUPABASE_URL / SUPABASE_ANON_KEY');

  const resp = await fetch(`${base}/functions/v1/checkout`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // ⚠️ ces 2 headers suffisent pour authentifier l’appel SANS x-client-info
      'authorization': `Bearer ${key}`,
      'apikey': key
    },
    body: JSON.stringify({ items, locale })
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(()=>resp.statusText);
    throw new Error(`HTTP ${resp.status} – ${txt}`);
  }

  const { url } = await resp.json();
  if (!url) throw new Error('Lien de paiement manquant');
  return url;
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btnCheckout');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const entries = getCartEntries();
    if (!entries.length) { alert('Votre panier est vide.'); return; }

    const items = entries.map(([slug, it]) => ({
      slug,
      qty: Math.max(1, Number(it?.qty ?? 1) || 1)
    }));

    const old = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Redirection…';

    try {
      const url = await callCheckout({ items, locale: PAGE_LANG });
      window.location.href = url;
    } catch (e) {
      console.error(e);
      alert('Paiement impossible : ' + (e.message || e));
      btn.disabled = false;
      btn.textContent = old;
    }
  });
});
