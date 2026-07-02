interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * Sports Game Odds MCP — wraps the Sports Game Odds API (sportsgameodds.com)
 *
 * Betting odds across 80+ sportsbooks, including moneyline / spread / total
 * markets and player props, for major sports leagues (NFL, NBA, MLB, NHL,
 * soccer, and more).
 *
 * Tools:
 * - sgo_events:     list upcoming events (games) with odds for a league
 * - sgo_event_odds: full odds & player props for a single event
 *
 * BYO key: every tool requires an `_apiKey` parameter, passed as the
 * `X-Api-Key` request header. Get a free key at sportsgameodds.com (Amateur
 * plan is perpetually free).
 *
 * Confirmed from sportsgameodds.com/docs (2026-07):
 *   Base URL:    https://api.sportsgameodds.com/v2
 *   Auth header: X-Api-Key  (or ?apiKey= query param)
 *   GET /events: params leagueID, oddsAvailable, eventID
 *   Response:    { success, data: Event[], nextCursor }
 *   Odds are keyed by oddID on event.odds; player props carry a playerID.
 * Response shapes are mapped defensively and each tool returns a `raw`
 * sample so the true upstream shape is visible for later refinement.
 */


const BASE_URL = 'https://api.sportsgameodds.com/v2';

const tools: McpToolExport['tools'] = [
  {
    name: 'sgo_events',
    description:
      'List upcoming <league> games with odds. Returns scheduled events for a league (NFL, NBA, MLB, NHL, EPL, etc.) with team names, start time, status, and eventIDs to fetch full odds. Example: sgo_events({ leagueID: "NFL", _apiKey: "your-key" })',
    inputSchema: {
      type: 'object',
      properties: {
        leagueID: {
          type: 'string',
          description:
            'League identifier, e.g. "NFL", "NBA", "MLB", "NHL", "EPL", "BUNDESLIGA". Comma-separate for multiple.',
        },
        oddsAvailable: {
          type: 'boolean',
          description:
            'Only return events that currently have odds available. Defaults to true.',
        },
        _apiKey: {
          type: 'string',
          description:
            'Sports Game Odds API key (get one free at sportsgameodds.com — Amateur plan).',
        },
      },
      required: ['leagueID', '_apiKey'],
    },
  },
  {
    name: 'sgo_event_odds',
    description:
      'Get all odds & player props for a specific game. Returns moneyline, spread, and total markets plus player props for a single event, with prices across sportsbooks. Look up the eventID first via sgo_events. Example: sgo_event_odds({ eventID: "abc123", _apiKey: "your-key" })',
    inputSchema: {
      type: 'object',
      properties: {
        eventID: {
          type: 'string',
          description: 'Event identifier, from sgo_events (event.eventID).',
        },
        _apiKey: {
          type: 'string',
          description:
            'Sports Game Odds API key (get one free at sportsgameodds.com — Amateur plan).',
        },
      },
      required: ['eventID', '_apiKey'],
    },
  },
];

// ---- Upstream response shapes (confirmed loosely from docs; kept optional) ----

interface SgoTeam {
  teamID?: string;
  statEntityID?: string;
  names?: { long?: string; medium?: string; short?: string };
}

interface SgoOdd {
  oddID?: string;
  opposingOddID?: string;
  marketName?: string;
  statID?: string;
  statEntityID?: string;
  periodID?: string;
  betTypeID?: string;
  sideID?: string;
  playerID?: string;
  bookOdds?: string;
  fairOdds?: string;
  bookSpread?: string;
  fairSpread?: string;
  bookOverUnder?: string;
  fairOverUnder?: string;
  byBookmaker?: Record<string, unknown>;
}

interface SgoPlayer {
  playerID?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  teamID?: string;
}

interface SgoEvent {
  eventID?: string;
  sportID?: string;
  leagueID?: string;
  type?: string;
  status?: {
    startsAt?: string;
    displayShort?: string;
    displayLong?: string;
    started?: boolean;
    completed?: boolean;
    cancelled?: boolean;
    ended?: boolean;
    live?: boolean;
    oddsAvailable?: boolean;
  };
  teams?: { home?: SgoTeam; away?: SgoTeam };
  players?: Record<string, SgoPlayer>;
  odds?: Record<string, SgoOdd>;
  [key: string]: unknown;
}

interface SgoResponse {
  success?: boolean;
  data?: SgoEvent[];
  nextCursor?: string | null;
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const apiKey = args._apiKey as string | undefined;
  delete args._apiKey;

  if (!apiKey) {
    throw new Error(
      'Sports Game Odds requires an API key. Pass your key via the `_apiKey` argument. Get a free key at sportsgameodds.com (Amateur plan — perpetually free).',
    );
  }

