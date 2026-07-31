import { stripQueuedPhotos } from "./displayRecord";

test("a queued photo leaves the row on screen carrying a marker, not the bytes", () => {
  const queued = { id: "g1", ringNo: "P643", imageBase64: "data:image/jpeg;base64,AAAA", imageName: "ring.jpg" };

  const display = stripQueuedPhotos(queued);

  expect(display.imageBase64).toBeUndefined();
  expect(display.imageName).toBeUndefined();
  expect(display.imageUrl).toBe("Attached"); // the data logs read this as "queued, no link yet"
  expect(display.ringNo).toBe("P643");
  expect(queued.imageBase64).toBe("data:image/jpeg;base64,AAAA"); // the payload keeps what it sends
});

test("the excavation photo is stripped on its own terms", () => {
  // a segment carries two photos with separate field names, and only one of them may be present
  const display = stripQueuedPhotos({ id: "s1", excavImageBase64: "data:image/jpeg;base64,BBBB", excavImageName: "soil.jpg" });

  expect(display.excavImageBase64).toBeUndefined();
  expect(display.excavImageUrl).toBe("Attached");
});

test("a URL the server has already answered with is not overwritten", () => {
  // a re-save of a row whose photo is already on Drive must keep the link the crew can open
  const display = stripQueuedPhotos({ id: "g1", imageBase64: "data:image/jpeg;base64,AAAA", imageUrl: "https://drive.example/1" });

  expect(display.imageUrl).toBe("https://drive.example/1");
});

test("a row with no photo is handed back untouched", () => {
  // identity matters: the callers put this straight into React state, and a fresh object on every
  // apply would re-render every list that holds it
  const row = { id: "s1", ringNo: "P643" };

  expect(stripQueuedPhotos(row)).toBe(row);
  expect(stripQueuedPhotos(null)).toBe(null);
});
