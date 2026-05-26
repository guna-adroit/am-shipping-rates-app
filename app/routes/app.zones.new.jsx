import { redirect, data } from "react-router";
import { Form, useActionData, useNavigate, useNavigation } from "react-router";
import { useRef, useEffect, useState, useCallback } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { createZone, validateZipCodes, validateConditions } from "../models/zone.server";

// ─────────────────────────────────────────────────────────────────────────────
// Condition builder config
// ─────────────────────────────────────────────────────────────────────────────

export const ATTRIBUTE_OPTIONS = [
  { value: "sku",             label: "SKU",               numeric: false },
  { value: "name",            label: "Product name",      numeric: false },
  { value: "vendor",          label: "Vendor",            numeric: false },
  { value: "type",            label: "Product type",      numeric: false },
  { value: "tag",             label: "Tag",               numeric: false },
  { value: "collection",      label: "Collection",        numeric: false },
  { value: "barcode",         label: "Barcode",           numeric: false },
  { value: "price",           label: "Price ($)",         numeric: true  },
  { value: "total",           label: "Line total ($)",    numeric: true  },
  { value: "quantity",        label: "Quantity",          numeric: true  },
  { value: "weight",          label: "Weight (kg)",       numeric: true  },
  { value: "length",          label: "Length (cm)",       numeric: true  },
  { value: "width",           label: "Width (cm)",        numeric: true  },
  { value: "height",          label: "Height (cm)",       numeric: true  },
  { value: "volume",          label: "Volume (cm³)",      numeric: true  },
];

const TEXT_OPERATORS = [
  { value: "equals",      label: "equals" },
  { value: "not_equals",  label: "does not equal" },
  { value: "contains",    label: "contains" },
  { value: "not_contains",label: "does not contain" },
];

const NUMERIC_OPERATORS = [
  { value: "equals",       label: "equals" },
  { value: "not_equals",   label: "does not equal" },
  { value: "greater_than", label: "is greater than" },
  { value: "less_than",    label: "is less than" },
  { value: "between",      label: "is between" },
];

function getOperators(attribute) {
  const meta = ATTRIBUTE_OPTIONS.find((a) => a.value === attribute);
  return meta?.numeric ? NUMERIC_OPERATORS : TEXT_OPERATORS;
}

function attributeLabel(value) {
  return ATTRIBUTE_OPTIONS.find((a) => a.value === value)?.label ?? value;
}

function operatorLabel(attribute, op) {
  return getOperators(attribute).find((o) => o.value === op)?.label ?? op;
}

function generateId() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function displayValue(rule) {
  if (rule.operator === "between") return `${rule.value} and ${rule.value2}`;
  return rule.value.split(",").map((v) => v.trim()).filter(Boolean).join(", ");
}

const EMPTY_CONDITIONS = { logic: "all", rules: [] };

