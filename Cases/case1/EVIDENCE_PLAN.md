# Case 1 evidence plan

Create or source visual stand-ins that match the fictional scenario. These are not real crime-scene images. Pick clear images where the target occupies enough pixels for YOLO; one image can produce different boxes/classes depending on crop, angle, light, and confidence.

| Evidence filename | Type | Image/document brief | Useful detector/OCR targets |
|---|---|---|---|
| `C1-E01_QuickStop_CCTV_Still.jpg` | image | Staged convenience-store interior at night, an adult actor seen from behind near a counter, red backpack clearly visible, phone near the doorway, fictional QuickStop sign. | `person`, `backpack`, `cell phone`; OCR may read the staged QuickStop sign. |
| `C1-E02_Curb_Phone_Photo.jpg` | image | Close, well-lit photo of a silver cell phone beside a curb and a paper evidence marker reading `QS-17`; no real personal data on screen. | `cell phone`; OCR may read `QS-17`. |
| `C1-E03_Interview_Room_Elena.jpg` | image | Staged interview-room image containing the consenting adult actor designated as fictional witness Elena Rostova; show an interview-room setting, not a suspect scene. | `person`; use only for the simulated witness-to-detection link. |
| `C1-E04_POS_Closeout.pdf` | document | Save the `QuickStop POS closeout` section from `PDF_READY_DOCUMENTS.txt` as a PDF. | Text extraction: store, amount, time. |
| `C1-E05_Dispatch_Extract.pdf` | document | Save the `Bellwether dispatch extract` section as a separate PDF. | Text extraction: call and arrival times. |

## Hypothesis prompts

Paste one prompt at a time into Hypothesis Analyzer:

1. `The person who entered QuickStop at about 11:13 PM was the same person who left with the white cash bag at about 11:15 PM.`
2. `The offender carried a red backpack while leaving QuickStop.`
3. `The Silver Cell Phone recovered beside the curb may have been dropped during the offender's northbound flight.`

## Identification plan

After image analysis, click a detection box and record these as human-entered demo identifications:

| Image/detection class | Canonical name to use | Identified by/source | Notes |
|---|---|---|---|
| `C1-E03`, `person` | `Elena Rostova` | Investigator / investigator | The image must actually show the consenting actor playing the fictional witness. The graph already creates a witness node from the exact witness label. |
| `C1-E01`, `backpack` | `Red Backpack` | Investigator / investigator | Only use if the staged image visibly shows the red backpack and the analyzed entity list includes `Red Backpack`. This records an investigator's visual association; it does not change either witness statement. |
| `C1-E02`, `cell phone` | `Silver Cell Phone` | Officer Lila Chen / witness | Use only if the entity appears in the analyzed statements/graph. Notes: `Training link to property tag QS-17; scripted.` |
| `C1-E01`, `person` | `Darren Cole` | Elena Rostova / witness | Only use with a staged/consented actor and the explicitly simulated identification described in Elena's statement. Never apply this name to an unrelated internet photo. |

For graph linking, match the canonical name to the exact entity label shown after statement analysis. If that entity was not extracted, the UI may save the identification but the graph builder may not draw an identity edge.
