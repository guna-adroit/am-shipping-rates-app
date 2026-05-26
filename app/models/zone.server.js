import db from "../db.server";

// ─────────────────────────────────────────────────────────────────────────────
// ID generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a unique 6-digit numeric ID for a Zone.
 * Retries on collision (practically never needed at small scale).
 */
async function generateZoneId() {
  for (let attempt = 0; attempt < 20; attempt++) {
    const id = String(Math.floor(100000 + Math.random() * 900000));
    const existing = await db.zone.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return id;
  }
  throw new Error("Could not generate a unique 6-digit zone ID. Try again.");
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────────

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
  const id = await generateZoneId();
  return db.zone.create({
    data: {
      id,
      shopDomain,
      name: data.name,
      zipCodes: data.isFallback ? "" : normalizeZipCodes(data.zipCodes),
      conditions: serializeConditions(data.conditions),
      isFallback: Boolean(data.isFallback),
      status: data.status || "enabled",
    },
  });
}

export async function updateZone(id, data) {
  return db.zone.update({
    where: { id },
    data: {
      name: data.name,
      zipCodes: data.isFallback ? "" : normalizeZipCodes(data.zipCodes ?? ""),
      conditions: serializeConditions(data.conditions),
      status: data.status,
      updatedAt: new Date(),
    },
  });
}

export async function deleteZone(id) {
  return db.zone.delete({ where: { id } });
}

/**
 * Returns the single fallback zone for this shop, or null if none exists.
 * A fallback zone has isFallback=true and matches any cart when no regular zone matches.
 */
export async function getFallbackZone(shopDomain) {
  return db.zone.findFirst({
    where: { shopDomain, isFallback: true },
    include: { rates: { orderBy: { minValue: "asc" } } },
  });
}

/**
 * Creates a fallback zone for this shop (call only if none exists yet).
 */
