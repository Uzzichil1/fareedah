/** Parse a dollar string to integer cents, or null if invalid. No float math. */
export function dollarsToCents(input: string): number | null {
  const t = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [whole, frac = ""] = t.split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

export function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}
