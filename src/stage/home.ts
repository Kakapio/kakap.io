import { Stage } from "./stage";
import { DEFAULT_SPIDER } from "./spider-sim";

const canvas = document.querySelector<HTMLCanvasElement>("#stage");
if (canvas) new Stage(canvas, DEFAULT_SPIDER, "window").start();
