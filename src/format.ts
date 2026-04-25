import type {
  SearchRentalListing,
  DetailedRentalListing,
  Building,
  RentalListingDetailsResponse,
  OrganicRentalEdge,
  RentalEdge,
} from "streeteasy-api";

const SE_BASE = "https://streeteasy.com";

function formatPrice(price: number): string {
  return `$${price.toLocaleString("en-US")}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Unknown";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function bedroomLabel(count: number): string {
  if (count === 0) return "Studio";
  return `${count}BR`;
}

function bathroomLabel(full: number, half: number): string {
  const parts: string[] = [];
  if (full > 0) parts.push(`${full}`);
  if (half > 0) parts.push(`${half} half`);
  return parts.join(" + ") + " bath";
}

export function formatListingSummary(listing: SearchRentalListing, edge?: RentalEdge): string {
  const lines: string[] = [];

  const bed = bedroomLabel(listing.bedroomCount);
  const bath = bathroomLabel(listing.fullBathroomCount, listing.halfBathroomCount);
  const sqft = listing.livingAreaSize ? `${listing.livingAreaSize.toLocaleString()} sqft` : null;

  lines.push(`### ${listing.street}${listing.unit ? `, ${listing.unit}` : ""}`);
  lines.push(`**${formatPrice(listing.price)}/mo** · ${bed} / ${bath}${sqft ? ` · ${sqft}` : ""}`);

  const tags: string[] = [];
  if (listing.noFee) tags.push("NO FEE");
  if (listing.netEffectivePrice && listing.netEffectivePrice < listing.price) {
    tags.push(`Net effective: ${formatPrice(listing.netEffectivePrice)}/mo`);
  }
  if (listing.monthsFree && listing.monthsFree > 0) {
    tags.push(`${listing.monthsFree} month${listing.monthsFree > 1 ? "s" : ""} free`);
  }
  if (listing.furnished) tags.push("Furnished");
  if (tags.length > 0) lines.push(tags.join(" · "));

  lines.push(`📍 ${listing.areaName}`);
  if (listing.availableAt) {
    lines.push(`Available: ${formatDate(listing.availableAt)}`);
  }

  const matched = edge && "matchedAmenities" in edge ? (edge as OrganicRentalEdge).matchedAmenities : null;
  const missing = edge && "missingAmenities" in edge ? (edge as OrganicRentalEdge).missingAmenities : null;
  if (matched && matched.length > 0) {
    lines.push(`✓ Matched amenities: ${matched.join(", ")}`);
  }
  if (missing && missing.length > 0) {
    lines.push(`✗ Missing: ${missing.join(", ")}`);
  }

  if (listing.priceDelta && listing.priceDelta !== 0) {
    const direction = listing.priceDelta < 0 ? "↓" : "↑";
    lines.push(`Price change: ${direction} ${formatPrice(Math.abs(listing.priceDelta))}`);
  }

  lines.push(`🔗 ${SE_BASE}${listing.urlPath}`);
  lines.push(`ID: \`${listing.id}\``);

  return lines.join("\n");
}

export function formatSearchResults(
  edges: RentalEdge[],
  totalCount: number,
  page: number,
  perPage: number,
): string {
  if (edges.length === 0) {
    return "No listings found matching your criteria. Try broadening your search (wider price range, more neighborhoods, fewer amenity requirements).";
  }

  const lines: string[] = [];
  lines.push(`## StreetEasy Rental Search Results`);
  lines.push(`**${totalCount.toLocaleString()} listings found** · Showing page ${page} (${edges.length} results)\n`);

  for (const edge of edges) {
    lines.push(formatListingSummary(edge.node, edge));
    lines.push("---");
  }

  if (totalCount > page * perPage) {
    lines.push(`_${totalCount - page * perPage} more results available. Use \`page: ${page + 1}\` to see the next page._`);
  }

  return lines.join("\n");
}

