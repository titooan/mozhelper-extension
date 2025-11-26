// web-ext relies on diagnostics_channel.tracingChannel in newer Node releases.
// Some environments (like Node 18.17) don't expose it, which crashes web-ext.
try {
  const diagnosticsChannel = require("diagnostics_channel");
  if (typeof diagnosticsChannel.tracingChannel !== "function") {
    diagnosticsChannel.tracingChannel = (name) => diagnosticsChannel.channel?.(name) ?? {
      publish() {},
      subscribe() {},
      unsubscribe() {}
    };
  }
} catch (error) {
  // If diagnostics_channel isn't available, we simply noop.
}

try {
  if (typeof globalThis.File === "undefined") {
    const { File } = require("undici");
    if (File) {
      globalThis.File = File;
    }
  }
} catch (error) {
  // Ignore if undici isn't available; newer Node versions already provide File.
}
