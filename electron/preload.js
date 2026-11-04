"use strict";

const { contextBridge } = require("electron");

// Tiny, explicit bridge: the renderer only learns it runs inside the desktop app.
contextBridge.exposeInMainWorld("desktop", {
  isDesktop: true,
  platform: process.platform,
});