export function formatListingDetails(response: RentalListingDetailsResponse): string {
  const listing = response.rentalByListingId;
  const building = response.buildingByRentalListingId;
  const buildingExpress = response.getBuildingExpressByRentalListingId;
  const lines: string[] = [];

  const addr = listing.propertyDetails.address;
  lines.push(`## ${addr.street}${addr.unit ? `, ${addr.unit}` : ""}`);
  lines.push(`${addr.city}, ${addr.state} ${addr.zipCode}\n`);

  // Pricing
  lines.push(`### Pricing`);
  lines.push(`- **${formatPrice(listing.pricing.price)}/mo**`);
  if (listing.pricing.noFee) lines.push(`- **NO FEE**`);
  if (listing.pricing.monthsFree) lines.push(`- ${listing.pricing.monthsFree} month(s) free`);
  if (listing.pricing.leaseTermMonths) lines.push(`- Lease term: ${listing.pricing.leaseTermMonths} months`);
  if (listing.pricing.priceDelta) {
    const dir = listing.pricing.priceDelta < 0 ? "↓" : "↑";
    lines.push(`- Price change: ${dir} ${formatPrice(Math.abs(listing.pricing.priceDelta))}`);
  }
  if (listing.recentListingsPriceStats?.rentalPriceStats?.medianPrice) {
    lines.push(`- Area median rental: ${formatPrice(listing.recentListingsPriceStats.rentalPriceStats.medianPrice)}/mo`);
  }

  // Unit details
  const pd = listing.propertyDetails;
  const bed = bedroomLabel(pd.bedroomCount);
  const bath = bathroomLabel(pd.fullBathroomCount, pd.halfBathroomCount);
  lines.push(`\n### Unit Details`);
  lines.push(`- ${bed} / ${bath} · ${pd.roomCount} rooms`);
  if (pd.livingAreaSize) lines.push(`- ${pd.livingAreaSize.toLocaleString()} sqft`);
  lines.push(`- Available: ${formatDate(listing.availableAt)}`);
  lines.push(`- Status: ${listing.status}`);

  // Description
  if (listing.description) {
    lines.push(`\n### Description`);
    lines.push(listing.description.replace(/<[^>]*>/g, "").trim());
  }

  // Unit features
  if (pd.features.list.length > 0) {
    lines.push(`\n### Unit Features`);
    for (const f of pd.features.list) lines.push(`- ${f}`);
    if (pd.features.views.length > 0) lines.push(`- Views: ${pd.features.views.join(", ")}`);
    if (pd.features.privateOutdoorSpaceTypes.length > 0) {
      lines.push(`- Outdoor space: ${pd.features.privateOutdoorSpaceTypes.join(", ")}`);
    }
  }

  // Building amenities
  if (pd.amenities.list.length > 0) {
    lines.push(`\n### Building Amenities`);
    for (const a of pd.amenities.list) lines.push(`- ${a}`);
    if (pd.amenities.doormanTypes.length > 0) {
      lines.push(`- Doorman: ${pd.amenities.doormanTypes.join(", ")}`);
    }
  }

  // Pet policy
  if (building.policies?.petPolicy) {
    const pet = building.policies.petPolicy;
    lines.push(`\n### Pet Policy`);
    lines.push(`- Cats: ${pet.catsAllowed ? "✓ Allowed" : "✗ Not allowed"}`);
    lines.push(`- Dogs: ${pet.dogsAllowed ? "✓ Allowed" : "✗ Not allowed"}`);
    if (pet.maxDogWeight) lines.push(`- Max dog weight: ${pet.maxDogWeight} lbs`);
    if (pet.restrictedDogBreeds.length > 0) {
      lines.push(`- Restricted breeds: ${pet.restrictedDogBreeds.join(", ")}`);
    }
  }
  if (building.policies?.list && building.policies.list.length > 0) {
    lines.push(`\n### Building Policies`);
    for (const p of building.policies.list) lines.push(`- ${p}`);
  }

  // Building info
  lines.push(`\n### Building`);
  lines.push(`- ${building.name || building.address.street}`);
  lines.push(`- Type: ${building.type}`);
  if (building.yearBuilt) lines.push(`- Year built: ${building.yearBuilt}`);
  if (building.residentialUnitCount) lines.push(`- ${building.residentialUnitCount} units`);
  lines.push(`- Area: ${building.area.name}`);

  // Transit
  if (building.nearby.transitStations.length > 0) {
    lines.push(`\n### Transit`);
    for (const station of building.nearby.transitStations.slice(0, 5)) {
      const dist = station.distance < 0.1 ? `${Math.round(station.distance * 5280)} ft` : `${station.distance.toFixed(2)} mi`;
      lines.push(`- **${station.name}** (${station.routes.join(", ")}) — ${dist}`);
    }
  }

  // Open houses
  if (listing.upcomingOpenHouses.length > 0) {
    lines.push(`\n### Open Houses`);
    for (const oh of listing.upcomingOpenHouses) {
      const start = new Date(oh.startTime).toLocaleString("en-US", {
        weekday: "short", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit", timeZone: "America/New_York",
      });
      const end = new Date(oh.endTime).toLocaleString("en-US", {
        hour: "numeric", minute: "2-digit", timeZone: "America/New_York",
      });
      lines.push(`- ${start} – ${end}${oh.appointmentOnly ? " (by appointment)" : ""}`);
    }
  }

  // Price history
  if (listing.propertyHistory.length > 0) {
    lines.push(`\n### Price History`);
    for (const hist of listing.propertyHistory) {
      for (const event of hist.rentalEventsOfInterest) {
        const priceStr = formatPrice(event.price);
        const pctStr = event.pricePercentChange ? ` (${event.pricePercentChange > 0 ? "+" : ""}${event.pricePercentChange.toFixed(1)}%)` : "";
        lines.push(`- ${formatDate(event.date)}: ${event.status} at ${priceStr}${pctStr}`);
      }
    }
  }

  // Media
  const photoCount = listing.media.photos.length;
  const videoCount = listing.media.videos.length;
  const floorPlanCount = listing.media.floorPlans.length;
  const mediaParts: string[] = [];
  if (photoCount > 0) mediaParts.push(`${photoCount} photos`);
  if (floorPlanCount > 0) mediaParts.push(`${floorPlanCount} floor plans`);
  if (videoCount > 0) mediaParts.push(`${videoCount} videos`);
  if (listing.media.tour3dUrl) mediaParts.push("3D tour available");
  if (mediaParts.length > 0) {
    lines.push(`\n### Media`);
    lines.push(mediaParts.join(" · "));
  }

  // Schools
  if (buildingExpress?.nearbySchools?.length > 0) {
    lines.push(`\n### Nearby Schools`);
    for (const school of buildingExpress.nearbySchools.slice(0, 5)) {
      lines.push(`- ${school.name} (${school.grades.join(", ")})`);
    }
  }

  lines.push(`\nID: \`${listing.id}\``);

  return lines.join("\n");
}
