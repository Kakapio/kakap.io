import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";

const simDir = fileURLToPath(new URL("./sim", import.meta.url));
const gleamOut = fileURLToPath(new URL("./sim/build/dev/javascript", import.meta.url));

function buildSim() {
  execFileSync("gleam", ["build", "--target", "javascript"], { cwd: simDir, stdio: "inherit" });
}

/** Compile the Gleam sim once before Vite resolves imports, and again when a .gleam file changes. */
function gleamSim() {
  let built = false;
  return {
    name: "gleam-sim",
    buildStart() {
      if (built) return;
      buildSim();
      built = true;
    },
    configureServer(server) {
      server.watcher.add(`${simDir}/src`);
      const rebuild = (file) => {
        if (!file.endsWith(".gleam")) return;
        try {
          buildSim();
          server.ws.send({ type: "full-reload" });
        } catch {
          // gleam already printed the compile error to the terminal
        }
      };
      server.watcher.on("change", rebuild);
      server.watcher.on("add", rebuild);
    },
  };
}

export default defineConfig({
  site: "https://kakap.io",
  vite: {
    plugins: [gleamSim()],
    resolve: { alias: { "@gleam": gleamOut } },
  },
});
