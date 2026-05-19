import { redirect, data } from "react-router";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
  useSearchParams,
} from "react-router";
import { useRef, useEffect } from "react";
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

  // Refs for repopulating on validation error
  const nameRef = useRef(null);
  const descRef = useRef(null);
  const minRef = useRef(null);
  const maxRef = useRef(null);
  const priceRef = useRef(null);

  useEffect(() => {
    if (!actionData?.values) return;
    if (nameRef.current) nameRef.current.value = actionData.values.name ?? "";
    if (descRef.current) descRef.current.value = actionData.values.description ?? "";
    if (minRef.current) minRef.current.value = actionData.values.minValue ?? "0.00";
    if (maxRef.current) maxRef.current.value = actionData.values.maxValue ?? "";
    if (priceRef.current) priceRef.current.value = actionData.values.price ?? "0.00";
  }, [actionData]);

  return (
    <s-page heading="Add rate">
      <s-button
        slot="primary-action"
        {...(isSaving ? { loading: true } : {})}
        onClick={() => document.getElementById(FORM_ID)?.requestSubmit()}
      >
        Save
      </s-button>
      <s-link slot="secondary-actions" href={`/app/zones/${zone.id}`}>
        Cancel
      </s-link>

      <Form method="post" id={FORM_ID}>
        <input type="hidden" name="type" value={type} />

        <s-section heading="General">
          <s-stack direction="block" gap="base">
            <s-paragraph>Choose how you want to charge this rate.</s-paragraph>

            <s-text-field
              ref={nameRef}
              label="Rate name"
              name="name"
              error-message={actionData?.errors?.name ?? ""}
              placeholder={isPrice ? "e.g. Standard Shipping" : "e.g. Heavy Freight"}
              required
            ></s-text-field>

            <s-text-area
              ref={descRef}
              label="Rate description"
              name="description"
              rows="2"
              placeholder="Optional — shown to customers at checkout"
            ></s-text-area>
          </s-stack>
        </s-section>
      </Form>

      {/* Rates section — DIRECT child of s-page (slot="aside") */}
      <s-section slot="aside" heading="Rates">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Specify which rates apply to the zip codes in this zone.
          </s-paragraph>

          {/*
            These fields are outside <Form> but they submit via the form
            using the form="create-rate-form" attribute.
            s- components are form-associated and support the form= attribute.
          */}
          <s-stack direction="inline" gap="base">
            <s-number-field
              ref={minRef}
              label={isPrice ? "Minimum order price" : "Minimum order weight"}
              name="minValue"
              min="0"
              step="0.01"
              value="0.00"
              prefix={isPrice ? "A$" : undefined}
              suffix={!isPrice ? "kg" : undefined}
              form={FORM_ID}
            ></s-number-field>

            <s-number-field
              ref={maxRef}
              label={isPrice ? "Maximum order price" : "Maximum order weight"}
              name="maxValue"
              min="0"
              step="0.01"
              placeholder="No maximum"
              prefix={isPrice ? "A$" : undefined}
              suffix={!isPrice ? "kg" : undefined}
              form={FORM_ID}
            ></s-number-field>
          </s-stack>

          <s-number-field
            ref={priceRef}
            label="Rate price"
            name="price"
            min="0"
            step="0.01"
            value="0.00"
            prefix="A$"
            help-text="Enter 0.00 for free shipping"
            error-message={actionData?.errors?.price ?? ""}
            form={FORM_ID}
          ></s-number-field>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
