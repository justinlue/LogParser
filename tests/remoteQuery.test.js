import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildQueryArgs, snVinMismatchWarning } from '../src/remoteQuery.js';

const SN = 'NSBB22100D59F7B';
const OTHER_SN = 'NSB023567819006';
const VIN = 'LSV2BDDG6SN016885';

test('buildQueryArgs searches by SN when both SN and VIN are entered', () => {
  const args = buildQueryArgs({ sn: 'NSBB22100D59F7B', vin: 'LSV2BDDG6SN016885' });
  assert.deepEqual(args, [
    'query.py', '--sn', 'NSBB22100D59F7B', '--vin', 'LSV2BDDG6SN016885',
  ]);
});

test('buildQueryArgs keeps VIN-only and SN-only queries, with the optional filters', () => {
  assert.deepEqual(buildQueryArgs({ vin: VIN }), ['query.py', '--vin', VIN]);
  assert.deepEqual(
    buildQueryArgs({ sn: SN, start: '2026-01-01', end: '2026-01-02', source: 'aliyun' }),
    ['query.py', '--sn', SN, '--start', '2026-01-01', '--end', '2026-01-02', '--source', 'aliyun']
  );
});

test('snVinMismatchWarning warns when the VIN belongs to a different SN', () => {
  assert.equal(
    snVinMismatchWarning({ sn: SN, vin: VIN, vinSn: OTHER_SN }),
    'The current SN and VIN do not match.'
  );
});

test('snVinMismatchWarning is silent when the VIN resolves to the entered SN', () => {
  assert.equal(snVinMismatchWarning({ sn: SN, vin: VIN, vinSn: SN }), null);
  assert.equal(snVinMismatchWarning({ sn: SN.toLowerCase(), vin: VIN, vinSn: SN }), null);
});

test('snVinMismatchWarning is silent when only one of SN and VIN was entered', () => {
  assert.equal(snVinMismatchWarning({ sn: SN, vinSn: OTHER_SN }), null);
  assert.equal(snVinMismatchWarning({ vin: VIN, vinSn: OTHER_SN }), null);
});

test('snVinMismatchWarning is silent when the VIN could not be resolved', () => {
  assert.equal(snVinMismatchWarning({ sn: SN, vin: VIN, vinSn: null }), null);
});
