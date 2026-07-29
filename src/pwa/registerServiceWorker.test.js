import { registerServiceWorker } from "./registerServiceWorker";

test("does not register outside production", async () => {
  const register = jest.fn();
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register } });
  await registerServiceWorker({ env: "development" });
  expect(register).not.toHaveBeenCalled();
});

test("reports a waiting worker as an available update", async () => {
  const waiting = { postMessage: jest.fn() };
  const registration = { waiting, addEventListener: jest.fn() };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register: jest.fn().mockResolvedValue(registration), addEventListener: jest.fn() },
  });
  const onUpdate = jest.fn();
  await registerServiceWorker({ env: "production", onUpdate });
  expect(onUpdate).toHaveBeenCalledWith(registration);
});
