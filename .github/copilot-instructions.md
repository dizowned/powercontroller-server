# PowerController Server Guide for AI Agents

## Quick Context

This is an **Express.js REST API** (single-file server) that manages PowerController device metadata. It's paired with an Angular client (`../powercontroller-client/`) that displays the data.

## Architecture

**File-based persistence**: In-memory `controllers` array loaded from `data/controller-list.json` on startup. All mutations write back to JSON file using `fs.writeFileSync()`.

```
Server Routes:
GET  /controllers                              → All controllers
GET  /channels/:controllerid                   → Channels for a controller
GET  /channelbyname/:controllerid/:channelName → Single channel details
POST /addchannel                               → Add new controller
POST /deletechannel/:controllerid/:channelName → Remove channel
POST /updatechannelname/:id/:channelName/:newName → Rename channel
```

## Key Code Patterns

### Controller Model (src/types/controller.ts)
```typescript
interface PowerController {
  id: number;
  name: string;
  url: string;
  channels: channel[];  // Note: lowercase 'channel'
}

interface channel {
  name: string;
  state: boolean;
  number: number;
}
```

### CORS Configuration
Hardcoded to allow requests only from `http://localhost:4200` (the client):
```typescript
app.use(cors({
  origin: ['http://localhost:4200'],
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
}));
```

### Data Flow Example (GET /channels/:controllerid)
```typescript
const controller = controllers.find(c => c.id === controllerid);
if (!controller) return res.status(404).json({ error: "..." });
res.json(controller.channels);
```

Pattern: **Parse params → Find in array → Return or modify → Write to file if mutating**

## Development Workflow

```bash
npm run start   # ts-node: Runs TypeScript directly (development)
npm run build   # tsc: Compiles to JavaScript (production preparation)
npm test        # Currently runs: ts-node src/... (not actual tests—rename this!)
```

**Port**: 3000 (hardcoded)  
**Environment**: CommonJS (type: "commonjs" in package.json)

## Critical Integrations

1. **CORS with Client**: If client URL changes from `localhost:4200`, update the CORS origin array
2. **Data File Path**: `data/controller-list.json` must exist and be valid JSON
3. **Type Sync**: `channel` interface here must match client's model (`powercontroller-client/src/app/models/channel.ts`)

## Common Modifications

### Adding a New Endpoint
1. Follow the pattern: parse query/body → validate → lookup in `controllers` array → respond
2. For mutations: Update in-memory array, then `fs.writeFileSync(...)`
3. Always return 404 if controller/channel not found

### Renaming/Restructuring Data
- Update both `data/controller-list.json` AND `conf/controller-list.json` (conf may be a template/backup)
- Corresponding model changes in client's `models/channel.ts` and `models/powercontroller.ts`
- Update TypeScript interface in `src/types/controller.ts`

## Known Limitations

- **No database**: File writes are synchronous and not transactional
- **No validation**: POST bodies assume correct structure; no schema validation
- **No tests**: `npm test` is mislabeled (runs the server, not actual tests)
- **No authentication**: All endpoints are public
- **Case sensitivity**: Controller/channel lookups are case-sensitive
