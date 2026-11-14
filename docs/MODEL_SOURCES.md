# Source model provenance

- Model: LEGO Technic 42096-1 Porsche 911 RSR, 2019, main model.
- OMR record: https://library.ldraw.org/omr/sets/930
- Download: https://library.ldraw.org/media/omr_models/1089/42096-1.mpd?v=1758937638
- Author: Philippe Hurbain [Philo].
- Model header license: Redistributable under CCAL version 2.0; see CAreadme.txt.
- Current official LDraw part files may carry CC BY 4.0; retain attribution and library license alongside derivative assets.
- OMR flags: missing parts = no; missing patterns = no; missing stickers = yes.
- Original MPD input SHA-256: 6cf2873bdd73f7bb1db6b73da220bd48c9d7ba5db6891cd2811b567420e95793. Obtain the source from the OMR link above; this web repository contains the derived GLB rather than the complete authoring archive.
- MPD bytes: 4,749,823. Embedded subfiles: 76. Type-1 references across definitions: 2,078.
- This is a community-authored LDraw reconstruction of the official LEGO set, not a LEGO-authored CAD model.

## Coordinate evidence

The physical assembly is 42096 - porsche.ldr. Its origin is near the rear differential. LDraw x runs across the vehicle, y runs downward, and z runs along the vehicle. Front axle z = -640, rear axle z = 0. One LDU is 0.4 mm. The 42096 - main.ldr wrapper adds a small pitch and vertical presentation offset.

## Construction parsing

Treat assembly .ldr files as hierarchy. Treat .dat definitions as individual pieces even if they contain primitives/subparts. Retain direct polygon .ldr spring, ribbed hose, and flexible axle definitions as independent custom physical geometry. Low-quality ribbed hose definitions contain multiple generated segment references, which can inflate a naive leaf instance count. The runtime manifest contains 1,700 visible nodes and 1,657 physical assembly roots, including custom interior additions.

## Decals

The OMR file explicitly lacks stickers. Any 911 labels, Porsche/Mobil lettering, red/gray strips or roof graphics added in Blender must be described as reconstruction from the supplied reference. The added orthographic reference confirms the red 911 number belongs on the lower large door panels 64682.dat / 64392.dat, not the upper 62531.dat. Red/gray stripes follow the molded bottom edge and continue on rear triangular panels 64680.dat / 64394.dat.
