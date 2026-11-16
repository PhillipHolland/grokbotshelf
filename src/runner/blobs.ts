// Grok bots for the shelves, modeled on the real avatars: puffy flat-colored
// shapes (circle, rounded triangle, square, hexagon, cloud) with two dark
// slanted capsule eyes up and to one side. Some wear a blue status dot.
// One instanced mesh draws all of them. The vertex shader bends a sphere into
// each bot's outline and the fragment shader paints the face.
import * as THREE from 'three';

// sampled from the avatars on grokbotshelf.com
export const BLOB_COLORS = ['#e84447', '#5ac078', '#e74897', '#3e82f4', '#e87031', '#ffffff', '#996e42', '#895df3', '#e9993a'];

export const blobUniforms = {
  uTime: { value: 0 },
  uCheer: { value: 0 }, // 1 right after a shelf publishes, all bots hop
};

// Outline kinds for aShape.x. 0 is a circle, 3..6 are rounded polygons.
export const BLOB_KIND = { circle: 0, triangle: 3, square: 4, hexagon: 6, cloud: 9 } as const;

// Poles on the z axis so the outline gets all 30 segments. 30 x 8 keeps the
// outlines smooth at shelf size for a third fewer triangles than 36 x 10.
export const blobGeometry = new THREE.SphereGeometry(1, 30, 8).rotateX(Math.PI / 2);

const THICK = 0.46; // depth relative to width: a puffy sticker, not a ball

export function blobMaterial() {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0 });
  m.customProgramCacheKey = () => 'grok-blob-2';
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = blobUniforms.uTime;
    sh.uniforms.uCheer = blobUniforms.uCheer;
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 aShape; // kind, corner radius, turn, seed (negative seed = looks left)
uniform float uTime;
uniform float uCheer;
varying vec3 vLocal;
varying float vSeed;
// distance from the middle to the outline along angle th
float outlineR(float th) {
  float n = aShape.x;
  if (n < 0.5) return 1.0;
  if (n > 8.5) return 0.86 + 0.14 * sqrt(abs(cos(2.5 * (th + aShape.z)))); // five bumps
  float rho = aShape.y;
  float seg = 6.2831853 / n;
  float phi = mod(th + aShape.z, seg) - seg * 0.5;
  float R = 1.0 - rho;
  float t = (R * cos(seg * 0.5) + rho) / cos(phi);
  if (abs(t * sin(phi)) <= R * sin(seg * 0.5)) return t; // flat side
  float psi = seg * 0.5 - abs(phi); // rounded corner
  float s = R * sin(psi);
  return R * cos(psi) + sqrt(max(rho * rho - s * s, 0.0));
}`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
objectNormal = normalize(vec3(objectNormal.xy, objectNormal.z / ${THICK.toFixed(2)}));`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vLocal = transformed;
vSeed = aShape.w;
transformed.xy *= outlineR(atan(transformed.y, transformed.x));
transformed.z *= ${THICK.toFixed(2)};`,
      )
      .replace(
        '#include <project_vertex>',
        `vec4 mvPosition = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
mvPosition = instanceMatrix * mvPosition;
#endif
float ph = abs(aShape.w) * 6.2832;
mvPosition.y += sin(uTime * 2.4 + ph) * 0.008 + uCheer * abs(sin(uTime * 13.0 + ph)) * 0.14;
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTime;
varying vec3 vLocal;
varying float vSeed;
// signed distance to a capsule leaning left at the top; lid squashes it to blink
float eyeD(vec2 p, vec2 c, float lid) {
  vec2 ax = vec2(-0.4, 0.917);
  vec2 d = p - c;
  float along = dot(d, ax);
  d -= ax * along * (1.0 - 1.0 / lid);
  float t = clamp(dot(d, ax), -0.11, 0.11);
  return length(d - ax * t) - 0.105;
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float sd = abs(vSeed);
vec2 p = vLocal.xy;
p.x *= vSeed < 0.0 ? -1.0 : 1.0; // bots on the right shelf look toward the aisle
float front = smoothstep(0.15, 0.35, vLocal.z);
// eyes, glancing up and to the side, with a little per-bot wander
vec2 gaze = vec2(fract(sd * 7.31) - 0.5, fract(sd * 3.17) - 0.5) * vec2(0.22, 0.16);
float lid = fract(uTime * 0.19 + sd * 3.7) < 0.025 ? 0.15 : 1.0;
float e = min(eyeD(p, vec2(0.06, 0.3) + gaze, lid), eyeD(p, vec2(0.46, 0.42) + gaze, lid));
float aa = fwidth(e) * 0.9;
float eye = (1.0 - smoothstep(-aa, aa, e)) * front;
// blue status dot, lower right, on about a quarter of the bots
float dotD = length(p - vec2(0.56, -0.52));
float hasDot = step(fract(sd * 13.7), 0.25) * front;
float daa = fwidth(dotD) * 0.9;
float ring = (1.0 - smoothstep(0.27 - daa, 0.27 + daa, dotD)) * hasDot;
float blue = (1.0 - smoothstep(0.2 - daa, 0.2 + daa, dotD)) * hasDot;
vec3 ink = vec3(0.045, 0.05, 0.06);
diffuseColor.rgb = mix(diffuseColor.rgb, ink, max(eye, ring));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.6, 0.96), blue);
float glow = 1.0 - max(eye, ring);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
// a little self light keeps the flat avatar colors from going muddy in the dark aisle
totalEmissiveRadiance += diffuseColor.rgb * 0.22 * glow;`,
      );
  };
  return m;
}
