// Intentionally empty: the portal runs exactly as in a browser and gets no access to the computer.
// It only learns that it is inside the desktop app, to hide the browser-only "install" hints.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('nibrasDesktop', { isDesktop: true });
