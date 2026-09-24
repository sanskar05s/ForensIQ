# Case 2 identification and object-link notes

Use the ID form only for detections visible in the uploaded image. These are manually entered mock identifications for a fictional case.

| Image/detection class | Canonical name to use | Identified by/source | Notes |
|---|---|---|---|
| `C2-E03`, `person` | `Maya Ortiz` | Investigator / investigator | The staged image must actually show the consenting actor designated as Maya Ortiz. This links to the exact witness-label node. |
| `C2-E01` or `C2-E02`, `backpack` | `Blue Backpack` | Maya Ortiz / witness | Only if the pictured backpack is blue and `Blue Backpack` appears as an extracted entity. The AI class stays `backpack`. |
| `C2-E01`, `laptop` | `Laptop 204` | Investigator / investigator | Use only if the asset tag is legible, the image shows that laptop, and the exact entity exists in the graph. YOLO detects generic `laptop`, not serial number 204. |
| `C2-E02`, `person` | `Alia Rao` | Investigator / investigator | Do not make this identification from badge 17 alone. Use only a staged image plus a scripted human-confirmation record; the badge log is not identity proof. |

If the exact entity is absent from the graph, the API can still store the identification, but the graph builder may not connect it. Check the analyzed entities and use the matching canonical label.
