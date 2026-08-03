/**
 * Telling "the satellite imagery did not load" apart from "the map is broken".
 *
 * Everything the crew actually reads off the alignment map — the route, the shafts, the tunnel tube,
 * the head position, the instrument shapes — is this app's own data and draws with no link at all.
 * Only the imagery underneath comes from Esri. So a tile failure deserves one line saying which part
 * is missing, and a style or WebGL failure must not be reported as a missing basemap: that would
 * send a crew looking for signal when the problem is the device.
 *
 * Lives in its own module because `AlignmentMapView` pulls in maplibre and three.js, which cannot be
 * imported in a jsdom test — the decision can be, and is.
 */

// the source id the raster tiles are registered under in `AlignmentMapView`'s style
export const BASEMAP_SOURCE_ID = "sat";

export const BASEMAP_OFFLINE_NOTICE = "พื้นหลังแผนที่ต้องใช้อินเทอร์เน็ต — แนวอุโมงค์ ปล่อง และตำแหน่งหัวเจาะ แสดงครบตามปกติ";

export function isBasemapTileError(event) {
  if (!event) return false;
  const sourceId = event.sourceId || (event.source && event.source.id) || null;
  return sourceId === BASEMAP_SOURCE_ID;
}
