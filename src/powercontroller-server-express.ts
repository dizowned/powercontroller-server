import express, { Request, Response } from 'express';
import fs from 'fs';
import cors from 'cors';
import controllerlist from '../data/controller-list.json';
import PowerController from './types/controller';

const app = express();
const PORT = 3000;
const controllers: PowerController[] = controllerlist as PowerController[];

app.use(express.json());
app.use(cors({
  origin: ['http://localhost:4200'],
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true, // Allow cookies and authentication headers
}));

app.get('/channels/:controllerid', (req: Request, res: Response) => {
  const controllerid = parseInt(req.params.controllerid, 10);
  const controller = controllers.find(c => c.id === controllerid);
  if (!controller) {
    return res.status(404).json({ error: "Controller not found" });
  }
  res.json(controller.channels);
});

app.get('/channelbyname/:controllerid/:channelName', (req: Request, res: Response) => {
  const controllerid = parseInt(req.params.controllerid, 10);
  const channelName = req.params.channelName;
  const controller = controllers.find(c => c.id === controllerid);
  if (!controller) {
    return res.status(404).json({ error: "Controller not found" });
  }
  const channel = controller.channels.find(c => c.name === channelName);
  if (!channel) {
    return res.status(404).json({ error: "Channel not found" });
  }
  res.json(channel);
}); 

// Optional: POST /channels (to add new channels)
app.post('/addchannel', (req: Request, res: Response) => {
  const { name, url, channels } = req.body;
  if (!name || !url || !channels) {
    return res.status(400).json({ error: "Controller Name, Url, Channel count are required" });
  }
  if (controllerlist.some(c => c.name === name)) {
    return res.status(400).json({ error: "Controller with this name already exists" });
  }
  
  if (!channels || typeof channels !== 'object' || Object.keys(channels).length === 0) {
    return res.status(400).json({ error: "Channels must be a non-empty list of channels and names" });
  }
  const newController: PowerController = { id: controllers.length + 1, name: name, url: url, channels: channels };
  controllers.push(newController);
  fs.writeFileSync('../data/controller-list.json', JSON.stringify(controllers, null, 2));
  res.status(201).json(newController);
});

app.post('/deletechannel/:controllerid/:channelName', (req: Request, res: Response) => {
  const controllerid = parseInt(req.params.controllerid, 10);
  const channelName = req.params.channelName;
  const controller = controllers.find(c => c.id === controllerid);  
  if (!controller) {
    return res.status(404).json({ error: "Controller not found" });
  }

  if (!(channelName in controller.channels)) {
    return res.status(404).json({ error: "Channel not found" });
  }
  // Delete channel
  controller.channels = controller.channels.filter(c => c.name !== channelName);
  // Save to file
  fs.writeFileSync('../data/controller-list.json', JSON.stringify(controllers, null, 2));
  res.json(controller);
});

app.post('/updatechannelname/:id/:channelName/:newName', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const channelName = req.params.channelName;
  const newName = req.params.newName;
  const controller = controllers.find(c => c.id === id);

  if (!controller) {
    return res.status(404).json({ error: "Controller not found" });
  }

  if (!(channelName in controller.channels)) {
    return res.status(404).json({ error: "Channel not found" });
  }
  // Update channel name
  const oldChannel = controller.channels.find(c => c.name === channelName);
  controller.channels.push({ name: newName, state: oldChannel!.state, channelNo: oldChannel!.channelNo });
  controller.channels = controller.channels.filter(c => c.name !== channelName);
  // Save to file
  fs.writeFileSync('../conf/controller-list.json', JSON.stringify(controllers, null, 2));
  res.json(controller);
});

// Endpoint: GET /channels
app.get('/controllers', (req: Request, res: Response) => {
  res.json({ controllers });
});

// Endpoint: GET /name
app.get('/controllerbyname/:name', (req: Request, res: Response) => {
  const name = req.params.name;
  const controller = controllers.find(c => c.name === name);
  if (!controller) {
    return res.status(404).json({ error: "Controller not found" });
  }
  res.json(controller);
});

app.get('/controller/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const controller = controllers.find(c => c.id === id);
  if (!controller) {
    return res.status(404).json({ error: "Controller not found" });
  }
  res.json(controller);
});

app.post('/deletecontroller/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  console.log(`Deleting controller with id: ${id}`);
  const index = controllers.findIndex(c => c.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Controller not found", id: id });
  }
  controllers.splice(index, 1);
  fs.writeFileSync('../data/controller-list.json', JSON.stringify(controllers, null, 2));
  res.json({ message: "Controller deleted successfully" });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});