# Case 3 evidence plan

Use staged, clearly synthetic images or lawful images matching the generic scene. YOLOv8n COCO labels a vehicle as `car`; it does not distinguish sedan from SUV, determine paint color, or read a plate.

| Evidence filename | Type | Image/document brief | Useful detector/OCR targets |
|---|---|---|---|
| `C3-E01_Harbor_Junction_Overview.jpg` | image | Daylight or dusk staged intersection showing a traffic light, bicycle, a white SUV in one lane, and a black sedan in a separate lane. Include a fictional sign `HARBOR JUNCTION`. | `car`, `bicycle`, `traffic light`; OCR may read the sign. Expect generic `car` labels. |
| `C3-E02_Black_Car_Damage.jpg` | image | Close view of a staged black sedan with a visible front-side scrape and an evidence marker `HJ-01`; no readable real registration plate. | `car`; OCR may read `HJ-01`. |
| `C3-E03_June_Interview.jpg` | image | Staged interview-room image with the consenting actor designated as fictional witness June Park. | `person`; witness-to-detection link. |
| `C3-E04_Signal_Controller_Log.pdf` | document | Save the `Harbor Junction controller note` in `PDF_READY_DOCUMENTS.txt` as a PDF. | Text extraction: four-minute camera offset and controller time. |
| `C3-E05_Dispatch_Timeline.pdf` | document | Save the `Bellwether dispatch timeline` section as a PDF. | Text extraction: call/arrival times. |

## Hypothesis prompts

Submit individually:

1. `Black Car 01 was the vehicle that left Harbor Junction after the collision.`
2. `Black Car 01 travelled east toward the railway station after leaving the scene.`
3. `The white SUV caused the collision and continued through the junction.`
4. `The intersection camera time should be corrected by four minutes before comparing it with dispatch times.`

The direction claim is disputed by two witnesses; a hypothesis result should preserve that disagreement rather than choose a direction as fact.
