/**
 * DO locationHint region options share data.
 *
 * `value` directly corresponds to the locationHint value in Cloudflare DO.
 * `value = ''` means 'Auto' (no hint is left, Cloudflare handles scheduling by default);
 * When saving the server, the user-db will automatically infer and persist the hint through ipapi.co.
 *
 * Reference: https://developers.cloudflare.com/durable-objects/reference/data-location/
 */
export interface RegionOption {
  value: string;
  label: string;
}

export const REGION_OPTIONS: RegionOption[] = [
  { value: '', label: 'Automatic (inferred by the system when saving)' },
  { value: 'wnam', label: 'North America — West' },
  { value: 'enam', label: 'North America — East' },
  { value: 'sam', label: 'South America' },
  { value: 'weur', label: 'Europe — West' },
  { value: 'eeur', label: 'Europe — East' },
  { value: 'apac', label: 'Asia-Pacific' },
  { value: 'apac-ne', label: 'Asia-Pacific — Northeast' },
  { value: 'apac-se', label: 'Asia-Pacific — Southeast' },
  { value: 'oc', label: 'Oceania' },
  { value: 'afr', label: 'Africa' },
  { value: 'me', label: 'Middle East' },
];

/**
 * Returns a friendly label based on the locationHint value (for read-only scenarios like the status bar, edit echo, etc.).
 */
export function regionLabel(value: string | null | undefined): string {
  if (!value) return 'Automatic';
  return REGION_OPTIONS.find(o => o.value === value)?.label || value;
}

/**
 * Build a `<select>` element with a filled-in options list.
 */
export function populateRegionSelect(
  el: HTMLSelectElement,
  selected: string | null | undefined,
): void {
  el.innerHTML = REGION_OPTIONS.map(o =>
    `<option value="${o.value}" ${o.value === (selected || '') ? 'selected' : ''}>${o.label}</option>`,
  ).join('');
}
