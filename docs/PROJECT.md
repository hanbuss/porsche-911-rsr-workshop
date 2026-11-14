# Project architecture and checks

The project is a client-side Vite/Three.js application. It loads `public/assets/car.glb` and `car-manifest.json`; no server-side API or credentials are required.

| Module | Responsibility |
| --- | --- |
| `src/main.js` | UI state, controls, and assembly workflow |
| `src/car-scene.js` | Scene rendering, selection, cameras, and part interpolation |
| `src/part-motion.js` | Doors, covers, wheels, crankshaft and piston motion |
| `src/driver-camera.js` | Fixed driver eye, head rotation, and field of view |
| `src/cockpit-controls.js` | Entry into the closed cabin and driving-state coordination |
| `src/powertrain.js` | Gear ratios, engine state, speed, braking, and accumulated wheel phase |
| `src/engine-audio.js` | Locally synthesized starter, engine, shifting and assembly audio |
| `src/assembly.js` | Independent random labeling and installation order |
| `src/web-surfaces.js` | Glazing, ABS and leather surface preparation |
| `src/vehicle-lighting.js` | Headlamps, forward light projection, brake lamps, and indicators |
| `src/driving-input.js` | Keyboard actions, release and focus handling |
| `src/workshop-rules.js` | Availability of driving, access and disassembly operations |
| `src/gallery.js` | Accessible project gallery; releases pedals and suspends driving shortcuts while open |

## Regression coverage

Run `npm test`. The 50 tests cover:

- ignition, gear ratios, forward/reverse guards, braking, audio lifecycle and signal bounds;
- random labels, incorrect/duplicate submissions, complete installation and reset;
- actual part transforms, fixed side trim, correct central rear hatch, its source inventory and hinge axis;
- constant connecting-rod length, retained wheel phase and restoration to calibrated poses;
- first-person camera position and lens, fixed-eye looking/zooming, and restoration of exterior controls;
- entering the cabin while stationary or moving, closing open access panels, and workshop interlocks;
- texture/material behavior, lamps inside the original lenses, forward ground lighting, brake lamps and hazards.

The rear hatch source fixture identifies the 24 original pieces of `42096 - roof3.ldr`; the fitted rear pane and seal move with that assembly. The neighboring side fairings and rear wing remain fixed.

The manifest uses metres, Y up and vehicle forward +Z. Driver-eye and hinge coordinates are model coordinates, not external location data. Part identifiers, material parameters and geometry are retained in the public build.

The current public model contains 1,685 nodes, including 1,657 physical roots. Fifteen attached reference-derived decals and the old static instrument image were removed; retained physical geometry and transforms are unchanged. The dashboard is drawn at runtime. The four WebP gallery images are rendered from this version and shared by the README and the in-app gallery.

## Browser diagnostics

`window.__RSR__` exposes read-only `snapshot()`, `part(id)` and `projectPart(id)` for interaction verification. It reports runtime state and geometry/material metadata only. It does not include credentials or source-machine paths.

## Static hosting

`npm run build` emits `dist/`. The included Pages workflow tests and builds on pushes and pull requests, and deploys only the default branch. Relative asset URLs allow GitHub Pages repository paths. Local preview binds to the loopback interface.

Only `three` and `vite` remain as declared packages. The scene uses the Meshoptimizer decoder bundled with Three.js; a separate offline optimizer package is not needed at runtime. Unused precompressed model and surface-map files were removed. Keep the model attribution, source licenses and `public/THIRD_PARTY_NOTICES.txt` with redistributed builds.
