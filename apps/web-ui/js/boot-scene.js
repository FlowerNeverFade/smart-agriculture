/**
 * Starts the shared wheat-field scene as the boot camera, then hands it to the homepage.
 */
import { initSceneBackground } from './scene-background.js?v=55';

const field = initSceneBackground();

window.AgriBoot = {
  setProgress(value, label) {
    field?.setBootProgress?.(value, label);
  },
  waitUntilProgress(min) {
    return field?.waitUntilBootProgress?.(min) || Promise.resolve();
  },
  reveal() {
    return field?.revealFromBoot?.() || Promise.resolve();
  },
  destroy() {
    // Scene stays as the homepage background.
  },
};

window.AgriBoot.setProgress(0.06, '正在唤醒田野…');
