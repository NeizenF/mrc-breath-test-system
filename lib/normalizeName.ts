export function normalizeName(name: string) {
  let value = (name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[‘’´`]/g, "'")
    .replace(/[“”]/g, '"');

  // remove bracketed suffixes only for matching
  value = value.replace(/\([^)]*\)/g, " ");

  value = value.replace(/\./g, "");
  value = value.replace(/[^a-zA-Z0-9\s'-]/g, " ");

  return value.toLowerCase().replace(/\s+/g, " ").trim();
}