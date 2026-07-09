// Convert the latest ring's head-attitude deviations into EXAGGERATED display
// angles (deg) for the 3D cutterhead. Real angles are ~0.4° (75 mm over a ~10 m
// shield) — invisible — so we scale them up for visualization; the view always
// shows the real mm/° values alongside. Pure + dependency-free → jest-safe.

export const PITCH_DEG_PER_MM = 0.10; // (headV - tailV) mm → deg (pitch, ก้ม/เงย)
export const PITCH_MAX = 18;
export const ROLL_GAIN = 20;          // vrt° → deg (roll)
export const ROLL_MAX = 30;
export const YAW_DEG_PER_MM = 0.10;   // (headH - tailH) mm → deg (yaw, ซ้าย/ขวา)
export const YAW_MAX = 18;

const num = (v) => (v == null || isNaN(v) ? 0 : Number(v));
const clamp = (v, m) => Math.max(-m, Math.min(m, v));

export function headPostureAngles(posture) {
  if (!posture) return { pitchDeg: 0, rollDeg: 0, yawDeg: 0 };
  return {
    pitchDeg: clamp((num(posture.headV) - num(posture.tailV)) * PITCH_DEG_PER_MM, PITCH_MAX),
    rollDeg: clamp(num(posture.vrt) * ROLL_GAIN, ROLL_MAX),
    yawDeg: clamp((num(posture.headH) - num(posture.tailH)) * YAW_DEG_PER_MM, YAW_MAX),
  };
}
