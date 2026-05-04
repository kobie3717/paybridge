export interface ResponseShape {
  keys: string[];
  types: Record<string, 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null'>;
  status?: string;
  capturedAt: string;
}

export interface ProviderBaseline {
  providerName: string;
  operation: string;
  shape: ResponseShape;
  libVersion: string;
}

export interface DriftReport {
  providerName: string;
  driftDetected: boolean;
  addedKeys: string[];
  removedKeys: string[];
  typeChanges: Array<{ key: string; oldType: string; newType: string }>;
  statusChanged?: { old: string; new: string };
  baselineCapturedAt: string;
  newCapturedAt: string;
}

type JsType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';

function getType(value: unknown): JsType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value as JsType;
}

function flattenKeys(obj: unknown, prefix = ''): Array<{ path: string; type: JsType }> {
  const result: Array<{ path: string; type: JsType }> = [];

  if (obj === null || obj === undefined) {
    return result;
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) {
      return result;
    }
    for (const item of obj) {
      const nested = flattenKeys(item, `${prefix}[*]`);
      result.push(...nested);
    }
  } else if (typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const valueType = getType(value);

      if (valueType === 'object' || valueType === 'array') {
        const nested = flattenKeys(value, path);
        result.push(...nested);
      } else {
        result.push({ path, type: valueType });
      }
    }
  }

  return result;
}

function deduplicateKeys(entries: Array<{ path: string; type: JsType }>): Array<{ path: string; type: JsType }> {
  const seen = new Map<string, JsType>();
  for (const entry of entries) {
    if (!seen.has(entry.path)) {
      seen.set(entry.path, entry.type);
    }
  }
  return Array.from(seen.entries()).map(([path, type]) => ({ path, type }));
}

export function captureShape(response: unknown): ResponseShape {
  const entries = flattenKeys(response);
  const deduplicated = deduplicateKeys(entries);
  const sorted = deduplicated.sort((a, b) => a.path.localeCompare(b.path));

  const keys = sorted.map((e) => e.path);
  const types: Record<string, JsType> = {};
  for (const entry of sorted) {
    types[entry.path] = entry.type;
  }

  return {
    keys,
    types,
    capturedAt: new Date().toISOString(),
  };
}

export function compareShapes(
  baseline: ResponseShape,
  current: ResponseShape
): {
  addedKeys: string[];
  removedKeys: string[];
  typeChanges: Array<{ key: string; oldType: string; newType: string }>;
} {
  const baselineSet = new Set(baseline.keys);
  const currentSet = new Set(current.keys);

  const addedKeys = current.keys.filter((k) => !baselineSet.has(k));
  const removedKeys = baseline.keys.filter((k) => !currentSet.has(k));

  const typeChanges: Array<{ key: string; oldType: string; newType: string }> = [];
  for (const key of current.keys) {
    if (baselineSet.has(key)) {
      const oldType = baseline.types[key];
      const newType = current.types[key];
      if (oldType !== newType) {
        typeChanges.push({ key, oldType, newType });
      }
    }
  }

  return { addedKeys, removedKeys, typeChanges };
}

export function diffBaseline(
  baseline: ProviderBaseline,
  currentShape: ResponseShape,
  providerName: string
): DriftReport {
  const diff = compareShapes(baseline.shape, currentShape);

  let statusChanged: { old: string; new: string } | undefined;
  if (baseline.shape.status && currentShape.status && baseline.shape.status !== currentShape.status) {
    statusChanged = { old: baseline.shape.status, new: currentShape.status };
  }

  const driftDetected =
    diff.addedKeys.length > 0 ||
    diff.removedKeys.length > 0 ||
    diff.typeChanges.length > 0 ||
    !!statusChanged;

  return {
    providerName,
    driftDetected,
    addedKeys: diff.addedKeys,
    removedKeys: diff.removedKeys,
    typeChanges: diff.typeChanges,
    statusChanged,
    baselineCapturedAt: baseline.shape.capturedAt,
    newCapturedAt: currentShape.capturedAt,
  };
}
