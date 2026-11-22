import { Stage } from "./stage";
import { SPIDERS } from "./spider-sim";

const canvas = document.querySelector<HTMLCanvasElement>("#stage");
const text = [...(document.querySelector("main")?.children ?? [])];
const count = innerWidth < 640 ? 2 : 3;
if (canvas) new Stage(canvas, Array(count).fill(SPIDERS.small), "window", text).start();
