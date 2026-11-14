# Source model provenance

- Model: LEGO Technic 42096-1 Porsche 911 RSR, 2019, main model.
- OMR record: https://library.ldraw.org/omr/sets/930
- Download: https://library.ldraw.org/media/omr_models/1089/42096-1.mpd?v=1758937638
- Author: Philippe Hurbain [Philo].
- Model header license: Redistributable under CCAL version 2.0; see CAreadme.txt.
- Referenced part definitions use CC BY 2.0, CC BY 4.0 or dual-license headers; retain attribution and the applicable library license alongside derivative assets. The exact scope and all 42 author strings are recorded in [LDRAW_ATTRIBUTION.md](LDRAW_ATTRIBUTION.md).
- OMR flags: missing parts = no; missing patterns = no; missing stickers = yes.
- Original MPD input SHA-256: 6cf2873bdd73f7bb1db6b73da220bd48c9d7ba5db6891cd2811b567420e95793. Obtain the source from the OMR link above; this web repository contains the derived GLB rather than the complete authoring archive.
- MPD bytes: 4,749,823. Embedded subfiles: 76. Type-1 references across definitions: 2,078.
- This is a community-authored LDraw reconstruction of the official LEGO set, not a LEGO-authored CAD model.

## Coordinate evidence

The physical assembly is 42096 - porsche.ldr. Its origin is near the rear differential. LDraw x runs across the vehicle, y runs downward, and z runs along the vehicle. Front axle z = -640, rear axle z = 0. One LDU is 0.4 mm. The 42096 - main.ldr wrapper adds a small pitch and vertical presentation offset.

## Construction parsing

Treat assembly .ldr files as hierarchy. Treat .dat definitions as individual pieces even if they contain primitives/subparts. Retain direct polygon .ldr spring, ribbed hose, and flexible axle definitions as independent custom physical geometry. Low-quality ribbed hose definitions contain multiple generated segment references, which can inflate a naive leaf instance count. The current public manifest contains 1,685 visible nodes and 1,657 physical assembly roots, including custom interior additions.

## Public derivative and changes

The OMR file explicitly lacks stickers. An earlier web export added 15 reference-derived decal nodes, including brand and sponsor graphics, without a separately recorded license. The current public derivative removes all 15 of those nodes, their unused materials and texture data, and the old static instrument image. The original 1,657 physical roots, retained geometry and assembly transforms are unchanged. The dynamic instrument display now uses project-specific text.

The public GLB contains no embedded images or texture objects. The separate leather height map is project-created. Seats, steering components, instruments, glazing, surface adjustments and browser interaction are project additions. Four screenshots in `public/gallery/` are rendered from this current public derivative.

These removals reduce redistribution of the added graphics; they do not grant rights in vehicle designs, trademarks or the original reference images. Names identify the depicted model, not an endorsement. See [RIGHTS_REVIEW.md](RIGHTS_REVIEW.md) for the separate rights and the limits of this review. Older Git commits can still contain the previous export; this document describes the current branch and deployed site.
