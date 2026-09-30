export function formatLocalityCity(addressStr?: string): string {
  if (!addressStr || typeof addressStr !== "string") return "";
  const clean = addressStr.trim();
  if (!clean) return "";

  const parts = clean.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const filtered = parts.filter((p) => !/^\d{5,6}$/.test(p) && p.toLowerCase() !== "india");
    if (filtered.length >= 2) {
      return `${filtered[0]}, ${filtered[1]}`;
    }
    return filtered[0] || clean;
  }
  return clean;
}

export function getVisitLocationDisplay(
  address?: string | null,
  lat?: number | null,
  lng?: number | null
): string {
  if (address && typeof address === "string" && address.trim()) {
    const formatted = formatLocalityCity(address);
    if (formatted) return formatted;
  }
  if (typeof lat === "number" && typeof lng === "number" && !isNaN(lat) && !isNaN(lng)) {
    return `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;
  }
  return "Location Recorded";
}
