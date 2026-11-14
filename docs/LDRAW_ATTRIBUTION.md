# LDraw attribution and license audit

This record gives the source attribution for the public web model. It describes the supplied source snapshot and the files reached by the importer. It does not grant trademark, vehicle-design, or other third-party rights.

## Source records

| Item | Evidence |
| --- | --- |
| Model | LEGO Technic 42096-1 Porsche 911 RSR community LDraw reconstruction |
| OMR record | [LDraw OMR set 930](https://library.ldraw.org/omr/sets/930) |
| Source download | [42096-1.mpd](https://library.ldraw.org/media/omr_models/1089/42096-1.mpd?v=1758937638) |
| Original MPD SHA-256 | `6cf2873bdd73f7bb1db6b73da220bd48c9d7ba5db6891cd2811b567420e95793` |
| Primary model author | `Philippe Hurbain [Philo]`, as written in the MPD header |
| MPD assembly license | `Redistributable under CCAL version 2.0 : see CAreadme.txt` |
| Library source | [LDraw complete library archive](https://library.ldraw.org/library/updates/complete.zip); supplied local snapshot |
| License texts | [LDraw CAreadme](LDraw-CAreadme.txt), [CC BY 2.0 / CCAL 2.0](LDraw-CCAL-2.0.txt), [CC BY 4.0](LDraw-CC-BY-4.0.txt) |

The library archive URL is mutable; this audit does not claim a specific archive release number. The original MPD is pinned by the SHA-256 above. The web export contains a derived GLB and manifest, not the complete LDraw or Blender authoring archive.

## Exact audit scope

The public manifest has **1,563 visible source objects with 158 distinct source part identifiers**. The audit resolves those identifiers to their original embedded or external definitions, then follows their type-1 references. It follows the original importer's precedence: embedded MPD definitions first, context-relative files next, then the model folder and library `parts/`, `p/`, `models/`; eligible bare primitive names use the importer's high-resolution `p/48/` substitution. Backslashes and forward slashes in embedded/subpart references are normalized. Direct-polygon `.ldr_direct` objects use their owning MPD header and do not recursively import that owner's other children.

| Check | Visible source geometry dependency result |
| --- | ---: |
| Distinct resolved definitions | 593 |
| Unresolved references | 0 |
| Definitions missing an `Author:` header | 0 |
| Definitions missing a `!LICENSE` header | 0 |
| `Licensed under CC BY 4.0` | 537 |
| Dual `CC BY 2.0 and CC BY 4.0` | 30 |
| `Redistributable under CCAL version 2.0` | 26 |
| Distinct `Author:` strings | 42 |

A supplementary traversal of the **entire original assembly**, including source pieces superseded by custom interior work, reaches 633 definitions: 540 CC BY 4.0, 30 dual CC BY 2.0/4.0, and 63 CCAL 2.0. All references resolve and all have author/license headers. No special non-redistribution header was found in either scope. An earlier provisional 616-file count did not fully apply the importer's high-resolution resolution rules and is superseded by these counts.

These are definition counts, not visible object counts. The audit includes referenced primitives and subparts even when the importer later ignores their line-only geometry; it therefore conservatively preserves their attribution. It does not audit every file in a complete LDraw installation or establish permission for third-party marks.

## Complete visible-dependency author list

The following is the complete deduplicated set of the 42 `Author:` strings in the 593 visible-geometry dependencies. Counts refer to definition headers, and examples are original source-relative identifiers (embedded MPD definitions have no library-directory prefix). A contributor's name and handle are retained as supplied by the source. The primary assembly author is additionally credited above.

| Author as written in source | Headers | Example definitions |
| --- | ---: | --- |
| `[PTadmin]` | 3 | `p/48/1-8edge.dat`; `parts/79.dat` |
| `Alex Taylor [anathema]` | 6 | `p/4-4cylc.dat`; `p/48/1-8ring4.dat` |
| `Chris Dee [cwdee]` | 3 | `p/48/5-16cyli.dat`; `p/rect1.dat` |
| `Donald Sutter [technog]` | 15 | `p/3-16cys2.dat`; `p/3-16edge.dat` |
| `Franklin W. Cain [fwcain]` | 7 | `p/1-4ring12.dat`; `p/1-4ring2.dat` |
| `Gerald Lasser [GeraldLasser]` | 8 | `42096 - 15207.dat`; `p/1-16cyls2.dat` |
| `Guy Vivan [guyvivan]` | 11 | `parts/2780.dat`; `parts/2851.dat` |
| `Ishino Keiichiro` | 3 | `parts/32271.dat`; `parts/32278.dat` |
| `J.C. Tchang [tchang]` | 5 | `p/3-8con4.dat`; `p/axl3hole.dat` |
| `James Jessiman` | 67 | `p/1-4cyli.dat`; `p/1-4cyls.dat` |
| `Jeff Boen [onyx]` | 4 | `parts/32184.dat`; `parts/4254.dat` |
| `Jens Brühl [jb70]` | 8 | `p/48/1-8con28.dat`; `p/connectring.dat` |
| `Jeroen Ottens [JeroenOttens]` | 1 | `parts/6589.dat` |
| `Jonathan P. Brown` | 1 | `parts/32526.dat` |
| `Lutz Uhlmann [El-Lutzo]` | 6 | `parts/32013.dat`; `parts/32014.dat` |
| `Magnus Forsberg [MagFors]` | 39 | `p/1-16ring4.dat`; `p/3-16ndis.dat` |
| `Marc Klein [marckl]` | 3 | `p/1-16cyli.dat`; `p/1-16edge.dat` |
| `Mark Kennedy [mkennedy]` | 24 | `p/1-4cylc.dat`; `p/2-4con1.dat` |
| `Massimo Maso [Sirio]` | 11 | `p/3-16tndis.dat`; `p/48/1-4con10.dat` |
| `Max Martin Richter [MMR1988]` | 19 | `p/1-16cylo.dat`; `p/1-4chrd.dat` |
| `Max Murtazin [SwampKryakwa]` | 11 | `p/npeghol19.dat`; `p/npeghol3.dat` |
| `Merlijn Wissink [legolijntje]` | 1 | `parts/18575.dat` |
| `Michael Heidemann [mikeheide]` | 9 | `p/48/1-16chrd.dat`; `p/48/1-4con8.dat` |
| `Niels Karsdorp [nielsk]` | 7 | `p/3-16cyls.dat`; `p/3-8ring12.dat` |
| `Orion Pobursky [OrionP]` | 8 | `p/1-8chrd.dat`; `p/7-16edge.dat` |
| `Owen Burgoyne [C3POwen]` | 8 | `p/confric4.dat`; `p/connect8.dat` |
| `Paul Easter [pneaster]` | 15 | `p/1-8ring3.dat`; `p/48/1-4con5.dat` |
| `Philippe Hurbain [Philo]` | 142 | `42096 - 23801.dat`; `42096 - 24121.dat` |
| `Rene Rechthaler [Blechtaler]` | 1 | `p/axleho12.dat` |
| `Rolf Osterthun [Rolf]` | 1 | `parts/10197.dat` |
| `Ross Crawford [rosco]` | 1 | `parts/40490.dat` |
| `Santeri Piippo [arezey]` | 18 | `p/48/2-4ring9.dat`; `p/axl3ho10.dat` |
| `Steffen [Steffen]` | 14 | `p/4-4ring8.dat`; `p/48/1-4ring2.dat` |
| `Steve Bliss [sbliss]` | 15 | `p/4-4con1.dat`; `p/48/1-4con15.dat` |
| `Takeshi Takahashi [RainbowDolphin]` | 1 | `parts/3068b.dat` |
| `Tim Gould [timgould]` | 5 | `parts/32523.dat`; `parts/61678.dat` |
| `Tore Eriksson [Tore_Eriksson]` | 2 | `p/box4-1.dat`; `p/box4t.dat` |
| `Travis Cobbs [tcobbs]` | 1 | `p/48/1-8sphe.dat` |
| `Ulrich Röder [UR]` | 1 | `p/48/3-8ring2.dat` |
| `Vincent Messenet [Cheenzo]` | 1 | `parts/s/6179s01.dat` |
| `William Howard [WilliamH]` | 4 | `parts/6628.dat`; `parts/71944k01.dat` |
| `Willy Tschager [Holly-Wood]` | 83 | `p/1-4ring3.dat`; `p/1-8cyls.dat` |

The list preserves each source's designated `Author:` field. LDraw files also contain historical editor acknowledgements in `!HISTORY`; those source histories remain available through the linked library and OMR source and are not reproduced as a second authorship list here. This distinction is not a claim that other named historical contributors have no rights.

## Derivative changes and separate rights

The derived model adds independently modeled seats, steering components, instrument display, glazing, stitches, and surface maps; it also changes materials, groups, animation and browser interaction. The supplied CC license texts apply to the relevant LDraw contributions, not automatically to independently added code or artwork.

An earlier reference-based version included added racing-brand and sponsor decal artwork. Those reference-reconstructed decal objects and their unused textures have been removed from the current public asset. This note does not rely on a claim that a LEGO logo is visible in the current model. Removing added decals does not clear all vehicle-shape or trademark issues: descriptive model names, source geometry and any markings already embedded in licensed source geometry can have separate rights. See [RIGHTS_REVIEW.md](RIGHTS_REVIEW.md) for the remaining risk review.

The work is an unofficial community reconstruction and does not claim brand-owner authorization. A non-affiliation statement does not replace permission. Commercial use or redistribution should be assessed for the relevant jurisdiction and particular use.

## Redistribution record

When redistributing the derived model, preserve the model/author/source links in [MODEL_SOURCES.md](MODEL_SOURCES.md), this complete attribution record, and the accompanying [LDraw notice](LDraw-CAreadme.txt), [CC BY 2.0 text](LDraw-CCAL-2.0.txt) and [CC BY 4.0 text](LDraw-CC-BY-4.0.txt). Identify the derivative modifications and do not imply endorsement by LDraw contributors or brand owners.

If the source library, visible part list, or exporter changes, rerun this audit and update its coverage and attribution. The audit describes the supplied snapshot as inspected on 2026-11-14.
