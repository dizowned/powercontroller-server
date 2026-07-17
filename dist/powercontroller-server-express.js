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
const path_1 = __importDefault(require("path"));
const controller_list_json_1 = __importDefault(require("../config/controller-list.json"));
const app = (0, express_1.default)();
const PORT = 3000;
const controllers = controller_list_json_1.default;
const DATA_FILE_PATH = path_1.default.join(process.cwd(), "data", "controller-list.json");
const ALLOWED_POLL_INTERVALS_MS = [
    1000,
    2000,
    5000,
    10000,
    30000,
    60000,
    300000,
    900000,
    1800000,
    3600000,
];
const MIN_CHANNEL_POLL_INTERVAL_MS = ALLOWED_POLL_INTERVALS_MS[0];
const MAX_CHANNEL_POLL_INTERVAL_MS = ALLOWED_POLL_INTERVALS_MS[ALLOWED_POLL_INTERVALS_MS.length - 1];
const ENV_DEFAULT_POLL_INTERVAL_MS = Number.parseInt(process.env.DEFAULT_CHANNEL_POLL_INTERVAL_MS ?? "30000", 10);
const DEFAULT_CHANNEL_POLL_INTERVAL_MS = ALLOWED_POLL_INTERVALS_MS.includes(ENV_DEFAULT_POLL_INTERVAL_MS)
    ? ENV_DEFAULT_POLL_INTERVAL_MS
    : 30000;