export async function createFallbackZone(shopDomain) {
  const id = await generateZoneId();
  return db.zone.create({
    data: {
      id,
      shopDomain,
      name: "Fallback Rates",
      zipCodes: "",
      isFallback: true,
      status: "enabled",
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Carrier service lookup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Finds the first enabled zone whose zip code list/ranges include the given zip,
 * AND whose product conditions (if any) are satisfied by the given line items.
 *
 * lineItems: array of Shopify carrier service line item objects, e.g.:
 *   { name, sku, vendor, quantity, grams, price (cents), product_type, ... }
 *
 * If a zone has no conditions, it matches all carts.
 */
/**
 * Finds a matching zone for the given zip + line items.
 * Priority:
 *   1. Regular enabled zones (zip match + product conditions)
 *   2. Fallback zone (isFallback=true, enabled) — returned when no regular zone matches
 *
 * Returns { zone, isFallback: boolean } or null if nothing matches.
 */
export async function findZoneByZip(shopDomain, zipCode, lineItems = []) {
  const zip = zipCode.trim().replace(/\s+/g, "");

  const zones = await db.zone.findMany({
    where: { shopDomain, status: "enabled" },
    include: { rates: { orderBy: { minValue: "asc" } } },
  });

  // 1. Try regular (non-fallback) zones first
  const regularZone = zones.find((zone) => {
    if (zone.isFallback) return false;

    const zipOk  = zipMatchesZone(zip, zone.zipCodes);
    const condOk = matchesProductConditions(zone, lineItems);

    console.log(
      `[zone-match] "${zone.name}": zip=${zipOk} cond=${condOk}` +
      ` logic=${JSON.parse(zone.conditions || "{}").logic ?? "none"}` +
      ` rules=${JSON.parse(zone.conditions || "{}").rules?.length ?? 0}` +
      ` items=${lineItems.map(i => `sku:${i.sku}|vendor:${i.vendor}`).join(", ")}`
    );

    return zipOk && condOk;
  });
  if (regularZone) return { zone: regularZone, isFallback: false };

  // 2. Fall back to the fallback zone if configured and enabled
  const fallbackZone = zones.find((z) => z.isFallback);
  if (fallbackZone) return { zone: fallbackZone, isFallback: true };

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Conditions — structure
// ─────────────────────────────────────────────────────────────────────────────
//
// Stored as JSON text (zone.conditions):
// {
//   logic: "all" | "any",   // whether ALL or ANY rules must match
//   rules: [
//     {
//       id: "123456",           // 6-digit string for keying in React
//       attribute: "sku",       // see ATTRIBUTE_OPTIONS below
//       operator: "equals",     // see OPERATOR_OPTIONS below
//       value: "ABC123",        // primary comparison value
//       value2: ""              // only used for "between" operator
//     }
//   ]
// }
//
// Supported attributes:
//   sku, price, quantity, weight, total,
//   vendor, name, barcode, type,
//   length, width, height, volume
//
// Note: "tag" and "collection" require extra Shopify API calls from the
// carrier service and are NOT evaluated here. Conditions using those
// attributes are silently skipped during matching.
//
// Supported operators:
//   equals, not_equals, contains, not_contains,
//   greater_than, less_than, between
//
// Units:
//   price / total  → user enters dollars (e.g. 50), compared against
//                    Shopify's per-item price in cents (÷100).
//   weight         → user enters kg, compared against Shopify's grams (÷1000).
//   quantity       → integer units, compared as-is.
//   length/width/height/volume → compared as-is (Shopify units: cm / cm³).

// ─────────────────────────────────────────────────────────────────────────────
// Conditions — serialization helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Serialises a conditions object (or raw JSON string) for DB storage.
 * Returns null if there are no rules (avoids storing empty condition objects).
 */
export function serializeConditions(conditionsInput) {
  if (!conditionsInput) return null;

  let parsed;
  if (typeof conditionsInput === "string") {
    try {
      parsed = JSON.parse(conditionsInput);
    } catch {
      return null;
    }
  } else {
    parsed = conditionsInput;
  }

  if (!parsed?.rules?.length) return null;

  const logic = ["any", "none"].includes(parsed.logic) ? parsed.logic : "all";
  return JSON.stringify({
    logic,
    rules: parsed.rules.map((r) => ({
      id: r.id,
      attribute: r.attribute,
      operator: r.operator,
      value: String(r.value ?? ""),
      value2: String(r.value2 ?? ""),
    })),
  });
}

/**
 * Parses the stored conditions JSON.  Always returns a valid object.
 */
export function parseConditions(raw) {
  if (!raw) return { logic: "all", rules: [] };
  try {
    const parsed = JSON.parse(raw);
    const logic = ["any", "none"].includes(parsed.logic) ? parsed.logic : "all";
    return {
      logic,
      rules: Array.isArray(parsed.rules) ? parsed.rules : [],
    };
  } catch {
    return { logic: "all", rules: [] };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Conditions — validation
// ─────────────────────────────────────────────────────────────────────────────

const VALID_ATTRIBUTES = new Set([
  "sku", "price", "quantity", "weight", "total",
  "vendor", "name", "barcode", "type", "tag", "collection",
  "length", "width", "height", "volume",
]);

const VALID_OPERATORS = new Set([
  "equals", "not_equals", "contains", "not_contains",
  "greater_than", "less_than", "between",
]);

/**
 * Validates parsed conditions.  Returns an error string or null if valid.
 */
export function validateConditions(conditionsInput) {
  if (!conditionsInput) return null; // optional field

  let parsed;
  if (typeof conditionsInput === "string") {
    if (conditionsInput.trim() === "" || conditionsInput === "{}") return null;
    try {
      parsed = JSON.parse(conditionsInput);
    } catch {
      return "Conditions data is malformed.";
    }
  } else {
    parsed = conditionsInput;
  }

  if (!parsed?.rules?.length) return null; // empty = no conditions, valid

  for (const rule of parsed.rules) {
    if (!VALID_ATTRIBUTES.has(rule.attribute)) {
      return `Unknown attribute "${rule.attribute}".`;
    }
    if (!VALID_OPERATORS.has(rule.operator)) {
      return `Unknown operator "${rule.operator}".`;
    }
    if (!rule.value && rule.value !== 0) {
      return "All conditions must have a value.";
    }
    if (rule.operator === "between" && !rule.value2 && rule.value2 !== 0) {
      return 'The "between" operator requires a second value.';
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Conditions — matching (used by carrier service)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if the zone's product conditions are satisfied by lineItems.
 * If the zone has no conditions, always returns true.
 *
 * @param {object} zone     - Prisma Zone record (with zone.conditions JSON string)
 * @param {Array}  lineItems - Shopify carrier service line items
 */
export function matchesProductConditions(zone, lineItems = []) {
  const { rules, logic } = parseConditions(zone.conditions);
  if (!rules.length) return true; // no conditions → always match

  if (!lineItems.length) {
    console.warn("[conditions] No line items supplied — skipping condition check, zone will match.");
    return true;
  }

  if (logic === "none") {
    const result = !lineItems.some((item) => rules.some((rule) => evaluateRule(rule, item)));
    console.log(`[conditions] logic=none → ${result}`);
    return result;
  }

  const checkFn = logic === "any" ? "some" : "every";
  const result = rules[checkFn]((rule) => {
    const ruleResult = ruleMatchesAnyItem(rule, lineItems);
    console.log(`[conditions] rule ${rule.attribute} ${rule.operator} "${rule.value}" → ${ruleResult}`);
    return ruleResult;
  });
  console.log(`[conditions] logic=${logic} final → ${result}`);
  return result;
}

/**
 * Returns true if `rule` is satisfied by at least one line item.
 */
function ruleMatchesAnyItem(rule, lineItems) {
  return lineItems.some((item) => evaluateRule(rule, item));
}

/**
 * Splits a rule value on commas into a trimmed, non-empty array.
 * e.g. "ABC, DEF, GHI" → ["ABC", "DEF", "GHI"]
 * Used so merchants can enter multiple SKUs / vendors / etc. in one condition.
 */
function splitValues(raw) {
  return String(raw ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Evaluates a single rule against a single line item.
 *
 * Multi-value support: for text operators "equals", "not_equals", "contains",
 * and "not_contains", the rule value may contain comma-separated entries.
 *
 * - equals / contains    → true if the item matches ANY entered value  (OR logic)
 * - not_equals           → true if the item matches NONE of the entered values
 * - not_contains         → true if the item contains NONE of the entered values
 * - numeric operators    → comma splitting is ignored; only the first value is used
 * - between              → uses value (from) and value2 (to) as before
 */
function evaluateRule(rule, item) {
  const { attribute, operator, value, value2 } = rule;

  // Resolve the item's raw value for this attribute
  let itemVal;
  switch (attribute) {
    case "sku":       itemVal = String(item.sku ?? ""); break;
    case "vendor":    itemVal = String(item.vendor ?? ""); break;
    case "name":      itemVal = String(item.name ?? ""); break;
    case "barcode":   itemVal = String(item.barcode ?? ""); break;
    case "type":      itemVal = String(item.product_type ?? ""); break;
    // Numeric — convert to user-friendly units
    case "price":     itemVal = (item.price ?? 0) / 100; break;      // cents → dollars
    case "quantity":  itemVal = item.quantity ?? 0; break;
    case "weight":    itemVal = (item.grams ?? 0) / 1000; break;     // grams → kg
    case "total":     itemVal = ((item.price ?? 0) * (item.quantity ?? 1)) / 100; break;
    case "length":    itemVal = item.length ?? 0; break;
    case "width":     itemVal = item.width ?? 0; break;
    case "height":    itemVal = item.height ?? 0; break;
    case "volume":    itemVal = item.volume ?? 0; break;
    // tag and collection require extra API calls — skip
    case "tag":
    case "collection":
    default:
      return false;
  }

  const isNumeric = typeof itemVal === "number";
  const numVal  = parseFloat(value);
  const numVal2 = parseFloat(value2);

  // For text attributes, support comma-separated multi-value input
  const values = isNumeric ? [value] : splitValues(value);
  const itemLower = isNumeric ? null : String(itemVal).toLowerCase();

  switch (operator) {
    case "equals":
      // Matches if item equals ANY of the entered values
      return isNumeric
        ? itemVal === numVal
        : values.some((v) => itemLower === v.toLowerCase());

    case "not_equals":
      // Matches if item equals NONE of the entered values
      return isNumeric
        ? itemVal !== numVal
        : values.every((v) => itemLower !== v.toLowerCase());

    case "contains":
      // Matches if item contains ANY of the entered values
      return !isNumeric && values.some((v) => itemLower.includes(v.toLowerCase()));

    case "not_contains":
      // Matches if item contains NONE of the entered values
      return !isNumeric && values.every((v) => !itemLower.includes(v.toLowerCase()));

    case "greater_than":
      return isNumeric && itemVal > numVal;

    case "less_than":
      return isNumeric && itemVal < numVal;

    case "between":
      return isNumeric && !isNaN(numVal) && !isNaN(numVal2)
        ? itemVal >= numVal && itemVal <= numVal2
        : false;

    default:
      return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Zip code helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if `zip` matches any entry in the stored zip codes string.
 * Each comma-separated entry can be:
 *   - A single code:  "4516"
 *   - A numeric range: "4000-4100"  → matches any integer in [4000, 4100]
 *   - An alphanumeric range: "AA1-AA9" → lexicographic comparison
 */
function zipMatchesZone(zip, rawZipCodes) {
  const zipLower = zip.toLowerCase();
  const zipNum = parseInt(zip, 10);
  const zipIsNumeric = !isNaN(zipNum) && /^\d+$/.test(zip);

  const entries = rawZipCodes
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  for (const entry of entries) {
    // Detect a range: exactly one "-" not at position 0
    const dashIdx = entry.indexOf("-");
    if (dashIdx > 0) {
      const start = entry.slice(0, dashIdx).trim();
      const end = entry.slice(dashIdx + 1).trim();

      if (!start || !end) continue; // malformed — skip

      const startNum = parseInt(start, 10);
      const endNum = parseInt(end, 10);
      const rangeIsNumeric =
        !isNaN(startNum) && !isNaN(endNum) &&
        /^\d+$/.test(start) && /^\d+$/.test(end);

      if (zipIsNumeric && rangeIsNumeric) {
        // Pure numeric range: "4000-4100"
        if (zipNum >= startNum && zipNum <= endNum) return true;
      } else {
        // Alphanumeric range: lexicographic comparison
        if (zipLower >= start.toLowerCase() && zipLower <= end.toLowerCase())
          return true;
      }
    } else {
      // Single code — exact match (case-insensitive)
      if (zipLower === entry.toLowerCase()) return true;
    }
  }

  return false;
}

/**
 * Normalises the raw zip codes input for storage.
 * - Trims whitespace around each entry
 * - Removes blank entries
 * - Deduplicates (case-insensitive)
 * - Preserves ranges as-is (e.g. "4000-4100")
 * - Joins with ", "
 */
export function normalizeZipCodes(raw) {
  const seen = new Set();
  return raw
    .split(",")
    .map((z) => z.trim())
    .filter((z) => {
      if (!z) return false;
      const key = z.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(", ");
}

/**
 * Validates the zip codes input string.
 * Returns an error message string, or null if valid.
 *
 * Checks:
 *  - At least one entry
 *  - Ranges have exactly two parts separated by one "-"
 *  - Numeric ranges have start <= end
 */
export function validateZipCodes(input) {
  const entries = input
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  if (entries.length === 0) {
    return "At least one zip code or range is required.";
  }

  for (const entry of entries) {
    const dashIdx = entry.indexOf("-");
    if (dashIdx > 0) {
      const parts = entry.split("-");
      if (parts.length !== 2) {
        return `"${entry}" is not a valid range. Use the format START-END (e.g. 4000-4100).`;
      }
      const [start, end] = parts.map((p) => p.trim());
      if (!start || !end) {
        return `"${entry}" is not a valid range. Both start and end values are required.`;
      }
      const startNum = parseInt(start, 10);
      const endNum = parseInt(end, 10);
      const bothNumeric =
        !isNaN(startNum) && !isNaN(endNum) &&
        /^\d+$/.test(start) && /^\d+$/.test(end);
      if (bothNumeric && startNum > endNum) {
        return `Range "${entry}" is invalid — ${start} must be less than or equal to ${end}.`;
      }
    }
  }

  return null; // all good
}