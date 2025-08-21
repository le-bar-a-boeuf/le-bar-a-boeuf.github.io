// supabase/functions/checkout/index.ts
// Crée une session Stripe Checkout à partir du panier et renvoie { url }.
// Entrée côté front : { items: [{ slug, qty }], locale?: 'fr', success_url?, cancel_url? }

import Stripe from "https://esm.sh/stripe@15?target=deno";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --------- ENV ----------
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL_ENV = (Deno.env.get("SITE_URL") || "").replace(/\/+$/, ""); // ex: https://ton-domaine.fr

if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing env: STRIPE_SECRET_KEY / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
}

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
const admin = createClient(SUPABASE_URL, SERVICE_KEY);

// --------- CORS helper ----------
function withCORS(res: Response): Response {
  const h = res.headers;
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  // Autoriser les en-têtes envoyés par supabase-js et fetch
  h.set(
    "Access-Control-Allow-Headers",
    "authorization, apikey, content-type, x-client-info, X-Client-Info, x-supabase-api-version, x-requested-with"
  );
  h.set("Access-Control-Max-Age", "86400");
  if (!h.has("Content-Type")) h.set("Content-Type", "application/json");
  return res;
}

// --------- URL success/cancel ----------
function inferUrls(req: Request, body: any) {
  // 0) Si le front fournit explicitement, on respecte
  if (body?.success_url && body?.cancel_url) {
    return {
      success_url: String(body.success_url),
      cancel_url:  String(body.cancel_url),
    };
  }

  // 1) D’abord on essaie le Referer pour savoir si on est en /en/… ou non
  const ref = req.headers.get("referer");
  if (ref) {
    try {
      const u = new URL(ref);
      const isEn = u.pathname.startsWith("/en/");
      const langPrefix = isEn ? "/en" : "";
      const origin = u.origin; // ex: https://le-bar-a-boeuf.github.io

      return {
        success_url: `${origin}${langPrefix}/success/`,
        cancel_url:  `${origin}${langPrefix}/cancel/`,
      };
    } catch {
      // on continuera sur les fallbacks
    }
  }

  // 2) Ensuite, si SITE_URL est défini en secret, on s’y base.
  //    On utilise la locale envoyée (par défaut "fr") pour /en/ ou non.
  const locale: string = (body?.locale ?? "fr").toString().toLowerCase();
  if (SITE_URL_ENV) {
    const isEn = locale.startsWith("en");
    const langPrefix = isEn ? "/en" : "";
    return {
      success_url: `${SITE_URL_ENV}${langPrefix}/success/`,
      cancel_url:  `${SITE_URL_ENV}${langPrefix}/cancel/`,
    };
  }

  // 3) Dernier recours : domaine GitHub Pages (user/organization pages)
  const isEn = (body?.locale ?? "fr").toString().toLowerCase().startsWith("en");
  const langPrefix = isEn ? "/en" : "";
  const origin = "https://le-bar-a-boeuf.github.io";
  return {
    success_url: `${origin}${langPrefix}/success/`,
    cancel_url:  `${origin}${langPrefix}/cancel/`,
  };
}

// --------- Handler ----------
serve(async (req) => {
  // Préflight
  if (req.method === "OPTIONS") {
    return withCORS(new Response(null, { status: 204 }));
  }

  if (req.method !== "POST") {
    return withCORS(
      new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 }),
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const itemsIn = Array.isArray(body.items) ? body.items : [];
    const locale = body.locale ?? "fr";
    const { success_url, cancel_url } = inferUrls(req, body);

    if (itemsIn.length === 0) {
      return withCORS(new Response(JSON.stringify({ error: "No items" }), { status: 400 }));
    }

    // Normalise: on attend { slug, qty } (on tolère { quantity })
    const items = itemsIn.map((it: any) => ({
      slug: String(it.slug),
      qty: Math.max(1, Number(it.qty ?? it.quantity ?? 1) || 1),
    }));

    const slugs = items.map((i) => i.slug);

    // Récupère produits
    const { data: products, error: e0 } = await admin
      .from("products")
      .select("id,slug,name_fr,price_eur")
      .in("slug", slugs);

    if (e0) throw e0;

    const bySlug = new Map(products.map((p) => [p.slug, p]));

    // Construit lignes Stripe + order_items + total
    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    const orderItems: Array<{
      product_id: string;
      slug: string;
      name_fr: string;
      qty: number;
      unit_price_cents: number;
    }> = [];
    let totalCents = 0;

    for (const it of items) {
      const p = bySlug.get(it.slug);
      if (!p) continue;
      const qty = it.qty;
      const unitCents = Math.round(Number(p.price_eur || 0) * 100);

      line_items.push({
        quantity: qty,
        price_data: {
          currency: "eur",
          unit_amount: unitCents,
          product_data: {
            name: p.name_fr,
            metadata: { slug: p.slug, product_id: p.id },
          },
        },
      });

      orderItems.push({
        product_id: p.id,
        slug: p.slug,
        name_fr: p.name_fr,
        qty,
        unit_price_cents: unitCents,
      });

      totalCents += unitCents * qty;
    }

    if (line_items.length === 0) {
      return withCORS(new Response(JSON.stringify({ error: "No purchasable items" }), { status: 400 }));
    }

    // Crée la commande pending
    const inserting: any = {
      status: "pending",
      currency: "EUR",
    };
    // si tu veux skipper amount_cents pour avancer, commente la ligne suivante
    inserting.amount_cents = totalCents;

    const { data: order, error: e1 } = await admin
      .from("orders")
      .insert(inserting)
      .select("id")
      .single();
    if (e1) throw e1;

    // Insère les lignes de commande
    if (orderItems.length) {
      const rows = orderItems.map((oi) => ({ ...oi, order_id: order.id }));
      const { error: e2 } = await admin.from("order_items").insert(rows as any[]);
      if (e2) throw e2;
    }

    // Crée la session Stripe Checkout
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      locale,
      success_url,
      cancel_url,
      line_items,
      metadata: { order_id: order.id },
    });

    // Mémorise l'id de session Stripe
    await admin.from("orders").update({ session_id: session.id }).eq("id", order.id);

    return withCORS(new Response(JSON.stringify({ url: session.url }), { status: 200 }));
  } catch (err) {
    console.error("checkout error:", err);
    const msg = (err as any)?.message || String(err);
    return withCORS(new Response(JSON.stringify({ error: msg }), { status: 400 }));
  }
});
