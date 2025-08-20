import Stripe from "https://esm.sh/stripe@15?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // 1) Lire le RAW body + header de signature
  const rawBody = await req.text();
  const sig =
    req.headers.get("Stripe-Signature") ??
    req.headers.get("stripe-signature") ??
    "";

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      sig,
      STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    console.error("❌ Signature webhook invalide:", err);
    return new Response(
      JSON.stringify({
        error: "Webhook signature verification failed",
        detail: String(err?.message || err),
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      // 2) Récupère l'order_id (métadonnées posées à la création de la session)
      const orderId =
        (session.metadata && (session.metadata as Record<string, string>).order_id) || null;

      if (!orderId) {
        // Fallback par session_id si tu l'as stocké côté DB au moment du checkout
        const { data: found, error: findErr } = await supabase
          .from("orders")
          .select("id")
          .eq("session_id", session.id)
          .maybeSingle();

        if (findErr) {
          console.error("❌ Lookup order by session_id:", findErr);
        }

        if (found?.id) {
          const { data: res, error: rpcErr } = await supabase.rpc(
            "complete_order_and_adjust_stock",
            { p_order_id: found.id },
          );
          if (rpcErr) {
            console.error("❌ RPC (fallback) complete_order_and_adjust_stock:", rpcErr);
            return new Response(JSON.stringify({ error: "rpc failed (fallback)" }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }
          console.log("✅ Stock ajusté (fallback) pour order_id:", found.id, "->", res);
        } else {
          console.warn("⚠️ Aucun order_id ni session_id correspondant.");
        }
      } else {
        // 3) Appel direct de la RPC transactionnelle
        const { data: res, error: rpcErr } = await supabase.rpc(
          "complete_order_and_adjust_stock",
          { p_order_id: orderId },
        );
        if (rpcErr) {
          console.error("❌ RPC complete_order_and_adjust_stock:", rpcErr);
          // 500 => Stripe retentera
          return new Response(JSON.stringify({ error: "rpc failed" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        console.log("✅ Stock ajusté pour order_id:", orderId, "->", res);
      }
    }

    // 4) OK pour Stripe
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("❌ Erreur inattendue:", e);
    return new Response(JSON.stringify({ error: "processing failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
