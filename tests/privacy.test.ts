import { describe, expect, it } from 'vitest';
import { detect, luhnValid, redact, toRawOffset, verhoeffValid } from '../src/engine/pii';

describe('PII redaction (raw zone → analysis zone)', () => {
  it('validates card numbers with Luhn and masks them', () => {
    expect(luhnValid('4539 1488 0343 6467')).toBe(true);
    expect(luhnValid('4539 1488 0343 6468')).toBe(false);
    const r = redact('The card number is 4539 1488 0343 6467.');
    expect(r.text).toBe('The card number is [CARD].');
  });

  it('does not mask digit runs that fail Luhn as cards', () => {
    expect(detect('reference 4539 1488 0343 6468').some((h) => h.type === 'CARD')).toBe(false);
  });

  it('validates Aadhaar numbers with Verhoeff', () => {
    expect(verhoeffValid('2341 2341 2346')).toBe(true);
    expect(verhoeffValid('2341 2341 2345')).toBe(false);
  });

  it('masks PAN, email, phone, DOB and policy ids', () => {
    const r = redact('PAN BQKPM4321L, mail priya.nair89@gmail.com, mobile 98301 22456, born 14 March 1989, policy MV22049173.');
    expect(r.text).toBe('PAN [PAN], mail [EMAIL], mobile [PHONE], born [DOB], policy [POLICY_ID].');
    expect(r.redactions.map((x) => x.type)).toEqual(['PAN', 'EMAIL', 'PHONE', 'DOB', 'POLICY_ID']);
  });

  it('leaves non-birth dates alone', () => {
    expect(redact('due on 5 October').text).toBe('due on 5 October');
  });

  it('maps redacted offsets back to the raw text', () => {
    const raw = 'It is 14 March 1989 today';
    const r = redact(raw);
    expect(r.text).toBe('It is [DOB] today');
    const rs = r.text.indexOf('[DOB]');
    expect(raw.slice(toRawOffset(rs, r.redactions, 'start'), toRawOffset(rs + 5, r.redactions, 'end'))).toBe('14 March 1989');
    expect(raw.slice(toRawOffset(r.text.indexOf('today'), r.redactions, 'start'))).toBe('today');
  });
});
