// server.js
const express = require('express');
const fs = require('fs');
const controllerlist = require('./controller-list.json');
const app = express();
const PORT = 3000;

// Example data
const serverName = "PowerController Store Server";
const channels = controllerlist;

// Middleware to parse JSON
app.use(express.json());

// Endpoint: GET /name
app.get('/name', (req, res) => {
  res.json({ name: serverName });
});

// Endpoint: GET /channels
app.get('/channels', (req, res) => {
  res.json({ channels });
});

// Optional: POST /channels (to add new channels)
app.post('/channels', (req, res) => {
  const { name, url } = req.body;
  if (!name && !url) {
    return res.status(400).json({ error: "Controller Name and Url are required" });
  }
  const newChannel = { id: channels.length + 1, name: name, url: url };
  controllerlist.push(newChannel);
  fs.writeFileSync('controller-list.json', JSON.stringify(controllerlist, null, 2));
  res.status(201).json(newChannel);
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});