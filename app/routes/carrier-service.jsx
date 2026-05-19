/**
 * PUBLIC ROUTE — no Shopify session auth.
 * Shopify POSTs here at checkout to retrieve shipping rates.
 *
 * Path:   /carrier-service
 * Header: X-Shopify-Shop-Domain: storename.myshopify.com
 * Body:   { rate: { origin, destination, items, currency } }
 */
import db from "../db.server";
import { findZoneByZip } from "../models/zone.server";

// GET — confirms the endpoint is reachable
export const loader = async () => {
  return Response.json({ status: "Zip Code Carrier Service active" });
};

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  // 1. Identify shop
  const shopDomain = request.headers.get("X-Shopify-Shop-Domain") || "am-shipping-rates.myshopify.com"; // for local testing with Shopify CLI preview URL
  if (!shopDomain) {
    console.error("[carrier-service] Missing X-Shopify-Shop-Domain header");
    return Response.json({ error: "Missing shop domain header" }, { status: 400 });
  }
  console.log(`[carrier-service] Called for shop: ${shopDomain}`);

  // 2. Verify this shop has the app installed
  // Use CarrierService record — more reliable than Session (sessions can expire)
  const carrierRecord = await db.carrierService.findUnique({
    where: { shopDomain },
    select: { id: true },
  });
  if (!carrierRecord) {
    console.error(`[carrier-service] No carrier record found for ${shopDomain}`);
    return Response.json({ rates: [] });
  }

  // 3. Parse body
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rateRequest = body?.rate;
  if (!rateRequest) return Response.json({ rates: [] });

  // IMPORTANT: Shopify uses "postal_code" not "zip"
  const destinationZip = rateRequest.destination?.postal_code;
  const currency = rateRequest.currency || "AUD";

  console.log(`[carrier-service] Destination postal_code: "${destinationZip}"`);

  if (!destinationZip) {
    console.error("[carrier-service] No postal_code in destination");
    return Response.json({ rates: [] });
  }

  // 4. Find matching zone
  const zone = await findZoneByZip(shopDomain, destinationZip);
  console.log(
    `[carrier-service] Zone match: ${zone ? `"${zone.name}" (${zone.rates.length} rates)` : "none"}`
  );

  if (!zone || zone.rates.length === 0) {
    return Response.json({ rates: [] });
  }

  // 5. Calculate cart totals
  // Shopify sends item prices in cents → convert to dollars
  const cartTotalDollars =
    (rateRequest.items ?? []).reduce(
      (sum, item) => sum + item.price * item.quantity, 0
    ) / 100;

  // Shopify sends weight in grams → convert to kg
  const totalWeightKg =
    (rateRequest.items ?? []).reduce(
      (sum, item) => sum + (item.grams ?? 0) * item.quantity, 0
    ) / 1000;

  console.log(`[carrier-service] Cart total: $${cartTotalDollars.toFixed(2)}, weight: ${totalWeightKg.toFixed(3)}kg`);

  // 6. Filter matching rates
  const matchedRates = zone.rates
    .filter((rate) => {
      const val = rate.type === "price" ? cartTotalDollars : totalWeightKg;
      return val >= rate.minValue && (rate.maxValue == null || val <= rate.maxValue);
    })
    .map((rate) => ({
      service_name: rate.name,
      service_code: `zip_rate_${rate.id}`,
      total_price: Math.round(rate.price * 100).toString(), // Shopify expects cents as string
      description: rate.description ?? "",
      currency,
      min_delivery_date: null,
      max_delivery_date: null,
    }));

  console.log(`[carrier-service] Returning ${matchedRates.length} rate(s)`);
  return Response.json({ rates: matchedRates });
};
