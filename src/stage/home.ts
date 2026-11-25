import { attachDebug } from "./debug-panel";
import { Stage } from "./stage";
import { SPIDERS } from "./spider-sim";

const canvas = document.querySelector<HTMLCanvasElement>("#stage");
const text = [...(document.querySelector("main")?.children ?? [])];
const count = innerWidth < 640 ? 2 : 3;
if (canvas) {
  const stage = new Stage(canvas, Array(count).fill(SPIDERS.small), "window", text);
  attachDebug(stage);
  stage.start();
}
