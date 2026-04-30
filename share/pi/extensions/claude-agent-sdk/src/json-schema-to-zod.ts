import { z, type ZodRawShape, type ZodTypeAny } from "zod";

/**
 * Convert a JSON Schema object to a Zod raw shape suitable for the SDK's
 * `createSdkMcpServer` `tool()` factory. The SDK then converts the Zod
 * shape back to JSON Schema before sending to the model — this round trip
 * is unfortunate but unavoidable given the SDK's API surface.
 *
 * Scope: covers the JSON Schema features TypeBox emits for pi's tool
 * `parameters`: object with primitive properties (string/number/boolean),
 * arrays, nested objects, optional/required, enum, description. Anything
 * unrecognized falls back to `z.any()` so the conversion never throws.
 */
export function jsonSchemaObjectToZodShape(schema: unknown): ZodRawShape {
  if (
    !isObject(schema) ||
    schema.type !== "object" ||
    !isObject(schema.properties)
  ) {
    return {};
  }
  const required = new Set(
    Array.isArray(schema.required) ? (schema.required as string[]) : [],
  );
  const shape: Record<string, ZodTypeAny> = {};
  for (const [key, propSchema] of Object.entries(schema.properties)) {
    const inner = jsonSchemaToZod(propSchema);
    shape[key] = required.has(key) ? inner : inner.optional();
  }
  return shape as ZodRawShape;
}

function jsonSchemaToZod(schema: unknown): ZodTypeAny {
  if (!isObject(schema)) return z.any();

  const desc =
    typeof schema.description === "string" ? schema.description : undefined;
  const withDesc = (zt: ZodTypeAny): ZodTypeAny =>
    desc ? zt.describe(desc) : zt;

  if (Array.isArray(schema.enum)) {
    const values = schema.enum.filter(
      (v): v is string => typeof v === "string",
    );
    if (values.length > 0)
      return withDesc(z.enum(values as [string, ...string[]]));
    return withDesc(z.any());
  }

  const t = schema.type;
  if (Array.isArray(t)) {
    // union of types — keep it simple
    return withDesc(z.any());
  }
  switch (t) {
    case "string":
      return withDesc(z.string());
    case "number":
    case "integer":
      return withDesc(z.number());
    case "boolean":
      return withDesc(z.boolean());
    case "null":
      return withDesc(z.null());
    case "array": {
      const items = isObject(schema.items)
        ? jsonSchemaToZod(schema.items)
        : z.any();
      return withDesc(z.array(items));
    }
    case "object": {
      const shape = jsonSchemaObjectToZodShape(schema);
      return withDesc(z.object(shape));
    }
    default:
      return withDesc(z.any());
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
