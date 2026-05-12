import { useLoaderData } from "react-router";
import { useRef, useEffect, useState } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { registerCarrierService } from "../carrier.server";
import { getZones } from "../models/zone.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  // Register Shopify Carrier Service for this shop (idempotent)
  try {
    await registerCarrierService(admin, session.shop);
  } catch (e) {
    console.error("Carrier service registration failed:", e.message);
  }

  const zones = await getZones(session.shop);
  return { zones };
};

export default function ZonesPage() {
  const { zones } = useLoaderData();
  const [search, setSearch] = useState("");
  const searchRef = useRef(null);

  // Use addEventListener for web component events (React 18)
  useEffect(() => {
    const el = searchRef.current;
    if (!el) return;
    const handler = (e) => setSearch(e.target.value ?? "");
    el.addEventListener("input", handler);
    return () => el.removeEventListener("input", handler);
  }, []);

  const filtered = zones.filter((z) =>
    z.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <s-page heading="Zones and rates">
      {/* Primary action rendered in the Shopify admin header */}
      <s-link slot="primary-action" href="/app/zones/new">
        <s-button variant="primary">Create a zone</s-button>
      </s-link>

      <s-section>
        <s-stack direction="block" gap="base">
          {/* Search field */}
          <s-search-field
            ref={searchRef}
            placeholder="Search zones"
            value={search}
          ></s-search-field>

          {/* Empty state */}
          {zones.length === 0 && (
            <s-stack direction="block" gap="base">
              <s-paragraph>
                No shipping zones yet. Create a zone to start assigning zip code-based shipping rates.
              </s-paragraph>
              <s-link href="/app/zones/new">
                <s-button variant="primary">Create a zone</s-button>
              </s-link>
            </s-stack>
          )}

          {/* No search results */}
          {zones.length > 0 && filtered.length === 0 && (
            <s-paragraph>No zones match your search.</s-paragraph>
          )}

          {/* Zones table */}
          {filtered.length > 0 && (
            <s-table>
              <s-table-header-row>
                <s-table-header>Zone name</s-table-header>
                <s-table-header>Zip codes</s-table-header>
                <s-table-header>Rates</s-table-header>
                <s-table-header>Status</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {filtered.map((zone) => (
                  <s-table-row key={zone.id}>
                    <s-table-cell>
                      <s-link href={`/app/zones/${zone.id}`}>
                        {zone.name}
                      </s-link>
                    </s-table-cell>
                    <s-table-cell>
                      {zone.zipCodes.split(",").filter((z) => z.trim()).length}{" "}
                      zip codes
                    </s-table-cell>
                    <s-table-cell>
                      {zone.rates.length}{" "}
                      {zone.rates.length === 1 ? "rate" : "rates"}
                    </s-table-cell>
                    <s-table-cell>
                      <s-badge
                        tone={zone.status === "enabled" ? "success" : "neutral"}
                      >
                        {zone.status === "enabled" ? "Enabled" : "Disabled"}
                      </s-badge>
                    </s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
