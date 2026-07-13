// Flat ground symbols for instrument sections — circle=INC, square=EXT, triangle=VW.
// Renders as MapLibre Polygon features that lie flat on the map (tilt with pitch),
// like the settlement crosses — NOT floating HTML badges.
// pure math on INSTRUMENT_SECTIONS — no maplibre/three import (jest-safe).
import { INSTRUMENT_SECTIONS } from "./instrumentGeo";

const M_PER_DEG_LAT = 111320;

function offsetLngLat(lng, lat, dEastM, dNorthM) {
  const dLat = dNorthM / M_PER_DEG_LAT;
  const dLng = dEastM / (M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
  return [lng + dLng, lat + dLat];
}

// real-world symbol sizes measured from the Klongprem KML (meters):
//   circle (INC) ⌀0.88 · square (EXT) ⌀1.68 · triangle (VW) ⌀1.55
const SIZE_M = { INC: 0.5, EXT: 0.6, VW: 0.8 }; // radius/half-extent per type

// closed ring [[lng,lat],...] for a shape centered at (lng,lat), at real size
function shapeRing(lng, lat, type) {
  const r = SIZE_M[type];
  const pts = [];
  if (type === "INC") {
    const N = 16;
    for (let i = 0; i < N; i++) {
      const a = (2 * Math.PI * i) / N;
      pts.push(offsetLngLat(lng, lat, r * Math.cos(a), r * Math.sin(a)));
    }
  } else if (type === "EXT") {
    const c = r; // half-side → side 1.2 m, diagonal ≈ 1.7 m (matches real)
    pts.push(
      offsetLngLat(lng, lat, -c, -c), offsetLngLat(lng, lat, c, -c),
      offsetLngLat(lng, lat, c, c), offsetLngLat(lng, lat, -c, c)
    );
  } else { // VW — triangle, ~1.5 m extent
    const c = r;
    pts.push(
      offsetLngLat(lng, lat, 0, c),
      offsetLngLat(lng, lat, c * 0.87, -c * 0.5),
      offsetLngLat(lng, lat, -c * 0.87, -c * 0.5)
    );
  }
  pts.push(pts[0]); // close ring
  return pts;
}

// FeatureCollection of green shape polygons — one per (section, instrument type).
// Multiple types at a section sit ~spacingM apart (real instruments cluster tightly).
export function instrumentShapesGeoJSON(spacingM = 3.5) {
  const features = [];
  for (const s of INSTRUMENT_SECTIONS) {
    const n = s.types.length;
    s.types.forEach((t, i) => {
      const east = (i - (n - 1) / 2) * spacingM;
      const [cx, cy] = offsetLngLat(s.lng, s.lat, east, 0);
      features.push({
        type: "Feature",
        properties: {
          sectionId: s.id, chainage: s.chainage, type: t,
          types: s.types.join(","), aboveTunnel: !!s.aboveTunnel,
        },
        geometry: { type: "Polygon", coordinates: [shapeRing(cx, cy, t)] },
      });
    });
  }
  return { type: "FeatureCollection", features };
}
