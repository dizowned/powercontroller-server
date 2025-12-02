import express, { Request, Response } from 'express';
import fs from 'fs';
import controller from './types/controller';
import controllerlist from '../conf/controller-list.json';

// server.js
const app = express();
const PORT = 3000;

// Example data
const serverName = "PowerController Store Server";
const controllers: controller[] = controllerlist as unknown as controller[];

// Middleware to parse JSON
app.use(express.json());

// Endpoint: GET /name
app.get('/name', (req: Request, res: Response) => {
  res.json({ name: serverName });
});

// Endpoint: GET /channels
app.get('/controllers', (req: Request, res: Response) => {
  res.json({ controllers });
});

app.get('/controller/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const controller = controllers.find(c => c.id === id);
  if (!controller) {
    return res.status(404).json({ error: "Controller not found" });
  }
  res.json(controller);
});

// Optional: POST /channels (to add new channels)
app.post('/controller', (req: Request, res: Response) => {
  const { name, url, channels } = req.body;
  if (!name && !url && !channels) {
    return res.status(400).json({ error: "Controller Name, Url, Channel count are required" });
  }
  if (controllerlist.some(c => c.name === name)) {
    return res.status(400).json({ error: "Controller with this name already exists" });
  }
  
  if (typeof channels !== 'object' || Object.keys(channels).length === 0) {
    return res.status(400).json({ error: "Channels must be a non-empty list of channels and names" });
  }
  const newController: controller = { id: controllers.length + 1, name: name, url: url, channels: channels };
  controllers.push(newController);
  fs.writeFileSync('controller-list.json', JSON.stringify(controllers, null, 2));
  res.status(201).json(newController);
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});