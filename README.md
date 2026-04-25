# streeteasy-mcp

An MCP server that lets you search [StreetEasy](https://streeteasy.com) rental listings directly from Claude. No API key required.

Search by neighborhood, price, bedrooms, amenities, pet policy, and more — then drill into full listing details with transit info, price history, and open houses.

![MCP Compatible](https://img.shields.io/badge/MCP-compatible-blue)

## Tools

| Tool | Description |
|------|-------------|
| `search_rentals` | Search listings with filters (neighborhood, price range, bedrooms, amenities, pets, no-fee) |
| `get_listing_details` | Full details for a listing: description, building info, pet policy, transit, price history, open houses |
| `status` | Discover valid neighborhood codes and amenity filter values |

## Setup

### Claude Code

```bash
# Clone and build
git clone https://github.com/SahilAshar/streeteasy-mcp.git
cd streeteasy-mcp
npm install
npm run build

# Add to your project
echo '{
  "mcpServers": {
    "streeteasy": {
      "command": "node",
      "args": ["'"$(pwd)"'/dist/server.js"]
    }
  }
}' > /path/to/your/project/.mcp.json
```

Or add it to an existing `.mcp.json`:

```json
{
  "mcpServers": {
    "streeteasy": {
      "command": "node",
      "args": ["/absolute/path/to/streeteasy-mcp/dist/server.js"]
    }
  }
}
```

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "streeteasy": {
      "command": "node",
      "args": ["/absolute/path/to/streeteasy-mcp/dist/server.js"]
    }
  }
}
```

## Example Usage

Once connected, you can ask Claude things like:

- "Find me a 1BR in the East Village under $4,500 with a dishwasher"
- "Search for no-fee apartments in Williamsburg and Greenpoint, 1-2 bedrooms, pet-friendly"
- "Show me details on that listing at 81 Saint Mark's Place"
- "What neighborhoods can I search in Brooklyn?"

## Search Filters

| Filter | Type | Example |
|--------|------|---------|
| `areas` | Neighborhood codes | `["EAST_VILLAGE", "WILLIAMSBURG"]` |
| `price_min` / `price_max` | Dollars | `3000` / `5000` |
| `bedrooms_min` / `bedrooms_max` | Integer (0 = studio) | `1` / `2` |
| `bathrooms_min` / `bathrooms_max` | Number | `1` |
| `amenities` | Amenity codes | `["DISHWASHER", "WASHER_DRYER"]` |
| `pets_allowed` | Boolean | `true` |
| `no_fee_only` | Boolean | `true` |
| `sort_by` | Enum | `RECOMMENDED`, `PRICE`, `DATE_LISTED` |

Use the `status` tool to see all valid neighborhood codes (250+ across all 5 boroughs) and amenity values.

## How It Works

This server wraps the [`streeteasy-api`](https://github.com/evandcoleman/streeteasy-api) npm package, which queries StreetEasy's GraphQL API. No API key or authentication is needed. A built-in rate limiter (1 request/second) keeps requests polite.

Results are formatted as readable markdown — not raw JSON — so Claude can present them naturally in conversation.

## License

MIT
