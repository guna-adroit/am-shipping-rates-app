import { redirect, data } from "react-router";
import { Form, useFetcher, useLoaderData, useActionData, useNavigation } from "react-router";
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

export default function EditZonePage() {
  const { zone } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const rateFetcher = useFetcher();
  const FORM_ID = "edit-zone-form";
  const DELETE_FORM_ID = "delete-zone-form";
  const isSaving =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") !== "delete-zone";

  const priceRates = zone.rates.filter((r) => r.type === "price");
  const weightRates = zone.rates.filter((r) => r.type === "weight");

  return (
    <s-page heading="Edit Zone">
      {/* Page actions */}
      <s-button
        slot="primary-action"
        variant="primary"
        {...(isSaving ? { loading: true } : {})}
        onClick={() => document.getElementById(FORM_ID)?.requestSubmit()}
      >
        Save
      </s-button>
      <s-link slot="secondary-actions" href="/app/zones">Cancel</s-link>
      <s-button
        slot="secondary-actions"
        tone="critical"
        commandFor="delete-zone-modal"
      >
        Delete zone
      </s-button>

      {/* Update zone form */}
      <Form method="post" id={FORM_ID}>
        <input type="hidden" name="intent" value="update-zone" />

        <s-section heading="Zone details">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              Give your zone a name and specify which zip codes are included.
            </s-paragraph>

            <s-text-field
              label="Zone name"
              name="name"
              value={actionData?.values?.name ?? zone.name}
              help-text="This is for internal use only and will not be visible to your customers."
              error-message={actionData?.errors?.name ?? ""}
              required
            ></s-text-field>

            <s-text-area
              label="Zip codes"
              name="zipCodes"
              value={actionData?.values?.zipCodes ?? zone.zipCodes}
              rows="4"
              help-text="Separate eligible postal codes with a comma. Overlapping postal codes are not supported—each location needs a unique set."
              error-message={actionData?.errors?.zipCodes ?? ""}
              required
            ></s-text-area>

            <s-select
              label="Zone status"
              name="status"
              value={actionData?.values?.status ?? zone.status}
            >
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
            </s-select>
          </s-stack>
        </s-section>

        {/* Rates aside section */}
        <s-section slot="aside" heading="Rates">
          <s-stack direction="block" gap="base">
            {/* Price-based rates */}
            <s-stack direction="block" gap="small">
              <s-stack direction="inline" gap="base">
                <s-heading>Price-based rates</s-heading>
                <s-link href={`/app/zones/${zone.id}/rates/new?type=price`}>
                  Add price-based rate
                </s-link>
              </s-stack>
              <s-paragraph>
                Rates based on the price of your customer's order.
              </s-paragraph>

              {priceRates.length > 0 && (
                <s-stack direction="block" gap="small">
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
                          <s-button variant="tertiary" tone="critical" type="submit">
                            Delete
                          </s-button>
                        </rateFetcher.Form>
                      </s-stack>
                    </s-stack>
                  ))}
                </s-stack>
              )}
            </s-stack>

            <s-divider></s-divider>

            {/* Weight-based rates */}
            <s-stack direction="block" gap="small">
              <s-stack direction="inline" gap="base">
                <s-heading>Weight-based rates</s-heading>
                <s-link href={`/app/zones/${zone.id}/rates/new?type=weight`}>
                  Add weight-based rate
                </s-link>
              </s-stack>
              <s-paragraph>
                Rates based on the weight of your customer's order.
              </s-paragraph>

              {weightRates.length > 0 && (
                <s-stack direction="block" gap="small">
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
                          <s-button variant="tertiary" tone="critical" type="submit">
                            Delete
                          </s-button>
                        </rateFetcher.Form>
                      </s-stack>
                    </s-stack>
                  ))}
                </s-stack>
              )}
            </s-stack>
          </s-stack>
        </s-section>
      </Form>

      {/* Delete zone confirmation modal — triggered by commandFor on the button above */}
      <s-modal id="delete-zone-modal" heading={`Delete "${zone.name}"?`}>
        <s-paragraph>
          Are you sure you want to delete this zone? All rates in this zone
          will also be permanently deleted. This action cannot be undone.
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

      {/* Hidden form for delete zone submission */}
      <Form method="post" id={DELETE_FORM_ID}>
        <input type="hidden" name="intent" value="delete-zone" />
      </Form>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
