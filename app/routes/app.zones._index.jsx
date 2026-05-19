import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { useRef, useEffect, useState } from "react";
import { redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  registerCarrierService,
  reRegisterCarrierService,
  getCarrierServiceStatus,
} from "../carrier.server";
import { getZones } from "../models/zone.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  // Register or update carrier service (handles URL changes automatically)
  try {
    await registerCarrierService(admin, session.shop);
  } catch (e) {
    console.error("Carrier service registration failed:", e.message);
  }

  const [zones, carrierStatus] = await Promise.all([
    getZones(session.shop),
    getCarrierServiceStatus(session.shop),
  ]);

  return { zones, carrierStatus };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "reregister") {
    try {
      await reRegisterCarrierService(admin, session.shop);
    } catch (e) {
      return { error: e.message };
    }
  }

  return redirect("/app/zones");
};

export default function ZonesIndexPage() {
  const { zones, carrierStatus } = useLoaderData();
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const [search, setSearch] = useState("");
  const searchRef = useRef(null);
  const isReregistering = fetcher.state !== "idle";

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
      <s-button
        slot="primary-action"
        onClick={() => navigate("/app/zones/new")}
      >
        Create a zone
      </s-button>

      {/* ── Carrier service status banner ─────────────────────────────── */}
      {!carrierStatus.registered && (
        <s-banner tone="warning" heading="Carrier service not registered">
          <s-paragraph>
            The shipping rate carrier service could not be registered with
            Shopify. Rates will not appear at checkout. Try re-registering
            below.
          </s-paragraph>
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="reregister" />
            <s-button
              type="submit"
              {...(isReregistering ? { loading: true } : {})}
            >
              Register carrier service
            </s-button>
          </fetcher.Form>
        </s-banner>
      )}

      {carrierStatus.urlMismatch && (
        <s-banner tone="warning" heading="Callback URL mismatch">
          <s-paragraph>
            Your app URL has changed (common when the dev tunnel restarts).
            Shopify is calling the old URL and getting no response.
          </s-paragraph>
          <s-paragraph>
            Registered: <strong>{carrierStatus.registeredCallbackUrl}</strong>
          </s-paragraph>
          <s-paragraph>
            Current: <strong>{carrierStatus.currentCallbackUrl}</strong>
          </s-paragraph>
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="reregister" />
            <s-button
              type="submit"
              {...(isReregistering ? { loading: true } : {})}
            >
              Re-register with current URL
            </s-button>
          </fetcher.Form>
        </s-banner>
      )}

      {carrierStatus.registered && !carrierStatus.urlMismatch && (
        <s-banner tone="info" heading="How to activate rates at checkout">
          <s-paragraph>
            The carrier service is registered. To make rates appear at checkout
            you must connect it to your shipping profile:
          </s-paragraph>
          <s-unordered-list>
            <s-list-item>
              Go to <strong>Settings → Shipping and delivery</strong>
            </s-list-item>
            <s-list-item>
              Click <strong>Manage rates</strong> on your shipping profile
            </s-list-item>
            <s-list-item>
              Under a shipping zone, click <strong>Add rate</strong>
            </s-list-item>
            <s-list-item>
              Choose <strong>Use carrier or app to calculate rates</strong>
            </s-list-item>
            <s-list-item>
              Select <strong>Zip Code Shipping Rates</strong> → Save
            </s-list-item>
          </s-unordered-list>
          <s-paragraph>
            Callback URL: <strong>{carrierStatus.registeredCallbackUrl}</strong>
          </s-paragraph>
        </s-banner>
      )}

      {/* ── Zones table ───────────────────────────────────────────────── */}
      <s-section>
        <s-stack direction="block" gap="base">
          <s-search-field
            ref={searchRef}
            placeholder="Search zones"
          ></s-search-field>

          {zones.length === 0 && (
            <s-paragraph>
              No shipping zones yet. Create a zone to start assigning zip
              code-based shipping rates.
            </s-paragraph>
          )}

          {zones.length > 0 && filtered.length === 0 && (
            <s-paragraph>No zones match your search.</s-paragraph>
          )}

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
                      {
                        zone.zipCodes.split(",").filter((z) => z.trim())
                          .length
                      }{" "}
                      zip codes
                    </s-table-cell>
                    <s-table-cell>
                      {zone.rates.length}{" "}
                      {zone.rates.length === 1 ? "rate" : "rates"}
                    </s-table-cell>
                    <s-table-cell>
                      <s-badge
                        tone={
                          zone.status === "enabled" ? "success" : "neutral"
                        }
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
