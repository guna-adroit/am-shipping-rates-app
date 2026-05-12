import db from "../db.server";

export async function getRate(id) {
  return db.rate.findUnique({ where: { id } });
}

export async function createRate(zoneId, data) {
  return db.rate.create({
    data: {
      zoneId,
      name: data.name,
      description: data.description?.trim() || null,
      type: data.type || "price",
      minValue: parseFloat(data.minValue) || 0,
      maxValue:
        data.maxValue !== "" && data.maxValue != null
          ? parseFloat(data.maxValue)
          : null,
      price: parseFloat(data.price) || 0,
    },
  });
}

export async function updateRate(id, data) {
  return db.rate.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description?.trim() || null,
      minValue: parseFloat(data.minValue) || 0,
      maxValue:
        data.maxValue !== "" && data.maxValue != null
          ? parseFloat(data.maxValue)
          : null,
      price: parseFloat(data.price) || 0,
      updatedAt: new Date(),
    },
  });
}

export async function deleteRate(id) {
  return db.rate.delete({ where: { id } });
}
