import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

/**
 * Take a new build on the first reload rather than the second.
 *
 * The generated worker uses skipWaiting + clientsClaim, so a new one activates
 * and claims this page immediately — but the page is already running the code
 * it was served from the old precache, and the injected registration neither
 * prompts nor reloads. Without this, every deploy needs two loads to take
 * effect, and an installed PWA that gets resumed rather than reloaded can sit
 * on stale code indefinitely.
 *
 * `controllerchange` also fires on a first visit, when clientsClaim adopts a
 * page that loaded over the network. Nothing is stale then, so the test is
 * whether a controller existed *before* the swap, not whether one exists now —
 * it is non-null either way by the time the event fires.
 */
if ('serviceWorker' in navigator) {
  const hadController = navigator.serviceWorker.controller !== null;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
}

const target = document.getElementById('app');
if (!target) throw new Error('#app mount point missing from index.html');

export default mount(App, { target });