// ─────────────────────────────────────────────────────────────────────────────
// Server action
// ─────────────────────────────────────────────────────────────────────────────

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const name       = formData.get("name")?.toString().trim() ?? "";
  const zipCodes   = formData.get("zipCodes")?.toString().trim() ?? "";
  const status     = formData.get("status")?.toString() ?? "enabled";
  const conditions = formData.get("conditions")?.toString() ?? "";

  const errors = {};
  if (!name) errors.name = "Zone name is required";

  if (!zipCodes) {
    errors.zipCodes = "At least one zip code or range is required";
  } else {
    const zipError = validateZipCodes(zipCodes);
    if (zipError) errors.zipCodes = zipError;
  }

  const condError = validateConditions(conditions);
  if (condError) errors.conditions = condError;

  if (Object.keys(errors).length) {
    return data({ errors, values: { name, zipCodes, status, conditions } }, { status: 400 });
  }

  const zone = await createZone(session.shop, { name, zipCodes, status, conditions });
  return redirect(`/app/zones/${zone.id}`);
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function NewZonePage() {
  const actionData   = useActionData();
  const navigate     = useNavigate();
  const navigation   = useNavigation();
  const isSaving     = navigation.state === "submitting";
  const FORM_ID      = "create-zone-form";

  // Zone field refs
  const nameRef      = useRef(null);
  const zipCodesRef  = useRef(null);
  const statusRef    = useRef(null);

  // Condition builder state
  const [conditions, setConditions] = useState(EMPTY_CONDITIONS);

  // Condition modal state — editingRuleId: null=Add, string=Edit
  const [editingRuleId, setEditingRuleId] = useState(null);
  const [modalAttr, setModalAttr] = useState("sku");
  const [modalOp,   setModalOp]   = useState("equals");

// Condition modal field refs
  const condAttrRef   = useRef(null);
  const condOpRef     = useRef(null);
  const condValueRef  = useRef(null);
  const condValue2Ref = useRef(null);

  const COND_MODAL_ID = "cond-modal";
  const openModal  = () => document.getElementById(COND_MODAL_ID)?.showModal?.();
  const closeModal = () => document.getElementById(COND_MODAL_ID)?.close?.();

  // Repopulate on validation error
  useEffect(() => {
    if (!actionData?.values) return;
    if (nameRef.current)     nameRef.current.value     = actionData.values.name     ?? "";
    if (zipCodesRef.current) zipCodesRef.current.value = actionData.values.zipCodes ?? "";
    if (statusRef.current)   statusRef.current.value   = actionData.values.status   ?? "enabled";

    if (actionData.values.conditions) {
      try {
        setConditions(JSON.parse(actionData.values.conditions));
      } catch { /* ignore */ }
    }
  }, [actionData]);

  // ── Discard — reset all fields back to blank ──
  const handleDiscard = useCallback(() => {
    if (nameRef.current)     nameRef.current.value     = "";
    if (zipCodesRef.current) zipCodesRef.current.value = "";
    if (statusRef.current)   statusRef.current.value   = "enabled";
    setConditions(EMPTY_CONDITIONS);
  }, []);

  // ── Condition logic toggle ──
  // s-choice-list fires a custom event — value is in e.target.value
  // (same as native inputs; Polaris web components mirror the standard pattern)
  const handleLogicChange = useCallback((e) => {
    const value = e.target.value ?? e.detail?.value;
    if (value) setConditions((prev) => ({ ...prev, logic: value }));
  }, []);


  // ── Remove a condition rule ──
  const removeRule = useCallback((id) => {
    setConditions((prev) => ({ ...prev, rules: prev.rules.filter((r) => r.id !== id) }));
  }, []);

  // ── Reset operator select whenever the attribute changes in the modal ──
  useEffect(() => {
    const ops = getOperators(modalAttr);
    const defaultOp = ops[0].value;
    setModalOp(defaultOp);
    if (condOpRef.current) condOpRef.current.value = defaultOp;
  }, [modalAttr]);

  // ── Populate modal fields imperatively (web components need this) ──
  const populateModal = useCallback((attr, op, value, value2) => {
    setTimeout(() => {
      if (condAttrRef.current)   condAttrRef.current.value   = attr;
      if (condOpRef.current)     condOpRef.current.value     = op;
      if (condValueRef.current)  condValueRef.current.value  = value;
      if (condValue2Ref.current) condValue2Ref.current.value = value2 ?? "";
    }, 30);
  }, []);

  // ── Open modal in ADD mode ──
  const openAddModal = useCallback(() => {
    setEditingRuleId(null);
    setModalAttr("sku");
    setModalOp("equals");
    populateModal("sku", "equals", "", "");
    openModal();
  }, [populateModal]);

  // ── Open modal in EDIT mode ──
  const openEditModal = useCallback((rule) => {
    setEditingRuleId(rule.id);
    setModalAttr(rule.attribute);
    setModalOp(rule.operator);
    populateModal(rule.attribute, rule.operator, rule.value, rule.value2 ?? "");
    openModal();
  }, [populateModal]);

  // ── Track attribute/operator changes ──
  const handleModalAttrChange = useCallback((e) => {
    setModalAttr(e.target.value);
  }, []);

  const handleModalOpChange = useCallback((e) => {
    setModalOp(e.target.value);
  }, []);

  // ── Save (add or update) condition ──
  const handleSaveCondition = useCallback(() => {
    const attribute = condAttrRef.current?.value  || "sku";
    const operator  = condOpRef.current?.value    || "equals";
    const value     = condValueRef.current?.value?.trim()  || "";
    const value2    = condValue2Ref.current?.value?.trim() || "";

    if (!value) return;

    if (editingRuleId) {
      setConditions((prev) => ({
        ...prev,
        rules: prev.rules.map((r) =>
          r.id === editingRuleId
            ? { ...r, attribute, operator, value, value2 }
            : r
        ),
      }));
    } else {
      setConditions((prev) => ({
        ...prev,
        rules: [...prev.rules, { id: generateId(), attribute, operator, value, value2 }],
      }));
    }
    closeModal();
  }, [editingRuleId]);

  const isBetween = modalOp === "between";
  const isNumeric = ATTRIBUTE_OPTIONS.find((a) => a.value === modalAttr)?.numeric ?? false;

  return (
    <s-page heading="Create a zone">
      <s-button
        slot="primary-action"
        {...(isSaving ? { loading: true } : {})}
        onClick={() => document.getElementById(FORM_ID)?.requestSubmit()}
      >
        Save
      </s-button>
      <s-link slot="secondary-actions" href="/app/zones">Cancel</s-link>

      {/* Hidden conditions input is OUTSIDE the form so we can include it via JS — 
          instead we put it inside the Form below */}
      
      <Form
        method="post"
        id={FORM_ID}
        data-save-bar
        data-discard-confirmation
        onReset={handleDiscard}
      >
        <s-stack gap="base">
        {/* Serialised conditions travel as a hidden field */}
        <input type="hidden" name="conditions" value={JSON.stringify(conditions)} />

        {/* ── Zone details ── */}
        <s-section heading="Zone details">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              Give your zone a name and specify which zip codes are included.
              Once you create the zone, you can add shipping rates.
            </s-paragraph>

            <s-text-field
              ref={nameRef}
              label="Zone name"
              name="name"
              help-text="For internal use only — not visible to customers."
              error-message={actionData?.errors?.name ?? ""}
              required
              placeholder="e.g. Metro Area, Rural Zone"
            ></s-text-field>

            <s-text-area
              ref={zipCodesRef}
              label="Zip codes"
              name="zipCodes"
              rows="5"
              help-text="Separate entries with a comma. Use a hyphen for ranges (e.g. 4000-4100). You can mix single codes and ranges."
              error-message={actionData?.errors?.zipCodes ?? ""}
              required
              placeholder="e.g. 4000-4100, 4301-4400, 4516, 4517, 4530"
            ></s-text-area>

            <s-select ref={statusRef} label="Zone status" name="status">
              <s-option value="enabled">Enabled</s-option>
              <s-option value="disabled">Disabled</s-option>
            </s-select>
          </s-stack>
        </s-section>

        {/* ── Product conditions ── */}
        <s-section heading="Product conditions">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              Optionally restrict this zone to carts that contain specific products.
              Leave empty to apply this zone to all products.
            </s-paragraph>

            {actionData?.errors?.conditions && (
              <s-banner tone="critical">
                <s-text>{actionData.errors.conditions}</s-text>
              </s-banner>
            )}

                {/* Logic choice list */}
            <s-choice-list
              label="Conditions"
              name="conditionLogic"
              onChange={handleLogicChange}
            >
              <s-choice value="all" {...(conditions.logic === "all" ? { selected: true } : {})}>All conditions must match</s-choice>
              <s-choice value="any" {...(conditions.logic === "any" ? { selected: true } : {})}>Any condition must match</s-choice>
              <s-choice value="none" {...(conditions.logic === "none" ? { selected: true } : {})}>None of the conditions match</s-choice>
            </s-choice-list>

            {/* Rules list */}
            {conditions.rules.length > 0 ? (
              <s-stack direction="block" gap="small">
                {conditions.rules.map((rule) => (
                  <s-stack key={rule.id} direction="inline" gap="base" style={{ alignItems: "center" }}>
                    <s-stack direction="block" gap="none" style={{ flex: 1 }}>
                      <s-text>
                        <strong>{attributeLabel(rule.attribute)}</strong>
                        {" "}{operatorLabel(rule.attribute, rule.operator)}{" "}
                        <strong>{displayValue(rule)}</strong>
                      </s-text>
                    </s-stack>
                    <s-button type="button" variant="tertiary" onClick={() => openEditModal(rule)}>
                      Edit
                    </s-button>
                    <s-button type="button" tone="critical" variant="tertiary" onClick={() => removeRule(rule.id)}>
                      Remove
                    </s-button>
                  </s-stack>
                ))}
              </s-stack>
            ) : (
              <s-paragraph>No conditions added. This zone will apply to all products.</s-paragraph>
            )}

            <s-button type="button" variant="primary" onClick={openAddModal}>
              + Add condition
            </s-button>
          </s-stack>
        </s-section>
        </s-stack>
      </Form>

      <s-section slot="aside" heading="Rates">
        <s-paragraph>
          Choose between price and weight-based rates. You'll be able to add
          rates as soon as you create this zone.
        </s-paragraph>
      </s-section>

      {/* ── Add / Edit condition modal (native <dialog>) ── */}
      <dialog
        id={COND_MODAL_ID}
        style={{
          border: "none",
          borderRadius: "12px",
          padding: "24px",
          minWidth: "480px",
          maxWidth: "560px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          background: "white",
        }}
      >
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="base" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <s-text><strong>{editingRuleId ? "Edit condition" : "Add condition"}</strong></s-text>
            <s-button type="button" variant="tertiary" onClick={closeModal}>✕</s-button>
          </s-stack>

          <s-select ref={condAttrRef} label="Product attribute" onChange={handleModalAttrChange}>
            {ATTRIBUTE_OPTIONS.map((opt) => (
              <s-option key={opt.value} value={opt.value}>{opt.label}</s-option>
            ))}
          </s-select>

          <s-select ref={condOpRef} label="Condition" onChange={handleModalOpChange}>
            {getOperators(modalAttr).map((opt) => (
              <s-option key={opt.value} value={opt.value}>{opt.label}</s-option>
            ))}
          </s-select>

          <s-text-field
            ref={condValueRef}
            label={isBetween ? "From value" : "Value"}
            placeholder={isNumeric ? "e.g. 50" : "e.g. ABC123, DEF456"}
            help-text={!isNumeric && !isBetween ? "Separate multiple values with commas" : undefined}
          ></s-text-field>

          {isBetween && (
            <s-text-field ref={condValue2Ref} label="To value" placeholder="e.g. 150"></s-text-field>
          )}

          <s-stack direction="inline" gap="small" style={{ justifyContent: "flex-end" }}>
            <s-button type="button" variant="secondary" onClick={closeModal}>Cancel</s-button>
            <s-button type="button" variant="primary" onClick={handleSaveCondition}>
              {editingRuleId ? "Update" : "Add"}
            </s-button>
          </s-stack>
        </s-stack>
      </dialog>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);