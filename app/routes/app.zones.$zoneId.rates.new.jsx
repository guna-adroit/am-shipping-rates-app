import { redirect, data } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getZone } from "../models/zone.server";
import { createRate } from "../models/rate.server";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const zone = await getZone(params.zoneId, session.shop);
  if (!zone) throw new Response("Zone not found", { status: 404 });
  return { zone };
};

export const action = async ({ request, params }) => {
  await authenticate.admin(request);
  const formData = await request.formData();

  const name = formData.get("name")?.toString().trim() ?? "";
  const description = formData.get("description")?.toString().trim() ?? "";
  const type = formData.get("type")?.toString() ?? "price";
  const minValue = formData.get("minValue")?.toString() ?? "0";
  const maxValue = formData.get("maxValue")?.toString() ?? "";
  const price = formData.get("price")?.toString() ?? "0";

  const errors = {};
  if (!name) errors.name = "Rate name is required";
  if (isNaN(parseFloat(price)) || parseFloat(price) < 0)
    errors.price = "Enter a valid rate price (0 for free shipping)";

  if (Object.keys(errors).length) {
    return data(
      { errors, values: { name, description, minValue, maxValue, price } },
      { status: 400 },
    );
  }

  await createRate(params.zoneId, { name, description, type, minValue, maxValue, price });
  return redirect(`/app/zones/${params.zoneId}`);
};

export default function NewRatePage() {
  const { zone } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const isSaving = navigation.state === "submitting";
  const FORM_ID = "create-rate-form";

  const type = searchParams.get("type") === "weight" ? "weight" : "price";
  const isPrice = type === "price";

  return (
    <s-page heading="Add rate">
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

      <Form method="post" id={FORM_ID}>
        {/* Pass type as hidden field */}
        <input type="hidden" name="type" value={type} />

        {/* General section — matches screenshot 5 left column */}
        <s-section heading="General">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              Choose how you want to charge this rate.
            </s-paragraph>

            <s-text-field
              label="Rate name"
              name="name"
              value={actionData?.values?.name ?? ""}
              error-message={actionData?.errors?.name ?? ""}
              placeholder={isPrice ? "e.g. Standard Shipping" : "e.g. Heavy Freight"}
              required
            ></s-text-field>

            <s-text-area
              label="Rate description"
              name="description"
              value={actionData?.values?.description ?? ""}
              rows="2"
              placeholder="Optional — shown to customers at checkout"
            ></s-text-area>
          </s-stack>
        </s-section>

        {/* Rates section — matches screenshot 5 right column */}
        <s-section slot="aside" heading="Rates">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              Specify which rates apply to the zip codes in this zone.
            </s-paragraph>

            <s-stack direction="inline" gap="base">
              <s-number-field
                label={isPrice ? "Minimum order price" : "Minimum order weight"}
                name="minValue"
                value={actionData?.values?.minValue ?? "0.00"}
                min="0"
                step="0.01"
                prefix={isPrice ? "A$" : undefined}
                suffix={!isPrice ? "kg" : undefined}
              ></s-number-field>

              <s-number-field
                label={isPrice ? "Maximum order price" : "Maximum order weight"}
                name="maxValue"
                value={actionData?.values?.maxValue ?? ""}
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
              value={actionData?.values?.price ?? "0.00"}
              min="0"
              step="0.01"
              prefix="A$"
              error-message={actionData?.errors?.price ?? ""}
              help-text="Enter 0.00 for free shipping"
            ></s-number-field>
          </s-stack>
        </s-section>
      </Form>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
