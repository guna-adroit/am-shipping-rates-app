import { redirect, data } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getZone } from "../models/zone.server";
import { getRate, updateRate, deleteRate } from "../models/rate.server";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const [zone, rate] = await Promise.all([
    getZone(params.zoneId, session.shop),
    getRate(params.rateId),
  ]);
  if (!zone || !rate) throw new Response("Not found", { status: 404 });
  return { zone, rate };
};

export const action = async ({ request, params }) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "delete-rate") {
    await deleteRate(params.rateId);
    return redirect(`/app/zones/${params.zoneId}`);
  }

  const name = formData.get("name")?.toString().trim() ?? "";
  const description = formData.get("description")?.toString().trim() ?? "";
  const minValue = formData.get("minValue")?.toString() ?? "0";
  const maxValue = formData.get("maxValue")?.toString() ?? "";
  const price = formData.get("price")?.toString() ?? "0";

  const errors = {};
  if (!name) errors.name = "Rate name is required";
  if (isNaN(parseFloat(price)) || parseFloat(price) < 0)
    errors.price = "Enter a valid rate price";

  if (Object.keys(errors).length) {
    return data(
      { errors, values: { name, description, minValue, maxValue, price } },
      { status: 400 },
    );
  }

  await updateRate(params.rateId, { name, description, minValue, maxValue, price });
  return redirect(`/app/zones/${params.zoneId}`);
};

export default function EditRatePage() {
  const { zone, rate } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";
  const FORM_ID = "edit-rate-form";
  const DELETE_FORM_ID = "delete-rate-form";

  const isPrice = rate.type === "price";

  return (
    <s-page heading="Edit rate">
      <s-button
        slot="primary-action"
        variant="primary"
        {...(isSaving ? { loading: true } : {})}
        onClick={() => document.getElementById(FORM_ID)?.requestSubmit()}
      >
        Save
      </s-button>
      <s-link slot="secondary-actions" href={`/app/zones/${zone.id}`}>
        Cancel
      </s-link>
      <s-button
        slot="secondary-actions"
        tone="critical"
        commandFor="delete-rate-modal"
      >
        Delete rate
      </s-button>

      <Form method="post" id={FORM_ID}>
        <input type="hidden" name="intent" value="update-rate" />

        <s-section heading="General">
          <s-stack direction="block" gap="base">
            <s-paragraph>Choose how you want to charge this rate.</s-paragraph>

            <s-text-field
              label="Rate name"
              name="name"
              value={actionData?.values?.name ?? rate.name}
              error-message={actionData?.errors?.name ?? ""}
              required
            ></s-text-field>

            <s-text-area
              label="Rate description"
              name="description"
              value={actionData?.values?.description ?? (rate.description ?? "")}
              rows="2"
            ></s-text-area>
          </s-stack>
        </s-section>

        <s-section slot="aside" heading="Rates">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              Specify which rates apply to the zip codes in this zone.
            </s-paragraph>

            <s-stack direction="inline" gap="base">
              <s-number-field
                label={isPrice ? "Minimum order price" : "Minimum order weight"}
                name="minValue"
                value={actionData?.values?.minValue ?? rate.minValue.toFixed(2)}
                min="0"
                step="0.01"
                prefix={isPrice ? "A$" : undefined}
                suffix={!isPrice ? "kg" : undefined}
              ></s-number-field>

              <s-number-field
                label={isPrice ? "Maximum order price" : "Maximum order weight"}
                name="maxValue"
                value={
                  actionData?.values?.maxValue ??
                  (rate.maxValue != null ? rate.maxValue.toFixed(2) : "")
                }
                min="0"
                step="0.01"
                prefix={isPrice ? "A$" : undefined}
                suffix={!isPrice ? "kg" : undefined}
                placeholder="No maximum"
              ></s-number-field>
            </s-stack>

            <s-number-field
              label="Rate price"
              name="price"
              value={actionData?.values?.price ?? rate.price.toFixed(2)}
              min="0"
              step="0.01"
              prefix="A$"
              error-message={actionData?.errors?.price ?? ""}
              help-text="Enter 0.00 for free shipping"
            ></s-number-field>
          </s-stack>
        </s-section>
      </Form>

      {/* Delete rate modal */}
      <s-modal id="delete-rate-modal" heading="Delete this rate?">
        <s-paragraph>
          Are you sure you want to delete "{rate.name}"? This cannot be undone.
        </s-paragraph>
        <s-button
          slot="primary-action"
          tone="critical"
          onClick={() => document.getElementById(DELETE_FORM_ID)?.requestSubmit()}
        >
          Delete
        </s-button>
        <s-button slot="secondary-actions" commandFor="delete-rate-modal">
          Cancel
        </s-button>
      </s-modal>

      <Form method="post" id={DELETE_FORM_ID}>
        <input type="hidden" name="intent" value="delete-rate" />
      </Form>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
