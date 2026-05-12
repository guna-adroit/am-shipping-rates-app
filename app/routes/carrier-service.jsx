/**
 * PUBLIC ROUTE — no Shopify session auth.
 * Shopify POSTs here at checkout to fetch available shipping rates.
 *
 * Path: /carrier-service
 * Header: X-Shopify-Shop-Domain: storename.myshopify.com
 */
import db from "../db.server";
import { findZoneByZip } from "../models/zone.server";

// GET — health check
export const loader = async () => {
  return Response.json({ status: "Zip Code Carrier Service is active" });
};

// POST — called by Shopify at checkout
export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  // 1. Identify shop from header
  const shopDomain = request.headers.get("X-Shopify-Shop-Domain");
  if (!shopDomain) {
    return Response.json(
      { error: "Missing X-Shopify-Shop-Domain header" },
      { status: 400 },
    );
  }

  // 2. Verify shop is installed (security check)
  const session = await db.session.findFirst({
    where: { shop: shopDomain },
    select: { id: true },
  });
  if (!session) {
    return Response.json({ rates: [] });
  }

  // 3. Parse the rate request body
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rateRequest = body?.rate;
  if (!rateRequest) return Response.json({ rates: [] });

  const destinationZip = rateRequest.destination?.zip;
  const currency = rateRequest.currency || "USD";

  if (!destinationZip) return Response.json({ rates: [] });

  // 4. Find the zone matching this zip code
  const zone = await findZoneByZip(shopDomain, destinationZip);
  if (!zone || zone.rates.length === 0) return Response.json({ rates: [] });

  // 5. Calculate cart totals
  // Shopify sends item prices in cents → convert to dollars
  const cartTotalDollars =
    (rateRequest.items ?? []).reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    ) / 100;

  // Shopify sends weight in grams → convert to kg
  const totalWeightKg =
    (rateRequest.items ?? []).reduce(
      (sum, item) => sum + (item.grams ?? 0) * item.quantity,
      0,
    ) / 1000;

  // 6. Filter and return applicable rates
  const matchedRates = zone.rates
    .filter((rate) => {
      const cartValue = rate.type === "price" ? cartTotalDollars : totalWeightKg;
      const aboveMin = cartValue >= rate.minValue;
      const belowMax = rate.maxValue == null || cartValue <= rate.maxValue;
      return aboveMin && belowMax;
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

  return Response.json({ rates: matchedRates });
};
