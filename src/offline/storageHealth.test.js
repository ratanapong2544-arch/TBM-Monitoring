import { getStorageHealth, STORAGE_WARN_RATIO } from "./storageHealth";

const withNavigator = (storage, run) => {
  const original = Object.getOwnPropertyDescriptor(window.navigator, "storage");
  Object.defineProperty(window.navigator, "storage", { value: storage, configurable: true });
  return Promise.resolve(run()).finally(() => {
    if (original) Object.defineProperty(window.navigator, "storage", original);
    else delete window.navigator.storage;
  });
};

test("reports what the browser gives it, with the share already worked out", async () => {
  // The crew is not going to divide two byte counts in their head underground.
  await withNavigator({
    estimate: async () => ({ usage: 25 * 1024 * 1024, quota: 100 * 1024 * 1024 }),
    persisted: async () => true,
  }, async () => {
    const health = await getStorageHealth();

    expect(health).toMatchObject({ supported: true, usage: 26214400, quota: 104857600, persisted: true, warn: false });
    expect(health.ratio).toBeCloseTo(0.25, 5);
  });
});

test("warns once the store is 80% full, which is where eviction starts to bite", async () => {
  await withNavigator({
    estimate: async () => ({ usage: 80 * 1024 * 1024, quota: 100 * 1024 * 1024 }),
    persisted: async () => false,
  }, async () => {
    await expect(getStorageHealth()).resolves.toMatchObject({ warn: true, persisted: false });
  });
  await withNavigator({
    estimate: async () => ({ usage: 79 * 1024 * 1024, quota: 100 * 1024 * 1024 }),
    persisted: async () => false,
  }, async () => {
    await expect(getStorageHealth()).resolves.toMatchObject({ warn: false });
  });
});

test("the warn threshold is one number, not one per caller", () => {
  expect(STORAGE_WARN_RATIO).toBe(0.8);
});

test("a browser without the API says so instead of throwing", async () => {
  // Safari variants and older WebViews have no `navigator.storage`. A panel that throws here is a
  // panel the crew cannot open, on the screen they open to find out whether their work is safe.
  await withNavigator(undefined, async () => {
    await expect(getStorageHealth()).resolves.toMatchObject({ supported: false, usage: null, quota: null, ratio: null, warn: false });
  });
});

test("an estimate that rejects is reported as unsupported, not as an empty store", async () => {
  // Zero bytes used would read as "plenty of room", which is the opposite of what an error means.
  await withNavigator({
    estimate: async () => { throw new Error("SecurityError"); },
    persisted: async () => true,
  }, async () => {
    await expect(getStorageHealth()).resolves.toMatchObject({ supported: false, usage: null, quota: null, warn: false });
  });
});

test("persistence alone can be unknown without losing the usage numbers", async () => {
  // `persisted()` is missing on more browsers than `estimate()` is.
  await withNavigator({
    estimate: async () => ({ usage: 10, quota: 100 }),
  }, async () => {
    await expect(getStorageHealth()).resolves.toMatchObject({ supported: true, usage: 10, quota: 100, persisted: null });
  });
});

test("a quota of zero does not become a division by zero", async () => {
  await withNavigator({
    estimate: async () => ({ usage: 0, quota: 0 }),
    persisted: async () => false,
  }, async () => {
    const health = await getStorageHealth();
    expect(health.ratio).toBeNull();
    expect(health.warn).toBe(false);
  });
});

test("unknown numbers stay null, because zero would read as plenty of room", async () => {
  // The module's headline rule. A browser that answers with no numbers must not become "0 MB used" —
  // the panel prints what it is given, and 0 of 0 is the most reassuring thing it could say.
  await withNavigator({ estimate: async () => ({}), persisted: async () => true }, async () => {
    const health = await getStorageHealth();
    expect(health.usage).toBeNull();
    expect(health.quota).toBeNull();
    expect(health.ratio).toBeNull();
  });
});

test("a persisted() that rejects is unknown, not a promise that it can be evicted", async () => {
  await withNavigator({
    estimate: async () => ({ usage: 10, quota: 100 }),
    persisted: async () => { throw new Error("SecurityError"); },
  }, async () => {
    await expect(getStorageHealth()).resolves.toMatchObject({ supported: true, persisted: null });
  });
});
