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

// closed ring [[lng,lat],...] for a shape centered at (lng,lat), size rM meters
function shapeRing(lng, lat, type, rM) {
  const pts = [];
  if (type === "INC") {
    const N = 16;
    for (let i = 0; i < N; i++) {
      const a = (2 * Math.PI * i) / N;
      pts.push(offsetLngLat(lng, lat, rM * Math.cos(a), rM * Math.sin(a)));
    }
  } else if (type === "EXT") {
    const c = rM * 0.9;
    pts.push(
      offsetLngLat(lng, lat, -c, -c), offsetLngLat(lng, lat, c, -c),
      offsetLngLat(lng, lat, c, c), offsetLngLat(lng, lat, -c, c)
    );
  } else { // VW — triangle
    const c = rM * 1.15;
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
// Multiple types at a section are spread east by `spacingM` so all shapes read.
export function instrumentShapesGeoJSON(rM = 4, spacingM = 10) {
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
        geometry: { type: "Polygon", coordinates: [shapeRing(cx, cy, t, rM)] },
      });
    });
  }
  return { type: "FeatureCollection", features };
}
