import { GROUP_COLOR } from "./spider-draw";
import { SPIDERS, type SpiderKind, type SpiderSettings } from "./spider-sim";
import { Stage } from "./stage";

const UNITS: Partial<Record<keyof SpiderSettings, string>> = {
  stepTime: " s",
  speed: " /s",
  turnRateDeg: "°/s",
};

const canvas = document.querySelector<HTMLCanvasElement>("#tank");
if (canvas) {
  let kind: SpiderKind = "small";
  const settings: SpiderSettings = { ...SPIDERS[kind] };
  const hud = [...(document.getElementById("hud")?.children ?? [])];
  const stage = new Stage(canvas, [settings], "canvas", hud);
  stage.skeleton = true;
  const boilAmount = stage.boil.amount;

  const sliders = [...document.querySelectorAll<HTMLInputElement>("input[type=range][data-key]")];
  const keyOf = (s: HTMLInputElement) => s.dataset.key as keyof SpiderSettings;
  const show = (s: HTMLInputElement) => {
    const out = s.parentElement?.querySelector("output");
    if (out) out.textContent = `${settings[keyOf(s)]}${UNITS[keyOf(s)] ?? ""}`;
  };
  const sync = () =>
    sliders.forEach((s) => {
      s.value = String(settings[keyOf(s)]);
      show(s);
    });
  for (const s of sliders) {
    s.addEventListener("input", () => {
      settings[keyOf(s)] = Number(s.value);
      show(s);
      stage.setSettings(settings);
    });
  }
  document.getElementById("skeleton")?.addEventListener("change", (e) => {
    stage.skeleton = (e.target as HTMLInputElement).checked;
  });
  document.getElementById("boil")?.addEventListener("change", (e) => {
    stage.boil.amount = (e.target as HTMLInputElement).checked ? boilAmount || 0.9 : 0;
  });
  const load = () => {
    Object.assign(settings, SPIDERS[kind]);
    stage.setSettings(settings);
    sync();
  };
  document.getElementById("reset")?.addEventListener("click", load);
  for (const radio of document.querySelectorAll<HTMLInputElement>("input[name=kind]")) {
    radio.addEventListener("change", () => {
      kind = radio.value as SpiderKind;
      load();
    });
  }
  const panel = document.getElementById("panel") as HTMLDetailsElement | null;
  if (panel && matchMedia("(max-width: 600px)").matches) panel.open = false;
  sync();

  const stats = document.getElementById("stats")!;
  let next = 0;
  stage.onFrame = (time) => {
    if (time < next || !stage.view) return;
    next = time + 0.15;
    const legs = stage.view.legs;
    const swinging = legs.filter((l) => l.swinging);
    const group = swinging[0]?.group;
    const stretched = legs.filter((l) => l.stretched).length;
    const rows: [string, string, string?][] = [
      ["speed", `${stage.view.speed.toFixed(0)} /s`],
      ["legs swinging", `${swinging.length} / 8`],
      ["group", group === undefined ? "all planted" : `group ${group}`, group === undefined ? undefined : GROUP_COLOR[group]],
      ["stretched legs", String(stretched), stretched ? "#e0533d" : undefined],
      ["target", stage.aim],
    ];
    stats.replaceChildren(
      ...rows.flatMap(([label, value, color]) => {
        const dt = document.createElement("dt");
        dt.textContent = label;
        const dd = document.createElement("dd");
        if (color) {
          const swatch = document.createElement("span");
          swatch.className = "swatch";
          swatch.style.background = color;
          dd.append(swatch);
        }
        dd.append(value);
        return [dt, dd];
      }),
    );
  };
  stage.start();
}
