import { redirect, data } from "react-router";
import {
  Form,
  useFetcher,
  useLoaderData,
  useActionData,
  useNavigate,
  useNavigation,
} from "react-router";
import { useRef, useEffect } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getZone, updateZone, deleteZone } from "../models/zone.server";
import { deleteRate } from "../models/rate.server";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const zone = await getZone(params.zoneId, session.shop);
  if (!zone) throw new Response("Zone not found", { status: 404 });
  return { zone };
};

export const action = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "delete-zone") {
    await deleteZone(params.zoneId);
    return redirect("/app/zones");
  }

  if (intent === "delete-rate") {
    const rateId = formData.get("rateId")?.toString();
    if (rateId) await deleteRate(rateId);
    return { ok: true };
  }

  // Default: update zone
  const name = formData.get("name")?.toString().trim() ?? "";
  const zipCodes = formData.get("zipCodes")?.toString().trim() ?? "";
  const status = formData.get("status")?.toString() ?? "enabled";

  const errors = {};
  if (!name) errors.name = "Zone name is required";
  if (!zipCodes) errors.zipCodes = "At least one zip code is required";

  if (Object.keys(errors).length) {
    return data({ errors, values: { name, zipCodes, status } }, { status: 400 });
  }

  await updateZone(params.zoneId, { name, zipCodes, status });
  return { ok: true, saved: true };
};