const pollTimers = new Map();
const pollQueues = new Map();
const pollStatuses = new Map();
const getChannelKey = (controllerid, channelNumber) => `${controllerid}:${channelNumber}`;
const isAllowedPollingInterval = (pollIntervalMs) => ALLOWED_POLL_INTERVALS_MS.includes(pollIntervalMs);
const getChannelPollStatus = (controllerid, channelNumber) => pollStatuses.get(getChannelKey(controllerid, channelNumber)) ?? {
    lastPolledAt: null,
    lastPollStartedAt: null,
    lastPollError: null,
};
const normalizePollingIntervalMs = (pollIntervalMs) => {
    const parsedPollIntervalMs = typeof pollIntervalMs === "number" ? pollIntervalMs : Number.NaN;
    if (!Number.isFinite(parsedPollIntervalMs) || !isAllowedPollingInterval(parsedPollIntervalMs)) {
        return DEFAULT_CHANNEL_POLL_INTERVAL_MS;
    }
    return parsedPollIntervalMs;
};
const persistControllers = () => {
    fs_1.default.writeFileSync(DATA_FILE_PATH, JSON.stringify(controllers, null, 2));
};
const enqueuePollEvent = (controllerid, channelNumber, task) => {
    const channelKey = getChannelKey(controllerid, channelNumber);
    const previousTask = pollQueues.get(channelKey) ?? Promise.resolve();
    const nextTask = previousTask
        .catch(() => undefined)
        .then(async () => {
        await task();
    });
    pollQueues.set(channelKey, nextTask);
    nextTask.finally(() => {
        if (pollQueues.get(channelKey) === nextTask) {
            pollQueues.delete(channelKey);
        }
    });
};
const executeChannelPoll = async (controller, channelNumber) => {
    const channelKey = getChannelKey(controller.id, channelNumber);
    const pollStatus = getChannelPollStatus(controller.id, channelNumber);
    pollStatus.lastPollStartedAt = new Date().toISOString();
    pollStatus.lastPollError = null;
    pollStatuses.set(channelKey, pollStatus);
    const controllerStillExists = controllers.find((c) => c.id === controller.id);
    const channelStillExists = controllerStillExists?.channels.find((c) => c.number === channelNumber);
    if (!controllerStillExists || !channelStillExists) {
        throw new Error("Controller or channel no longer exists");
    }
    const persistedControllerData = JSON.parse(fs_1.default.readFileSync(DATA_FILE_PATH, "utf8"));
    const persistedController = persistedControllerData.find((c) => c.id === controller.id);
    const persistedChannel = persistedController?.channels.find((c) => c.number === channelNumber);
    if (persistedChannel && typeof persistedChannel.state === "boolean") {
        channelStillExists.state = persistedChannel.state;
    }
    pollStatus.lastPolledAt = new Date().toISOString();
    pollStatuses.set(channelKey, pollStatus);
};
const queueChannelPoll = (controller, channelNumber) => {
    enqueuePollEvent(controller.id, channelNumber, async () => {
        try {
            await executeChannelPoll(controller, channelNumber);
        }
        catch (error) {
            const pollStatus = getChannelPollStatus(controller.id, channelNumber);
            pollStatus.lastPollError =
                error instanceof Error ? error.message : "Unknown poll failure";
            pollStatuses.set(getChannelKey(controller.id, channelNumber), pollStatus);
        }
    });
};
const stopPollingChannel = (controllerid, channelNumber) => {
    const channelKey = getChannelKey(controllerid, channelNumber);
    const timer = pollTimers.get(channelKey);
    if (timer) {
        clearInterval(timer);
        pollTimers.delete(channelKey);
    }
    pollQueues.delete(channelKey);
    pollStatuses.delete(channelKey);
};
const startPollingChannel = (controller, channelNumber, pollIntervalMs) => {
    stopPollingChannel(controller.id, channelNumber);
    const effectiveIntervalMs = normalizePollingIntervalMs(pollIntervalMs);
    const timer = setInterval(() => {
        queueChannelPoll(controller, channelNumber);
    }, effectiveIntervalMs);
    pollTimers.set(getChannelKey(controller.id, channelNumber), timer);
};
const initializeAndNormalizePolling = () => {
    let shouldPersist = false;
    controllers.forEach((controller) => {
        controller.channels.forEach((channel) => {
            const normalizedInterval = normalizePollingIntervalMs(channel.pollIntervalMs);
            if (channel.pollIntervalMs !== normalizedInterval) {
                channel.pollIntervalMs = normalizedInterval;
                shouldPersist = true;
            }
            startPollingChannel(controller, channel.number, normalizedInterval);
        });
    });
    if (shouldPersist) {
        persistControllers();
    }
};
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
app.get("/channelpolling/:controllerid/:channelNumber", (req, res) => {
    const controllerid = parseInt(req.params.controllerid, 10);
    const channelNumber = parseInt(req.params.channelNumber, 10);
    const controller = controllers.find((c) => c.id === controllerid);
    if (!controller) {
        return res.status(404).json({ error: "Controller not found" });
    }
    const channel = controller.channels.find((c) => c.number === channelNumber);
    if (!channel) {
        return res.status(404).json({ error: "Channel not found" });
    }
    const channelKey = getChannelKey(controllerid, channelNumber);
    return res.json({
        controllerid,
        channelNumber,
        pollIntervalMs: normalizePollingIntervalMs(channel.pollIntervalMs),
        queuePending: pollQueues.has(channelKey),
        ...getChannelPollStatus(controllerid, channelNumber),
    });
});
app.post("/channelpollinginterval/:controllerid/:channelNumber/:pollIntervalMs", (req, res) => {
    const controllerid = parseInt(req.params.controllerid, 10);
    const channelNumber = parseInt(req.params.channelNumber, 10);
    const pollIntervalMsParam = parseInt(req.params.pollIntervalMs, 10);
    if (!Number.isFinite(pollIntervalMsParam) ||
        !isAllowedPollingInterval(pollIntervalMsParam)) {
        return res.status(400).json({
            error: `Invalid polling interval: must be one of [${ALLOWED_POLL_INTERVALS_MS.join(", ")}]`,
        });
    }
    const controller = controllers.find((c) => c.id === controllerid);
    if (!controller) {
        return res.status(404).json({ error: "Controller not found" });
    }
    const channel = controller.channels.find((c) => c.number === channelNumber);
    if (!channel) {
        return res.status(404).json({ error: "Channel not found" });
    }
    const normalizedPollingIntervalMs = normalizePollingIntervalMs(pollIntervalMsParam);
    channel.pollIntervalMs = normalizedPollingIntervalMs;
    startPollingChannel(controller, channel.number, channel.pollIntervalMs);
    persistControllers();
    return res.status(200).json({
        message: "Channel polling interval updated",
        controllerid,
        channelNumber,
        pollIntervalMs: normalizedPollingIntervalMs,
    });
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
        !Array.isArray(channels) ||
        channels.length === 0) {
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
        channels: channels.map((newChannel) => ({
            ...newChannel,
            pollIntervalMs: normalizePollingIntervalMs(newChannel.pollIntervalMs),
        })),
    };
    controllers.push(newController);
    newController.channels.forEach((channel) => {
        startPollingChannel(newController, channel.number, channel.pollIntervalMs);
    });
    persistControllers();
    res.status(201).json(newController);
});
app.post("/deletechannel/:controllerid/:channelName", (req, res) => {
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
    // Delete channel
    controller.channels = controller.channels.filter((c) => c.name !== channelName);
    if (channel) {
        stopPollingChannel(controller.id, channel.number);
    }
    persistControllers();
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
    const oldChannel = controller.channels.find((c) => c.name === channelName);
    if (!oldChannel) {
        return res.status(404).json({ error: "Channel not found" });
    }
    // Update channel name
    controller.channels.push({
        name: newName,
        state: oldChannel.state,
        number: oldChannel.number,
    });
    controller.channels = controller.channels.filter((c) => c.name !== channelName);
    persistControllers();
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
    controllers[index].channels.forEach((channel) => {
        stopPollingChannel(id, channel.number);
    });
    controllers.splice(index, 1);
    persistControllers();
    res.json({ message: "Controller deleted successfully" });
});
// Start server
initializeAndNormalizePolling();
app.listen(PORT, () => {
    console.log(`Application environment: ${app.get("env")}`);
    console.log(`Application variables: ${process.env}`);
    console.log(`Server running at http://localhost:${PORT}`);
});
