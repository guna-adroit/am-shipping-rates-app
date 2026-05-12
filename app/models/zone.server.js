import db from "../db.server";

export async function getZones(shopDomain) {
  return db.zone.findMany({
    where: { shopDomain },
    include: { rates: { orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getZone(id, shopDomain) {
  return db.zone.findFirst({
    where: { id, shopDomain },
    include: { rates: { orderBy: { createdAt: "asc" } } },
  });
}

export async function createZone(shopDomain, data) {
  return db.zone.create({
    data: {
      shopDomain,
      name: data.name,
      zipCodes: normalizeZipCodes(data.zipCodes),
      status: data.status || "enabled",
    },
  });
}

export async function updateZone(id, data) {
  return db.zone.update({
    where: { id },
    data: {
      name: data.name,
      zipCodes: normalizeZipCodes(data.zipCodes),
      status: data.status,
      updatedAt: new Date(),
    },
  });
}

export async function deleteZone(id) {
  return db.zone.delete({ where: { id } });
}

// Used by /carrier-service public endpoint at checkout
export async function findZoneByZip(shopDomain, zipCode) {
  const normalizedZip = zipCode.trim().toLowerCase().replace(/\s+/g, "");

  const zones = await db.zone.findMany({
    where: { shopDomain, status: "enabled" },
    include: { rates: { orderBy: { minValue: "asc" } } },
  });

  return (
    zones.find((zone) => {
      const codes = zone.zipCodes
        .split(",")
        .map((z) => z.trim().toLowerCase().replace(/\s+/g, ""))
        .filter(Boolean);
      return codes.includes(normalizedZip);
    }) ?? null
  );
}

function normalizeZipCodes(raw) {
  const seen = new Set();
  return raw
    .split(",")
    .map((z) => z.trim())
    .filter((z) => {
      if (!z || seen.has(z.toLowerCase())) return false;
      seen.add(z.toLowerCase());
      return true;
    })
    .join(", ");
}
