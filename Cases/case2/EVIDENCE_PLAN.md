# Case 2 evidence plan

All images are fictional training stand-ins. If using outside images, choose lawful-to-use images and do not attach a real person's identity to a stock photo.

| Evidence filename | Type | Image/document brief | Useful detector/OCR targets |
|---|---|---|---|
| `C2-E01_Warehouse_Aisle.jpg` | image | Staged archive/warehouse aisle with one person at a distance, a clearly visible backpack, open laptop shelf, and a printed fictional asset tag `NORTHLINE 204`. | `person`, `backpack`, `laptop`; OCR may read the asset tag. |
| `C2-E02_Dock3_Rear_Door.jpg` | image | Staged loading-bay door at night with an adult actor and a backpack near the door; show Dock 3 sign. | `person`, `backpack`; OCR may read Dock 3. |
| `C2-E03_Maya_Interview.jpg` | image | Staged interview-room image with the consenting adult actor designated as fictional witness Maya Ortiz. | `person`; manual witness-to-detection link only. |
| `C2-E04_Access_Log.pdf` | document | Save the `Northline badge access extract` in `PDF_READY_DOCUMENTS.txt` as a PDF. | Text extraction: badge 17, 9:58 PM, Alia Rao. |
| `C2-E05_Inventory_Sheet.pdf` | document | Save the `Northline inventory recount` section as a PDF. | Text extraction: four laptops before, two after. |

## Hypothesis prompts

Submit one at a time:

1. `Two laptops were removed from the storage shelf between the 9:45 PM and 10:25 PM counts.`
2. `The 9:58 PM badge event proves that Alia Rao was physically at the rear entrance.`
3. `A person carrying the Blue Backpack moved from the storage aisle toward Dock 3.`

Hypothesis 2 is intentionally too strong: the access log itself says a swipe cannot establish who carried the badge. A good analysis should preserve that uncertainty.
