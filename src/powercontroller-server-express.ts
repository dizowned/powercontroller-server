import express, { Request, Response } from "express";
import { exec } from "child_process";
import helmet from "helmet";
import cors from "cors";
import fs from "fs";
import http from "http";
import https from "https";
import path from "path";
import controllerlist from "../config/controller-list.json";
import PowerController from "./types/controller";

const app = express();
const PORT = 3000;
const controllers: PowerController[] = controllerlist as PowerController[];
const DATA_FILE_PATH = path.join(process.cwd(), "data", "controller-list.json");
const MIN_CHANNEL_POLL_INTERVAL_MS = 1000;
const MAX_CHANNEL_POLL_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_CHANNEL_POLL_INTERVAL_MS = Math.min(
  Math.max(
    Number.parseInt(process.env.DEFAULT_CHANNEL_POLL_INTERVAL_MS ?? "30000", 10),
    MIN_CHANNEL_POLL_INTERVAL_MS
  ),
  MAX_CHANNEL_POLL_INTERVAL_MS
);

type PollStatus = {
  lastPolledAt: string | null;
  lastPollStartedAt: string | null;
  lastPollError: string | null;
};

const pollTimers = new Map<string, NodeJS.Timeout>();
const pollQueues = new Map<string, Promise<void>>();
const pollStatuses = new Map<string, PollStatus>();

const getChannelKey = (controllerid: number, channelNumber: number): string =>
  `${controllerid}:${channelNumber}`;

const getChannelPollStatus = (
  controllerid: number,
  channelNumber: number
): PollStatus =>
  pollStatuses.get(getChannelKey(controllerid, channelNumber)) ?? {
    lastPolledAt: null,
    lastPollStartedAt: null,
    lastPollError: null,
  };

const normalizePollingIntervalMs = (pollIntervalMs?: number): number => {
  if (!Number.isFinite(pollIntervalMs)) {
    return DEFAULT_CHANNEL_POLL_INTERVAL_MS;
  }
  return Math.min(
    Math.max(Math.floor(pollIntervalMs), MIN_CHANNEL_POLL_INTERVAL_MS),
    MAX_CHANNEL_POLL_INTERVAL_MS
  );
};

const persistControllers = (): void => {
  fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(controllers, null, 2));
};

