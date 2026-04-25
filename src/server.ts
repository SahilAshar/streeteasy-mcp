#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { StreetEasyClient } from "streeteasy-api";
import type { SearchRentalsInput, SearchFilters, Sorting } from "streeteasy-api";
import { Areas, Amenities } from "streeteasy-api/dist/constants.js";
import type { AreaCode, Amenity } from "streeteasy-api/dist/constants.js";
import { formatSearchResults, formatListingDetails } from "./format.js";

// --- Area & amenity lookups ---

const AREA_NAMES = Object.keys(Areas) as (keyof typeof Areas)[];
const AMENITY_NAMES = Object.keys(Amenities) as (keyof typeof Amenities)[];

const areaByName: Record<string, number> = {};
for (const key of AREA_NAMES) {
  areaByName[key] = Areas[key];
}

// Group areas by borough for the status tool
function groupAreasByBorough(): Record<string, string[]> {
  const boroughs: Record<string, [number, number]> = {
    Manhattan: [100, 199],
    Bronx: [200, 299],
    Brooklyn: [300, 399],
    Queens: [400, 499],
    "Staten Island": [500, 599],
  };

  const grouped: Record<string, string[]> = { "All": ["ALL_NYC_AND_NJ"] };
  for (const [borough, [min, max]] of Object.entries(boroughs)) {
    grouped[borough] = AREA_NAMES.filter((name) => {
      const code = Areas[name];
      return code >= min && code <= max;
    });
  }
  return grouped;
}

// --- Rate limiter ---

let lastRequestTime = 0;
async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < 1000) {
    await new Promise((resolve) => setTimeout(resolve, 1000 - elapsed));
  }
  lastRequestTime = Date.now();
}

// --- Client ---

const client = new StreetEasyClient();

// --- MCP Server ---

const server = new McpServer(
  { name: "streeteasy", version: "0.1.0" },
  {
    instructions:
      "StreetEasy rental search for NYC apartments. Use `status` to discover valid neighborhood codes and amenity filters. Use `search_rentals` to find listings, then `get_listing_details` for full info on a specific listing.",
  },
);

// --- Tool: status ---

server.registerTool(
  "status",
  {
    description:
      "Returns available neighborhood codes (grouped by borough) and amenity filter values. Call this first to discover valid inputs for search_rentals.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => {
    const areas = groupAreasByBorough();
    const lines: string[] = [];

    lines.push("## Available Neighborhoods\n");
    for (const [borough, names] of Object.entries(areas)) {
      lines.push(`### ${borough}`);
      lines.push(names.join(", "));
      lines.push("");
    }

    lines.push("## Available Amenity Filters\n");
    lines.push("### Unit Amenities");
    lines.push("WASHER_DRYER, DISHWASHER, PRIVATE_OUTDOOR_SPACE, CENTRAL_AC, FURNISHED, FIREPLACE, LOFT\n");
    lines.push("### Views");
    lines.push("CITY_VIEW, GARDEN_VIEW, PARK_VIEW, SKYLINE_VIEW, WATER_VIEW\n");
    lines.push("### Building Amenities");
    lines.push(
      "DOORMAN, LAUNDRY, ELEVATOR, GYM, PARKING, SHARED_OUTDOOR_SPACE, POOL, PIED_A_TERRE_ALLOWED, CHILDRENS_PLAYROOM, SMOKE_FREE, STORAGE_SPACE, GUARANTORS_ACCEPTED",
    );

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  },
);

// --- Tool: search_rentals ---

