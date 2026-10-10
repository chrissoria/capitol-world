// Drag to pan, wheel or pinch to zoom. Shared by the map and the building interiors.

import Phaser from "phaser";

export interface PanZoom {
  zoomAt(screenX: number, screenY: number, zoom: number): void;
  zoomBy(factor: number): void;
  flyTo(x: number, y: number, zoom: number, duration?: number): void;
}

export function panZoom(scene: Phaser.Scene, minZoom: number, maxZoom: number): PanZoom {
  const camera = scene.cameras.main;
  let pinch = 0;

  const zoomAt = (screenX: number, screenY: number, zoom: number) => {
    const next = Phaser.Math.Clamp(zoom, minZoom, maxZoom);
    const before = camera.getWorldPoint(screenX, screenY);
    camera.setZoom(next);
    camera.preRender();
    const after = camera.getWorldPoint(screenX, screenY);
    camera.scrollX += before.x - after.x;
    camera.scrollY += before.y - after.y;
  };

  if (scene.input.manager.pointersTotal < 3) scene.input.addPointer(1); // a second touch, for pinching
  scene.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
    const a = scene.input.pointer1;
    const b = scene.input.pointer2;
    if (a.isDown && b.isDown) {
      const distance = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
      if (pinch > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, camera.zoom * (distance / pinch));
      pinch = distance;
      return;
    }
    pinch = 0;
    if (!pointer.isDown) return;
    camera.scrollX -= (pointer.x - pointer.prevPosition.x) / camera.zoom;
    camera.scrollY -= (pointer.y - pointer.prevPosition.y) / camera.zoom;
  });
  scene.input.on("pointerup", () => (pinch = 0));
  scene.input.on("wheel", (pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
    zoomAt(pointer.x, pointer.y, camera.zoom * (dy > 0 ? 0.88 : 1.14));
  });

  return {
    zoomAt,
    zoomBy: (factor) => zoomAt(camera.width / 2, camera.height / 2, camera.zoom * factor),
    flyTo(x, y, zoom, duration = 600) {
      const target = Phaser.Math.Clamp(zoom, minZoom, maxZoom);
      if (duration <= 0) {
        camera.setZoom(target);
        camera.centerOn(x, y);
        return;
      }
      camera.pan(x, y, duration, "Sine.easeInOut", true);
      camera.zoomTo(target, duration, "Sine.easeInOut", true);
    },
  };
}