export default function EditZoneIndexPage() {
  const { zone } = useLoaderData();
  const actionData = useActionData();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const rateFetcher = useFetcher();
  const FORM_ID = "edit-zone-form";
  const DELETE_FORM_ID = "delete-zone-form";

  const isSaving =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") !== "delete-zone";

  // Refs to set web component values as DOM properties (React 18 requirement)
  const nameRef = useRef(null);
  const zipCodesRef = useRef(null);
  const statusRef = useRef(null);

  // Set initial values from loader data
  useEffect(() => {
    if (nameRef.current) nameRef.current.value = zone.name;
    if (zipCodesRef.current) zipCodesRef.current.value = zone.zipCodes;
    if (statusRef.current) statusRef.current.value = zone.status;
  }, [zone]);

  // Repopulate on validation error
  useEffect(() => {
    if (!actionData?.values) return;
    if (nameRef.current) nameRef.current.value = actionData.values.name ?? "";
    if (zipCodesRef.current) zipCodesRef.current.value = actionData.values.zipCodes ?? "";
    if (statusRef.current) statusRef.current.value = actionData.values.status ?? "enabled";
  }, [actionData]);

  const priceRates = zone.rates.filter((r) => r.type === "price");
  const weightRates = zone.rates.filter((r) => r.type === "weight");

  return (
    <s-page heading="Edit Zone">
      {/* Save */}
      <s-button
        slot="primary-action"
        {...(isSaving ? { loading: true } : {})}
        onClick={() => document.getElementById(FORM_ID)?.requestSubmit()}
      >
        Save
      </s-button>

      {/* Secondary actions */}
      <s-link slot="secondary-actions" href="/app/zones">Cancel</s-link>
      <s-button
        slot="secondary-actions"
        tone="critical"
        variant="primary"
        commandFor="delete-zone-modal"
      >
        Delete zone
      </s-button>

      {/* Zone details form */}
      <Form method="post" id={FORM_ID}>
        <input type="hidden" name="intent" value="update-zone" />

        <s-section heading="Zone details">
          <s-stack direction="block" gap="base">
            <s-text-field
              ref={nameRef}
              label="Zone name"
              name="name"
              help-text="For internal use only — not visible to customers."
              error-message={actionData?.errors?.name ?? ""}
              required
            ></s-text-field>

            <s-text-area
              ref={zipCodesRef}
              label="Zip codes"
              name="zipCodes"
              rows="4"
              help-text="Separate postal codes with a comma. Each postal code must belong to only one zone."
              error-message={actionData?.errors?.zipCodes ?? ""}
              required
            ></s-text-area>

            <s-select
              ref={statusRef}
              label="Zone status"
              name="status"
            >
              <s-option value="enabled">Enabled</s-option>
              <s-option value="disabled">Disabled</s-option>
            </s-select>
          </s-stack>
        </s-section>
      </Form>

      {/*
        Rates aside — DIRECT child of <s-page>, outside <Form>.
        Slot distribution requires direct parentage of the shadow host.
      */}
      <s-section slot="aside" heading="Rates">
        <s-stack direction="block" gap="base">
          {/* Price-based rates */}
          <s-stack direction="block" gap="small">
            <s-stack direction="inline" gap="base">
              <s-text><strong>Price-based rates</strong></s-text>
              <s-link href={`/app/zones/${zone.id}/rates/new?type=price`}>
                Add price-based rate
              </s-link>
            </s-stack>
            <s-paragraph>Rates based on the order price.</s-paragraph>

            {priceRates.map((rate) => (
              <s-stack key={rate.id} direction="inline" gap="base">
                <s-stack direction="block" gap="none">
                  <s-text>{rate.name}</s-text>
                  <s-text>
                    ${rate.minValue.toFixed(2)} –{" "}
                    {rate.maxValue != null
                      ? `$${rate.maxValue.toFixed(2)}`
                      : "No max"}{" "}
                    → {rate.price === 0 ? "Free" : `$${rate.price.toFixed(2)}`}
                  </s-text>
                </s-stack>
                <s-stack direction="inline" gap="small">
                  <s-link href={`/app/zones/${zone.id}/rates/${rate.id}`}>
                    Edit
                  </s-link>
                  <rateFetcher.Form method="post">
                    <input type="hidden" name="intent" value="delete-rate" />
                    <input type="hidden" name="rateId" value={rate.id} />
                    <s-button tone="critical" variant="tertiary" type="submit">
                      Delete
                    </s-button>
                  </rateFetcher.Form>
                </s-stack>
              </s-stack>
            ))}
          </s-stack>

          <s-divider></s-divider>

          {/* Weight-based rates */}
          <s-stack direction="block" gap="small">
            <s-stack direction="inline" gap="base">
              <s-text><strong>Weight-based rates</strong></s-text>
              <s-link href={`/app/zones/${zone.id}/rates/new?type=weight`}>
                Add weight-based rate
              </s-link>
            </s-stack>
            <s-paragraph>Rates based on the order weight.</s-paragraph>

            {weightRates.map((rate) => (
              <s-stack key={rate.id} direction="inline" gap="base">
                <s-stack direction="block" gap="none">
                  <s-text>{rate.name}</s-text>
                  <s-text>
                    {rate.minValue.toFixed(2)}kg –{" "}
                    {rate.maxValue != null
                      ? `${rate.maxValue.toFixed(2)}kg`
                      : "No max"}{" "}
                    → {rate.price === 0 ? "Free" : `$${rate.price.toFixed(2)}`}
                  </s-text>
                </s-stack>
                <s-stack direction="inline" gap="small">
                  <s-link href={`/app/zones/${zone.id}/rates/${rate.id}`}>
                    Edit
                  </s-link>
                  <rateFetcher.Form method="post">
                    <input type="hidden" name="intent" value="delete-rate" />
                    <input type="hidden" name="rateId" value={rate.id} />
                    <s-button tone="critical" variant="tertiary" type="submit">
                      Delete
                    </s-button>
                  </rateFetcher.Form>
                </s-stack>
              </s-stack>
            ))}
          </s-stack>
        </s-stack>
      </s-section>

      {/* Delete zone modal — triggered by commandFor on the button above */}
      <s-modal id="delete-zone-modal" heading={`Delete "${zone.name}"?`}>
        <s-paragraph>
          This will permanently delete the zone and all its rates. This cannot
          be undone.
        </s-paragraph>
        <s-button
          slot="primary-action"
          tone="critical"
          onClick={() => document.getElementById(DELETE_FORM_ID)?.requestSubmit()}
        >
          Delete
        </s-button>
        <s-button slot="secondary-actions" commandFor="delete-zone-modal">
          Cancel
        </s-button>
      </s-modal>

      {/* Hidden delete form */}
      <Form method="post" id={DELETE_FORM_ID}>
        <input type="hidden" name="intent" value="delete-zone" />
      </Form>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
