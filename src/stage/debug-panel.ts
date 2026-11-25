import { bandColor, DEBUG_COLORS } from "./debug-draw";
import type { Stage } from "./stage";

const C = DEBUG_COLORS;

/** What each mark of the debug view means. A swatch is a CSS background or a border style. */
const LEGEND: { swatch: string; line?: boolean; text: string }[] = [
  { swatch: C.blocked, text: "Blocked cell: a rabbit cannot stand here" },
  {
    swatch: `linear-gradient(90deg, ${bandColor(0, 0.9)}, ${bandColor(3.5, 0.9)}, ${bandColor(7, 0.9)})`,
    text: "Cost of the way to the goal, near to far. Arrows point to the next cell. The white cross is the goal",
  },
  { swatch: C.noWay, text: "Open cell with no way to the goal" },
  {
    swatch: C.obstacle,
    line: true,
    text: "Obstacle or pond footprint. Thin line: closest a rabbit's center gets. Dashed: where it starts to push",
  },
  { swatch: C.bounds, line: true, text: "Bounds. Dashed: where the walls start to push" },
  { swatch: C.door, line: true, text: "Door reach, food reach, and the huddle's center and radius (dashed)" },
  { swatch: C.fear, line: true, text: "Spider: fear radius, and the spot it walks to" },
  { swatch: C.wary, line: true, text: "Spider: calm rabbits keep away from here in" },
  { swatch: C.calm, line: true, text: "Calm rabbit, and the path over the bridge" },
  { swatch: C.fleeing, line: true, text: "Fleeing rabbit: it picks its own way, with no field" },
  { swatch: C.goingHome, line: true, text: "Rabbit running home" },
];

const RABBIT_NOTE =
  "Rabbit: the circle is half its spacing, so two circles that overlap push apart. The thick line is its velocity. " +
  "The dashed line ends at the point it heads for. The number is its fear, from 0 to 1.";

/**
 * A debug view for the stage. The D key shows and hides it, and F shows the
 * next field. A page opened with `?debug` in its address starts with it on.
 * While it is on, a panel has a button for each field and a legend that opens
 * to list what the marks mean. `onChange` hears each time the view goes on or off.
 */
export function attachDebug(stage: Stage, onChange: (on: boolean) => void = () => {}) {
  const panel = document.createElement("aside");
  panel.id = "debug-panel";
  panel.hidden = true;

  const title = document.createElement("h2");
  title.textContent = "Debug view";
  const fields = document.createElement("div");
  fields.className = "fields";
  const buttons = stage.debugWays.map((name, i) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = name;
    button.addEventListener("click", () => show(i));
    return button;
  });
  fields.append(...buttons);

  const legend = document.createElement("ul");
  for (const item of LEGEND) {
    const li = document.createElement("li");
    const swatch = document.createElement("span");
    swatch.className = item.line ? "swatch line" : "swatch";
    swatch.style.background = item.swatch;
    li.append(swatch, item.text);
    legend.append(li);
  }
  const note = document.createElement("p");
  note.textContent = RABBIT_NOTE;
  const keys = document.createElement("p");
  keys.className = "keys";
  keys.textContent = "D hides this view. F shows the next field.";
  // The legend starts closed, so the panel covers little of the scene.
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = "Legend";
  details.append(summary, legend, note);
  panel.append(title, fields, details, keys);
  document.body.append(panel);

  const sync = () => {
    panel.hidden = !stage.debug;
    buttons.forEach((b, i) => b.setAttribute("aria-pressed", String(i === stage.debugWay)));
  };
  const show = (way: number) => {
    stage.debugWay = way;
    sync();
  };
  const toggle = (on = !stage.debug) => {
    stage.debug = on;
    sync();
    onChange(on);
  };

  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || e.target.matches("textarea, select, input:not([type=range], [type=checkbox], [type=radio])"));
    if (typing) return;
    const key = e.key.toLowerCase();
    if (key === "d") toggle();
    else if (key === "f" && stage.debug) show((stage.debugWay + 1) % buttons.length);
  });

  if (new URLSearchParams(location.search).has("debug")) toggle(true);
  return { toggle };
}
