const MONEY_SCALE_DIGITS = 10;
const MONEY_SCALE = 10n ** 10n;

const groupThousands = (value: string) =>
  value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export function coerceBigInt(value: unknown) {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^[+-]?\d+$/.test(trimmed)) {
      return BigInt(trimmed);
    }
  }
  return null;
}

export function unitsToDecimalString(value: unknown) {
  const units = coerceBigInt(value);
  if (units === null) {
    return null;
  }
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const whole = abs / MONEY_SCALE;
  const fraction = abs % MONEY_SCALE;
  const fractionRaw = fraction.toString().padStart(MONEY_SCALE_DIGITS, "0");
  const fractionTrimmed = fractionRaw.replace(/0+$/, "");
  const sign = negative ? "-" : "";
  if (!fractionTrimmed) {
    return `${sign}${whole.toString()}`;
  }
  return `${sign}${whole.toString()}.${fractionTrimmed}`;
}

export function formatDecimalString(
  value: string | null | undefined,
  options: { maximumFractionDigits?: number } = {}
) {
  if (typeof value !== "string") {
    return "-";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "-";
  }
  const sign = trimmed.startsWith("-") ? "-" : "";
  const unsigned = sign ? trimmed.slice(1) : trimmed;
  const [rawWhole, rawFraction = ""] = unsigned.split(".");
  const whole = rawWhole.replace(/^0+(?=\d)/, "") || "0";
  const maxFractionDigits =
    typeof options.maximumFractionDigits === "number"
      ? Math.max(0, options.maximumFractionDigits)
      : MONEY_SCALE_DIGITS;
  const fraction = rawFraction
    .slice(0, maxFractionDigits)
    .replace(/0+$/, "");
  const valueWithSign = `${sign}${groupThousands(whole)}${
    fraction ? `.${fraction}` : ""
  }`;
  if (valueWithSign === "-0") {
    return "0";
  }
  return valueWithSign;
}

export function formatCurrencyString(
  value: string | null | undefined,
  currency?: string
) {
  const formatted = formatDecimalString(value);
  const code =
    typeof currency === "string" && /^[A-Z]{3}$/.test(currency.toUpperCase())
      ? currency.toUpperCase()
      : "USD";
  const symbol = code === "USD" ? "$" : `${code} `;
  if (formatted === "-") {
    return `${symbol}0`;
  }
  return `${symbol}${formatted}`;
}

export { MONEY_SCALE_DIGITS };
