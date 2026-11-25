// The only bridge between the interface and the main process. The page cannot reach Node,
// the network or stored tokens directly; it can only call these functions.
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('analyzer', Object.freeze({
  profiles: Object.freeze({
    list: () => invoke('profiles:list'),
    save: (profile) => invoke('profiles:save', profile),
    remove: (id) => invoke('profiles:remove', id)
  }),
  session: Object.freeze({
    connect: (request) => invoke('session:connect', request),
    disconnect: () => invoke('session:disconnect'),
    courses: () => invoke('session:courses'),
    read: (provider, operation, parameters) => invoke('session:read', provider, operation, parameters)
  }),
  analysis: Object.freeze({
    collect: (courseId, course) => invoke('analysis:collect', courseId, course),
    onProgress: (listener) => {
      const forward = (_event, progress) => listener(progress);
      ipcRenderer.on('analysis:progress', forward);
      return () => ipcRenderer.removeListener('analysis:progress', forward);
    }
  })
}));
