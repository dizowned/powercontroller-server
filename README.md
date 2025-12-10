# PowerController Server

A lightweight Express.js REST API for managing PowerController device metadata and channel configurations. This server provides a centralized interface for tracking multiple power controller devices, their endpoints, and individual channel states.

## Overview

PowerController Server is a file-based REST API that maintains an in-memory registry of power controller devices and their associated channels. It enables clients to query, add, update, and delete controllers and their channels through a simple HTTP interface.

**Key Features:**
- File-based JSON persistence (`data/controller-list.json`)
- RESTful API with CORS support for Angular client integration
- Full CRUD operations for controllers and channels
- Channel-level management (add, delete, rename, query by name)
- TypeScript type safety with defined interfaces

## Architecture

### Data Model

**PowerController:**
```typescript
{
  id: number;
  name: string;
  url: string;
  channels: channel[];
}
```

**Channel:**
```typescript
{
  name: string;
  state: boolean;
  number: number;
}
```

### Technology Stack

- **Runtime:** Node.js with TypeScript
- **Framework:** Express.js
- **CORS:** Configured for `http://localhost:4200` (Angular client)
- **Persistence:** JSON file storage
- **Type System:** TypeScript with strict typing

## API Endpoints

### Controllers

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/controllers` | List all controllers |
| `GET` | `/controller/:id` | Get controller by ID |
| `GET` | `/controllerbyname/:name` | Get controller by name |
| `POST` | `/addchannel` | Add a new controller |
| `POST` | `/deletecontroller/:id` | Delete a controller |

### Channels

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/channels/:controllerid` | Get all channels for a controller |
| `GET` | `/channelbyname/:controllerid/:channelName` | Get specific channel details |
| `POST` | `/deletechannel/:controllerid/:channelName` | Remove a channel |
| `POST` | `/updatechannelname/:id/:channelName/:newName` | Rename a channel |

## Getting Started

### Prerequisites

- Node.js (v14 or higher recommended)
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/dizowned/powercontroller-server.git
cd powercontroller-server

# Install dependencies
npm install
```

### Running the Server

```bash
# Development mode (runs TypeScript directly)
npm start

# Build for production
npm run build
```

The server runs on **port 3000** by default.

### Configuration

#### CORS Settings
Update the CORS origin in `src/powercontroller-server-express.ts` if your client runs on a different port:
```typescript
app.use(cors({
  origin: ['http://localhost:4200'],  // Change this to your client URL
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
}));
```

#### Data Storage
- **Runtime data:** `data/controller-list.json`
- **Template/backup:** `conf/controller-list.json`

Ensure `data/controller-list.json` exists and contains valid JSON before starting the server.

## Project Structure

```
powercontroller-server/
├── conf/
│   └── controller-list.json       # Template configuration
├── data/
│   └── controller-list.json       # Active data store
├── src/
│   ├── types/
│   │   └── controller.ts          # TypeScript interfaces
│   └── powercontroller-server-express.ts  # Main server file
├── package.json
└── tsconfig.json
```

## Integration

This server is designed to work with the **powercontroller-client** Angular application. The client consumes this API to display and manage power controller configurations in a web interface.

## Development Notes

- All data mutations write synchronously to `data/controller-list.json`
- No authentication/authorization implemented (endpoints are public)
- No input validation beyond basic null checks
- The `npm test` script currently runs the server (not actual tests)

## Known Limitations

- **No database:** File-based storage is not transactional
- **No schema validation:** POST bodies assume correct structure
- **Case-sensitive lookups:** Controller and channel names are case-sensitive
- **Synchronous file I/O:** May block on large datasets

## License

GPL (GNU General Public License)

## Author

Brian Rice

## Links

- **GitHub:** https://github.com/dizowned/powercontroller-server
- **Issues:** https://github.com/dizowned/powercontroller-server/issues