server.registerTool(
  "search_rentals",
  {
    description:
      "Search StreetEasy for rental listings in NYC with filters. Returns formatted summaries with price, size, amenities, and links. Use `status` first to see valid neighborhood codes and amenity values.",
    inputSchema: {
      areas: z
        .array(z.string())
        .optional()
        .describe(
          "Neighborhood codes like EAST_VILLAGE, WILLIAMSBURG, UPPER_WEST_SIDE. Use `status` tool to see all valid codes.",
        ),
      price_min: z.number().nullable().optional().describe("Minimum monthly rent in dollars"),
      price_max: z.number().nullable().optional().describe("Maximum monthly rent in dollars"),
      bedrooms_min: z.number().int().min(0).optional().describe("Min bedrooms (0 = studio)"),
      bedrooms_max: z.number().int().optional().describe("Max bedrooms"),
      bathrooms_min: z.number().optional().describe("Min bathrooms"),
      bathrooms_max: z.number().optional().describe("Max bathrooms"),
      amenities: z
        .array(z.string())
        .optional()
        .describe(
          "Amenity filters: WASHER_DRYER, DISHWASHER, CENTRAL_AC, ELEVATOR, DOORMAN, GYM, LAUNDRY, etc. Use `status` to see all.",
        ),
      pets_allowed: z.boolean().optional().describe("Filter to pet-friendly buildings only"),
      no_fee_only: z.boolean().optional().describe("Only show no-fee listings (post-filter on results)"),
      sort_by: z
        .enum(["RECOMMENDED", "PRICE", "DATE_LISTED"])
        .default("RECOMMENDED")
        .describe("Sort attribute"),
      sort_direction: z
        .enum(["ASCENDING", "DESCENDING"])
        .default("DESCENDING")
        .describe("Sort order. ASCENDING = lowest first for price, oldest first for date."),
      per_page: z.number().int().min(1).max(50).default(25).describe("Results per page. Max 50."),
      page: z.number().int().min(1).default(1).describe("Page number"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (params) => {
    // Validate and map area names to codes
    const areaCodes: AreaCode[] = [];
    if (params.areas && params.areas.length > 0) {
      for (const name of params.areas) {
        const code = areaByName[name];
        if (code === undefined) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `Unknown area: "${name}". Use the \`status\` tool to see valid neighborhood codes.`,
              },
            ],
          };
        }
        areaCodes.push(code as AreaCode);
      }
    }

    // Validate amenity names
    const amenityValues: Amenity[] = [];
    if (params.amenities && params.amenities.length > 0) {
      for (const name of params.amenities) {
        if (!AMENITY_NAMES.includes(name as keyof typeof Amenities)) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `Unknown amenity: "${name}". Use the \`status\` tool to see valid amenity codes.`,
              },
            ],
          };
        }
        amenityValues.push(Amenities[name as keyof typeof Amenities]);
      }
    }

    // Build filters
    const filters: SearchFilters = { rentalStatus: "ACTIVE" };

    if (areaCodes.length > 0) filters.areas = areaCodes;

    if (params.price_min !== undefined || params.price_max !== undefined) {
      filters.price = {
        lowerBound: params.price_min ?? null,
        upperBound: params.price_max ?? null,
      };
    }

    if (params.bedrooms_min !== undefined || params.bedrooms_max !== undefined) {
      filters.bedrooms = {
        lowerBound: params.bedrooms_min ?? null,
        upperBound: params.bedrooms_max ?? null,
      };
    }

    if (params.bathrooms_min !== undefined || params.bathrooms_max !== undefined) {
      filters.bathrooms = {
        lowerBound: params.bathrooms_min ?? null,
        upperBound: params.bathrooms_max ?? null,
      };
    }

    if (amenityValues.length > 0) filters.amenities = amenityValues;
    if (params.pets_allowed !== undefined) filters.petsAllowed = params.pets_allowed;

    const sorting: Sorting = {
      attribute: params.sort_by,
      direction: params.sort_direction,
    };

    const input: SearchRentalsInput = {
      filters,
      sorting,
      perPage: params.per_page,
      page: params.page,
    };

    try {
      await rateLimit();
      const response = await client.searchRentals(input);

      let edges = response.searchRentals.edges;

      // Post-filter for no-fee if requested
      if (params.no_fee_only) {
        edges = edges.filter((edge) => edge.node.noFee);
      }

      const text = formatSearchResults(
        edges,
        response.searchRentals.totalCount,
        params.page,
        params.per_page,
      );

      return { content: [{ type: "text" as const, text }] };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: `StreetEasy API error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  },
);

// --- Tool: get_listing_details ---

server.registerTool(
  "get_listing_details",
  {
    description:
      "Get full details for a specific StreetEasy rental listing by ID. Returns description, building info, amenities, pet policy, transit, open houses, and price history. Get listing IDs from search_rentals results.",
    inputSchema: {
      listing_id: z.string().describe("The listing ID from search_rentals results"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ listing_id }) => {
    try {
      await rateLimit();
      const response = await client.getRentalListingDetails(listing_id);
      const text = formatListingDetails(response);
      return { content: [{ type: "text" as const, text }] };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: `Failed to fetch listing ${listing_id}: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  },
);

// --- Start ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});