  switch (name) {
    case 'sgo_events':
      return listEvents(
        args.leagueID as string,
        args.oddsAvailable as boolean | undefined,
        apiKey,
      );
    case 'sgo_event_odds':
      return eventOdds(args.eventID as string, apiKey);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Shared GET helper — attaches the confirmed X-Api-Key auth header and maps
// the common failure modes to actionable messages.
async function sgoGet(
  path: string,
  params: URLSearchParams,
  apiKey: string,
  tool: string,
): Promise<SgoResponse> {
  const res = await fetch(`${BASE_URL}${path}?${params}`, {
    headers: { 'X-Api-Key': apiKey },
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `Sports Game Odds: auth failed (HTTP ${res.status}). Check your Sports Game Odds _apiKey — get a free one at sportsgameodds.com (Amateur plan).`,
    );
  }
  if (res.status === 429) {
    throw new Error(
      'Sports Game Odds: rate limited (HTTP 429). Your plan quota is exhausted — wait and retry, or upgrade your plan at sportsgameodds.com.',
    );
  }
  if (!res.ok) {
    throw new Error(`SportsGameOdds ${tool} error: HTTP ${res.status}`);
  }

  return (await res.json()) as SgoResponse;
}

function teamName(team: SgoTeam | undefined): string | undefined {
  return team?.names?.long ?? team?.names?.medium ?? team?.names?.short ?? team?.teamID;
}

function mapEventSummary(ev: SgoEvent) {
  return {
    eventID: ev.eventID,
    status: ev.status?.displayShort ?? ev.status?.displayLong,
    startsAt: ev.status?.startsAt,
    home: teamName(ev.teams?.home),
    away: teamName(ev.teams?.away),
    leagueID: ev.leagueID,
  };
}

async function listEvents(
  leagueID: string,
  oddsAvailable: boolean | undefined,
  apiKey: string,
) {
  if (!leagueID) {
    throw new Error(
      'Sports Game Odds sgo_events requires a leagueID (e.g. "NFL", "NBA", "MLB"). Pass via the `leagueID` argument.',
    );
  }

  const params = new URLSearchParams({ leagueID });
  // Default oddsAvailable=true unless the caller explicitly passes false.
  params.set('oddsAvailable', String(oddsAvailable === false ? false : true));

  const body = await sgoGet('/events', params, apiKey, 'sgo_events');
  const events = Array.isArray(body.data) ? body.data : [];

  return {
    leagueID,
    count: events.length,
    events: events.map(mapEventSummary),
    nextCursor: body.nextCursor ?? null,
    // First event verbatim so the true upstream shape stays inspectable.
    raw: events[0] ?? null,
  };
}

// Split the flat odds map into human-facing groups. Anything carrying a
// playerID is treated as a player prop; everything else is a game market
// (moneyline / spread / total, etc.).
function mapOdd(odd: SgoOdd, players: Record<string, SgoPlayer> | undefined) {
  const playerID = odd.playerID;
  const player = playerID ? players?.[playerID] : undefined;
  return {
    oddID: odd.oddID,
    marketName: odd.marketName,
    statID: odd.statID,
    betTypeID: odd.betTypeID,
    sideID: odd.sideID,
    playerID,
    player: player?.name,
    bookOdds: odd.bookOdds,
    fairOdds: odd.fairOdds,
    bookSpread: odd.bookSpread,
    bookOverUnder: odd.bookOverUnder,
    bookmakerCount: odd.byBookmaker ? Object.keys(odd.byBookmaker).length : undefined,
  };
}

async function eventOdds(eventID: string, apiKey: string) {
  if (!eventID) {
    throw new Error(
      'Sports Game Odds sgo_event_odds requires an eventID. Find it first via sgo_events (event.eventID).',
    );
  }

  const params = new URLSearchParams({ eventID });

  const body = await sgoGet('/events', params, apiKey, 'sgo_event_odds');
  const event = Array.isArray(body.data) ? body.data[0] : undefined;

  if (!event) {
    throw new Error(
      `Sports Game Odds returned no event for eventID "${eventID}". Verify the ID via sgo_events.`,
    );
  }

  const players = event.players;
  const oddsMap = event.odds ?? {};
  const allOdds = Object.values(oddsMap);

  const markets: ReturnType<typeof mapOdd>[] = [];
  const playerProps: ReturnType<typeof mapOdd>[] = [];
  for (const odd of allOdds) {
    const mapped = mapOdd(odd, players);
    if (odd.playerID) playerProps.push(mapped);
    else markets.push(mapped);
  }

  return {
    ...mapEventSummary(event),
    marketCount: markets.length,
    playerPropCount: playerProps.length,
    markets,
    playerProps,
    // The full event verbatim so the true odds shape stays inspectable.
    raw: event,
  };
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
