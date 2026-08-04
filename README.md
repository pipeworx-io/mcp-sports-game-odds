# mcp-sports-game-odds

Sports Game Odds MCP — wraps the Sports Game Odds API (sportsgameodds.com)

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `sgo_events` | List upcoming <league> games with odds. Returns scheduled events for a league (NFL, NBA, MLB, NHL, EPL, etc.) with team names, start time, status, and eventIDs to fetch full odds. Example: sgo_events({ leagueID: "NFL", _apiKey: "your-key" }) |
| `sgo_event_odds` | Get all odds & player props for a specific game. Returns moneyline, spread, and total markets plus player props for a single event, with prices across sportsbooks. Look up the eventID first via sgo_events. Example: sgo_event_odds({ eventID: "abc123", _apiKey: "your-key" }) |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "sports-game-odds": {
      "url": "https://gateway.pipeworx.io/sports-game-odds/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Sports Game Odds data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
