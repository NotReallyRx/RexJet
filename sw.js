importScripts("./rj/worker.bundle.js");

self.addEventListener("fetch", (event) => {
  if ($rexjetController.shouldRoute(event)) {
    event.respondWith($rexjetController.route(event));
  }
});
