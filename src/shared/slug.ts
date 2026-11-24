// "Tulsa County" -> "tulsa-county"; "St. Mary's County" -> "st-marys-county"; "Doña Ana County" -> "dona-ana-county"
export function countySlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Bare county name for matching feeds: "Tulsa County" -> "tulsa", "East Baton Rouge Parish" -> "east baton rouge"
export function bareCountyKey(name: string): string {
  return countySlug(name)
    .replace(/-(county|parish|borough|census-area|city-and-borough|municipality|city)$/, "")
    .replace(/-/g, " ");
}
