import db from "./db.server";

const CREATE_CARRIER_SERVICE = `#graphql
  mutation carrierServiceCreate($input: DeliveryCarrierServiceCreateInput!) {
    carrierServiceCreate(input: $input) {
      carrierService {
        id
        name
        callbackUrl
        active
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const DELETE_CARRIER_SERVICE = `#graphql
  mutation carrierServiceDelete($id: ID!) {
    carrierServiceDelete(id: $id) {
      deletedId
      userErrors {
        field
        message
      }
    }
  }
`;

// Idempotent — skips registration if already done for this shop
export async function registerCarrierService(admin, shopDomain) {
  const existing = await db.carrierService.findUnique({
    where: { shopDomain },
  });
  if (existing) return existing;

  const appUrl = process.env.SHOPIFY_APP_URL;
  if (!appUrl) throw new Error("SHOPIFY_APP_URL env variable is not set");

  const response = await admin.graphql(CREATE_CARRIER_SERVICE, {
    variables: {
      input: {
        name: "Zip Code Shipping Rates",
        callbackUrl: `${appUrl}/carrier-service`,
        active: true,
        supportsServiceDiscovery: false,
      },
    },
  });

  const { data } = await response.json();
  const { carrierService, userErrors } = data.carrierServiceCreate;

  if (userErrors?.length > 0) {
    throw new Error(userErrors.map((e) => e.message).join(", "));
  }

  return db.carrierService.create({
    data: { shopDomain, serviceId: carrierService.id },
  });
}

// Called on app uninstall
export async function deleteCarrierService(admin, shopDomain) {
  const existing = await db.carrierService.findUnique({
    where: { shopDomain },
  });
  if (!existing) return;

  try {
    await admin.graphql(DELETE_CARRIER_SERVICE, {
      variables: { id: existing.serviceId },
    });
  } catch (e) {
    console.error("Could not delete carrier service from Shopify:", e.message);
  }

  await db.carrierService.delete({ where: { shopDomain } });
}