const enqueuePollEvent = (
  controllerid: number,
  channelNumber: number,
  task: () => Promise<void>
): void => {
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

const pollRemoteChannelState = (
  controllerUrl: string,
  channelNumber: number
): Promise<boolean> =>
  new Promise((resolve, reject) => {
    const targetUrl = new URL(`/channel/${channelNumber}`, controllerUrl);
    const requestClient = targetUrl.protocol === "https:" ? https : http;
    const request = requestClient.request(targetUrl, { method: "GET" }, (res) => {
      const statusCode = res.statusCode ?? 500;
      if (statusCode < 200 || statusCode >= 300) {
        res.resume();
        reject(new Error(`Polling request failed with status ${statusCode}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        try {
          const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if (!payload || typeof payload.state !== "boolean") {
            reject(new Error("Polling response did not include a boolean state"));
            return;
          }
          resolve(payload.state);
        } catch {
          reject(new Error("Polling response was not valid JSON"));
        }
      });
    });
    request.setTimeout(5000, () => {
      request.destroy(new Error("Polling request timed out"));
    });
    request.on("error", reject);
    request.end();
  });

const executeChannelPoll = async (
  controller: PowerController,
  channelNumber: number
): Promise<void> => {
  const channelKey = getChannelKey(controller.id, channelNumber);
  const pollStatus = getChannelPollStatus(controller.id, channelNumber);
  pollStatus.lastPollStartedAt = new Date().toISOString();
  pollStatus.lastPollError = null;
  pollStatuses.set(channelKey, pollStatus);
  const controllerStillExists = controllers.find((c) => c.id === controller.id);
  const channelStillExists = controllerStillExists?.channels.find(
    (c) => c.number === channelNumber
  );
  if (!controllerStillExists || !channelStillExists) {
    throw new Error("Controller or channel no longer exists");
  }
  const remoteState = await pollRemoteChannelState(
    controllerStillExists.url,
    channelNumber
  );
  channelStillExists.state = remoteState;
  pollStatus.lastPolledAt = new Date().toISOString();
  pollStatuses.set(channelKey, pollStatus);
};

const queueChannelPoll = (
  controller: PowerController,
  channelNumber: number
): void => {
  enqueuePollEvent(controller.id, channelNumber, async () => {
    try {
      await executeChannelPoll(controller, channelNumber);
    } catch (error) {
      const pollStatus = getChannelPollStatus(controller.id, channelNumber);
      pollStatus.lastPollError =
        error instanceof Error ? error.message : "Unknown poll failure";
      pollStatuses.set(getChannelKey(controller.id, channelNumber), pollStatus);
    }
  });
};

const stopPollingChannel = (controllerid: number, channelNumber: number): void => {
  const channelKey = getChannelKey(controllerid, channelNumber);
  const timer = pollTimers.get(channelKey);
  if (timer) {
    clearInterval(timer);
    pollTimers.delete(channelKey);
  }
  pollQueues.delete(channelKey);
  pollStatuses.delete(channelKey);
};

const startPollingChannel = (
  controller: PowerController,
  channelNumber: number,
  pollIntervalMs?: number
): void => {
  stopPollingChannel(controller.id, channelNumber);
  const effectiveIntervalMs = normalizePollingIntervalMs(pollIntervalMs);
  const timer = setInterval(() => {
    queueChannelPoll(controller, channelNumber);
  }, effectiveIntervalMs);
  pollTimers.set(getChannelKey(controller.id, channelNumber), timer);
};

const initializeAndNormalizePolling = (): void => {
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

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

app.use(
  cors({
    origin: ["http://localhost:4200", "http://localhost:3000"],
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: false,
  })
);

app.use((req: Request, res: Response, next: express.NextFunction) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

app.use(express.json());

app.get("/channels/:controllerid", (req: Request, res: Response) => {
  const controllerid = parseInt(req.params.controllerid, 10);
  const controller = controllers.find((c) => c.id === controllerid);
  if (!controller) {
    return res.status(404).json({ error: "Controller not found" });
  }
  res.json(controller.channels);
});

app.get(
  "/channelpolling/:controllerid/:channelNumber",
  (req: Request, res: Response) => {
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
  }
);

app.post(
  "/channelpollinginterval/:controllerid/:channelNumber/:pollIntervalMs",
  (req: Request, res: Response) => {
    const controllerid = parseInt(req.params.controllerid, 10);
    const channelNumber = parseInt(req.params.channelNumber, 10);
    const pollIntervalMsParam = parseInt(req.params.pollIntervalMs, 10);
    if (
      !Number.isFinite(pollIntervalMsParam) ||
      pollIntervalMsParam < MIN_CHANNEL_POLL_INTERVAL_MS ||
      pollIntervalMsParam > MAX_CHANNEL_POLL_INTERVAL_MS
    ) {
      return res.status(400).json({
        error: `Invalid polling interval: must be between ${MIN_CHANNEL_POLL_INTERVAL_MS}ms and ${MAX_CHANNEL_POLL_INTERVAL_MS}ms`,
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
    const normalizedPollingIntervalMs =
      normalizePollingIntervalMs(pollIntervalMsParam);
    channel.pollIntervalMs = normalizedPollingIntervalMs;
    startPollingChannel(controller, channel.number, channel.pollIntervalMs);
    persistControllers();
    return res.status(200).json({
      message: "Channel polling interval updated",
      controllerid,
      channelNumber,
      pollIntervalMs: normalizedPollingIntervalMs,
    });
  }
);

app.get(
  "/channelbyname/:controllerid/:channelName",
  (req: Request, res: Response) => {
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
  }
);

app.post(
  "/setchannelstate/:controllerid/:channelNumber/:state",
  (req: Request, res: Response) => {
    const controllerid = parseInt(req.params.controllerid, 10);
    const channelNumber = parseInt(req.params.channelNumber, 10);
    const state = req.params.state.toLowerCase() === "true";
    const controller = controllers.find((c) => c.id === controllerid);
    console.log(
      `Setting controller ${controllerid} channel ${channelNumber} to state ${state}`
    );
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
    exec(
      `./bin/setchannel.py ${controllerid} ${channelNumber} ${state}`,
      (err, stdout, stderr) => {
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
      }
    );
  }
);

// Optional: POST /channels (to add new channels)
app.post("/addchannel", (req: Request, res: Response) => {
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

  if (
    !channels ||
    !Array.isArray(channels) ||
    channels.length === 0
  ) {
    return res
      .status(400)
      .json({
        error: "Channels must be a non-empty list of channels and names",
      });
  }
  const newController: PowerController = {
    id: controllers.length + 1,
    name: name,
    url: url,
    channels: channels.map((newChannel: PowerController["channels"][number]) => ({
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

app.post(
  "/deletechannel/:controllerid/:channelName",
  (req: Request, res: Response) => {
    const controllerid = parseInt(req.params.controllerid, 10);
    const channelName = req.params.channelName;
    const controller = controllers.find((c) => c.id === controllerid);
    if (!controller) {
      return res.status(404).json({ error: "Controller not found" });
    }

    if (!controller.channels.some((c) => c.name === channelName)) {
      return res.status(404).json({ error: "Channel not found" });
    }
    // Delete channel
    const channel = controller.channels.find((c) => c.name === channelName);
    controller.channels = controller.channels.filter(
      (c) => c.name !== channelName
    );
    if (channel) {
      stopPollingChannel(controller.id, channel.number);
    }
    persistControllers();
    res.json(controller);
  }
);

app.post(
  "/updatechannelname/:id/:channelName/:newName",
  (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    const channelName = req.params.channelName;
    const newName = req.params.newName;
    const controller = controllers.find((c) => c.id === id);

    if (!controller) {
      return res.status(404).json({ error: "Controller not found" });
    }

    if (!controller.channels.some((c) => c.name === channelName)) {
      return res.status(404).json({ error: "Channel not found" });
    }
    // Update channel name
    const oldChannel = controller.channels.find((c) => c.name === channelName);
    controller.channels.push({
      name: newName,
      state: oldChannel!.state,
      number: oldChannel!.number,
    });
    controller.channels = controller.channels.filter(
      (c) => c.name !== channelName
    );
    persistControllers();
    res.json(controller);
  }
);

// Endpoint: GET /channels
app.get("/controllers", (req: Request, res: Response) => {
  res.json(controllers);
});

// Endpoint: GET /name
app.get("/controllerbyname/:name", (req: Request, res: Response) => {
  const name = req.params.name;
  const controller = controllers.find((c) => c.name === name);
  if (!controller) {
    return res.status(404).json({ error: "Controller not found" });
  }
  res.json(controller);
});

app.get("/controller/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const controller = controllers.find((c) => c.id === id);
  if (!controller) {
    return res.status(404).json({ error: "Controller not found" });
  }
  res.json(controller);
});

app.post("/deletecontroller/:id", (req: Request, res: Response) => {
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
