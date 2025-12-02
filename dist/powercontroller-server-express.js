"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const fs_1 = __importDefault(require("fs"));
const controller_list_json_1 = __importDefault(require("../conf/controller-list.json"));
// server.js
const app = (0, express_1.default)();
const PORT = 3000;
// Example data
const serverName = "PowerController Store Server";
const controllers = controller_list_json_1.default;
// Middleware to parse JSON
app.use(express_1.default.json());
// Endpoint: GET /name
app.get('/name', (req, res) => {
    res.json({ name: serverName });
});
// Endpoint: GET /channels
app.get('/controllers', (req, res) => {
    res.json({ controllers });
});
app.get('/controller/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const controller = controllers.find(c => c.id === id);
    if (!controller) {
        return res.status(404).json({ error: "Controller not found" });
    }
    res.json(controller);
});
// Optional: POST /channels (to add new channels)
app.post('/controller', (req, res) => {
    const { name, url, channels } = req.body;
    if (!name && !url && !channels) {
        return res.status(400).json({ error: "Controller Name, Url, Channel count are required" });
    }
    if (controller_list_json_1.default.some(c => c.name === name)) {
        return res.status(400).json({ error: "Controller with this name already exists" });
    }
    if (typeof channels !== 'object' || Object.keys(channels).length === 0) {
        return res.status(400).json({ error: "Channels must be a non-empty list of channels and names" });
    }
    const newController = { id: controllers.length + 1, name: name, url: url, channels: channels };
    controllers.push(newController);
    fs_1.default.writeFileSync('controller-list.json', JSON.stringify(controllers, null, 2));
    res.status(201).json(newController);
});
// Start server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
