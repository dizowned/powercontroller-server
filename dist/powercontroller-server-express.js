"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const child_process_1 = require("child_process");
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const fs_1 = __importDefault(require("fs"));
const controller_list_json_1 = __importDefault(require("../config/controller-list.json"));
const app = (0, express_1.default)();
const PORT = 3000;
const controllers = controller_list_json_1.default;
/*
app.use(helmet.contentSecurityPolicy({
  directives: {
    connectSrc: ["'self'","'http://localhost:3000'","'http://localhost:4200'","'unsafe-inline'"],
    defaultSrc: ["'self'", "'http://localhost:3000/'", "'unsafe-inline'"],
    scriptSrc: ["'self'", "'http://localhost:3000'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "'http://localhost:3000'", "'unsafe-inline'"],
    "upgrade-insecure-requests": null,
  }
}));
*/
app.use((0, helmet_1.default)({
    contentSecurityPolicy: false,
}));
app.use((0, cors_1.default)({
    origin: ["http://localhost:4200", "http://localhost:3000"],
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: false,
}));
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});
app.use(express_1.default.json());
app.get("/channels/:controllerid", (req, res) => {
    const controllerid = parseInt(req.params.controllerid, 10);
    const controller = controllers.find((c) => c.id === controllerid);
    if (!controller) {
        return res.status(404).json({ error: "Controller not found" });
    }
    res.json(controller.channels);
});
app.get("/channelbyname/:controllerid/:channelName", (req, res) => {
    const controllerid = parseInt(req.params.controllerid, 10);
    const channelName = req.params.channelName;
    const controller = controllers.find((c) => c.id === controllerid);
    if (!controller) {
        return res.status(404).json({ error: "Controller not found" });
    }
    const channel = controller.channels.find((c) => c.name === channelName);
    if (!channel) {
        return res.status(404).json({ error: "Channel not found" });
    }
    res.json(channel);
});
app.post("/setchannelstate/:controllerid/:channelNumber/:state", (req, res) => {
    const controllerid = parseInt(req.params.controllerid, 10);
    const channelNumber = parseInt(req.params.channelNumber, 10);
    const state = req.params.state.toLowerCase() === "true";
    const controller = controllers.find((c) => c.id === controllerid);
    console.log(`Setting controller ${controllerid} channel ${channelNumber} to state ${state}`);
    if (!controller) {
        console.log(`Controller not found: ${controllerid}`);
        return res
            .status(404)
            .json({ error: "Controller not found", success: false });
    }
    const channel = controller.channels.find((c) => c.number === channelNumber);
    if (!channel) {
        return res
            .status(404)
            .json({ error: `Channel not found: ${channelNumber}`, success: false });
    }
    channel.state = state;
    (0, child_process_1.exec)(`./bin/setchannel.py ${controllerid} ${channelNumber} ${state}`, (err, stdout, stderr) => {
        if (err) {
            console.error(`Error executing script: ${err}`);
            return res
                .status(500)
                .json({ error: "Failed to set channel state", success: false });
        }
        console.log(`Script output: ${stdout}`);
        res
            .status(200)
            .json({ message: "Channel updated successfully", success: true });
    });
});
// Optional: POST /channels (to add new channels)
app.post("/addchannel", (req, res) => {
    const { name, url, channels } = req.body;
    if (!name || !url || !channels) {
        return res
            .status(400)
            .json({ error: "Controller Name, Url, Channel count are required" });
    }
    if (controllers.some((c) => c.name === name)) {
        return res
            .status(400)
            .json({ error: "Controller with this name already exists" });
    }
    if (!channels ||
        typeof channels !== "object" ||
        Object.keys(channels).length === 0) {
        return res
            .status(400)
            .json({
            error: "Channels must be a non-empty list of channels and names",
        });
    }
    const newController = {
        id: controllers.length + 1,
        name: name,
        url: url,
        channels: channels,
    };
    controllers.push(newController);
    fs_1.default.writeFileSync("../data/controller-list.json", JSON.stringify(controllers, null, 2));
    res.status(201).json(newController);
});
app.post("/deletechannel/:controllerid/:channelName", (req, res) => {
    const controllerid = parseInt(req.params.controllerid, 10);
    const channelName = req.params.channelName;
    const controller = controllers.find((c) => c.id === controllerid);
    if (!controller) {
        return res.status(404).json({ error: "Controller not found" });
    }
    if (!(channelName in controller.channels)) {
        return res.status(404).json({ error: "Channel not found" });
    }
    // Delete channel
    controller.channels = controller.channels.filter((c) => c.name !== channelName);
    // Save to file
    fs_1.default.writeFileSync("../data/controller-list.json", JSON.stringify(controllers, null, 2));
    res.json(controller);
});
app.post("/updatechannelname/:id/:channelName/:newName", (req, res) => {
    const id = parseInt(req.params.id, 10);
    const channelName = req.params.channelName;
    const newName = req.params.newName;
    const controller = controllers.find((c) => c.id === id);
    if (!controller) {
        return res.status(404).json({ error: "Controller not found" });
    }
    if (!(channelName in controller.channels)) {
        return res.status(404).json({ error: "Channel not found" });
    }
    // Update channel name
    const oldChannel = controller.channels.find((c) => c.name === channelName);
    controller.channels.push({
        name: newName,
        state: oldChannel.state,
        number: oldChannel.number,
    });
    controller.channels = controller.channels.filter((c) => c.name !== channelName);
    // Save to file
    fs_1.default.writeFileSync("../conf/controller-list.json", JSON.stringify(controllers, null, 2));
    res.json(controller);
});
// Endpoint: GET /channels
app.get("/controllers", (req, res) => {
    res.json(controllers);
});
// Endpoint: GET /name
app.get("/controllerbyname/:name", (req, res) => {
    const name = req.params.name;
    const controller = controllers.find((c) => c.name === name);
    if (!controller) {
        return res.status(404).json({ error: "Controller not found" });
    }
    res.json(controller);
});
app.get("/controller/:id", (req, res) => {
    const id = parseInt(req.params.id, 10);
    const controller = controllers.find((c) => c.id === id);
    if (!controller) {
        return res.status(404).json({ error: "Controller not found" });
    }
    res.json(controller);
});
app.post("/deletecontroller/:id", (req, res) => {
    const id = parseInt(req.params.id, 10);
    console.log(`Deleting controller with id: ${id}`);
    const index = controllers.findIndex((c) => c.id === id);
    if (index === -1) {
        return res.status(404).json({ error: "Controller not found", id: id });
    }
    controllers.splice(index, 1);
    fs_1.default.writeFileSync("../data/controller-list.json", JSON.stringify(controllers, null, 2));
    res.json({ message: "Controller deleted successfully" });
});
// Start server
app.listen(PORT, () => {
    console.log(`Application environment: ${app.get("env")}`);
    console.log(`Application variables: ${process.env}`);
    console.log(`Server running at http://localhost:${PORT}`);
});
