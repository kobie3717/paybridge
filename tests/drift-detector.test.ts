import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { captureShape, compareShapes, diffBaseline, ProviderBaseline } from '../src/drift-detector';

describe('drift-detector', () => {
  describe('captureShape', () => {
    it('flattens nested objects correctly', () => {
      const obj = {
        data: {
          id: 123,
          link: 'https://example.com',
        },
        status: 'pending',
      };

      const shape = captureShape(obj);

      assert.deepStrictEqual(shape.keys, ['data.id', 'data.link', 'status']);
      assert.strictEqual(shape.types['data.id'], 'number');
      assert.strictEqual(shape.types['data.link'], 'string');
      assert.strictEqual(shape.types['status'], 'string');
    });

    it('handles arrays with [*] notation', () => {
      const obj = {
        items: [{ name: 'x' }, { name: 'y' }],
        count: 2,
      };

      const shape = captureShape(obj);

      assert.deepStrictEqual(shape.keys, ['count', 'items[*].name']);
      assert.strictEqual(shape.types['items[*].name'], 'string');
      assert.strictEqual(shape.types['count'], 'number');
    });

    it('handles empty arrays', () => {
      const obj = {
        items: [],
        count: 0,
      };

      const shape = captureShape(obj);

      assert.deepStrictEqual(shape.keys, ['count']);
      assert.strictEqual(shape.types['count'], 'number');
    });

    it('distinguishes null from undefined', () => {
      const obj = {
        nullValue: null,
        stringValue: 'test',
      };

      const shape = captureShape(obj);

      assert.ok(shape.keys.includes('nullValue'));
      assert.strictEqual(shape.types['nullValue'], 'null');
      assert.strictEqual(shape.types['stringValue'], 'string');
    });

    it('handles deeply nested structures', () => {
      const obj = {
        a: {
          b: {
            c: {
              d: 'deep',
            },
          },
        },
      };

      const shape = captureShape(obj);

      assert.deepStrictEqual(shape.keys, ['a.b.c.d']);
      assert.strictEqual(shape.types['a.b.c.d'], 'string');
    });

    it('handles mixed types in arrays', () => {
      const obj = {
        mixed: [
          { type: 'a', value: 1 },
          { type: 'b', value: 2 },
        ],
      };

      const shape = captureShape(obj);

      assert.ok(shape.keys.includes('mixed[*].type'));
      assert.ok(shape.keys.includes('mixed[*].value'));
      assert.strictEqual(shape.types['mixed[*].type'], 'string');
      assert.strictEqual(shape.types['mixed[*].value'], 'number');
    });

    it('handles boolean types', () => {
      const obj = {
        active: true,
        deleted: false,
      };

      const shape = captureShape(obj);

      assert.strictEqual(shape.types['active'], 'boolean');
      assert.strictEqual(shape.types['deleted'], 'boolean');
    });
  });

  describe('compareShapes', () => {
    it('detects added keys', () => {
      const baseline = captureShape({ id: 1 });
      const current = captureShape({ id: 1, newField: 'test' });

      const diff = compareShapes(baseline, current);

      assert.deepStrictEqual(diff.addedKeys, ['newField']);
      assert.deepStrictEqual(diff.removedKeys, []);
      assert.deepStrictEqual(diff.typeChanges, []);
    });

    it('detects removed keys', () => {
      const baseline = captureShape({ id: 1, oldField: 'test' });
      const current = captureShape({ id: 1 });

      const diff = compareShapes(baseline, current);

      assert.deepStrictEqual(diff.addedKeys, []);
      assert.deepStrictEqual(diff.removedKeys, ['oldField']);
      assert.deepStrictEqual(diff.typeChanges, []);
    });

    it('detects type changes', () => {
      const baseline = captureShape({ value: '123' });
      const current = captureShape({ value: 123 });

      const diff = compareShapes(baseline, current);

      assert.deepStrictEqual(diff.addedKeys, []);
      assert.deepStrictEqual(diff.removedKeys, []);
      assert.strictEqual(diff.typeChanges.length, 1);
      assert.strictEqual(diff.typeChanges[0].key, 'value');
      assert.strictEqual(diff.typeChanges[0].oldType, 'string');
      assert.strictEqual(diff.typeChanges[0].newType, 'number');
    });

    it('returns empty diff for identical shapes', () => {
      const baseline = captureShape({ id: 1, name: 'test', active: true });
      const current = captureShape({ id: 2, name: 'other', active: false });

      const diff = compareShapes(baseline, current);

      assert.deepStrictEqual(diff.addedKeys, []);
      assert.deepStrictEqual(diff.removedKeys, []);
      assert.deepStrictEqual(diff.typeChanges, []);
    });

    it('handles multiple changes simultaneously', () => {
      const baseline = captureShape({ id: 1, name: 'test', count: 5 });
      const current = captureShape({ id: '1', name: 'test', status: 'active' });

      const diff = compareShapes(baseline, current);

      assert.deepStrictEqual(diff.addedKeys, ['status']);
      assert.deepStrictEqual(diff.removedKeys, ['count']);
      assert.strictEqual(diff.typeChanges.length, 1);
      assert.strictEqual(diff.typeChanges[0].key, 'id');
    });
  });

  describe('diffBaseline', () => {
    it('produces correct DriftReport with no drift', () => {
      const baseline: ProviderBaseline = {
        providerName: 'stripe',
        operation: 'createPayment',
        shape: captureShape({ id: '123', status: 'pending' }),
        libVersion: '0.10.0',
      };

      const current = captureShape({ id: '456', status: 'pending' });

      const report = diffBaseline(baseline, current, 'stripe');

      assert.strictEqual(report.providerName, 'stripe');
      assert.strictEqual(report.driftDetected, false);
      assert.strictEqual(report.addedKeys.length, 0);
      assert.strictEqual(report.removedKeys.length, 0);
      assert.strictEqual(report.typeChanges.length, 0);
    });

    it('produces correct DriftReport with added keys', () => {
      const baseline: ProviderBaseline = {
        providerName: 'mollie',
        operation: 'createPayment',
        shape: captureShape({ id: '123' }),
        libVersion: '0.10.0',
      };

      const current = captureShape({ id: '456', newField: 'test' });

      const report = diffBaseline(baseline, current, 'mollie');

      assert.strictEqual(report.providerName, 'mollie');
      assert.strictEqual(report.driftDetected, true);
      assert.deepStrictEqual(report.addedKeys, ['newField']);
    });

    it('produces correct DriftReport with removed keys', () => {
      const baseline: ProviderBaseline = {
        providerName: 'square',
        operation: 'createPayment',
        shape: captureShape({ id: '123', legacyField: 'old' }),
        libVersion: '0.10.0',
      };

      const current = captureShape({ id: '456' });

      const report = diffBaseline(baseline, current, 'square');

      assert.strictEqual(report.providerName, 'square');
      assert.strictEqual(report.driftDetected, true);
      assert.deepStrictEqual(report.removedKeys, ['legacyField']);
    });

    it('produces correct DriftReport with type changes', () => {
      const baseline: ProviderBaseline = {
        providerName: 'paystack',
        operation: 'createPayment',
        shape: captureShape({ amount: '100' }),
        libVersion: '0.10.0',
      };

      const current = captureShape({ amount: 100 });

      const report = diffBaseline(baseline, current, 'paystack');

      assert.strictEqual(report.providerName, 'paystack');
      assert.strictEqual(report.driftDetected, true);
      assert.strictEqual(report.typeChanges.length, 1);
      assert.strictEqual(report.typeChanges[0].key, 'amount');
      assert.strictEqual(report.typeChanges[0].oldType, 'string');
      assert.strictEqual(report.typeChanges[0].newType, 'number');
    });

    it('detects status changes', () => {
      const baselineShape = captureShape({ id: '123' });
      baselineShape.status = 'pending';

      const baseline: ProviderBaseline = {
        providerName: 'yoco',
        operation: 'createPayment',
        shape: baselineShape,
        libVersion: '0.10.0',
      };

      const currentShape = captureShape({ id: '456' });
      currentShape.status = 'completed';

      const report = diffBaseline(baseline, currentShape, 'yoco');

      assert.strictEqual(report.driftDetected, true);
      assert.ok(report.statusChanged);
      assert.strictEqual(report.statusChanged!.old, 'pending');
      assert.strictEqual(report.statusChanged!.new, 'completed');
    });

    it('includes timestamps', () => {
      const baseline: ProviderBaseline = {
        providerName: 'ozow',
        operation: 'createPayment',
        shape: captureShape({ id: '123' }),
        libVersion: '0.10.0',
      };

      const current = captureShape({ id: '456' });

      const report = diffBaseline(baseline, current, 'ozow');

      assert.ok(report.baselineCapturedAt);
      assert.ok(report.newCapturedAt);
      assert.ok(Date.parse(report.baselineCapturedAt) > 0);
      assert.ok(Date.parse(report.newCapturedAt) > 0);
    });
  });
});
