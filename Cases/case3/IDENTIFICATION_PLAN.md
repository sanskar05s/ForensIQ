# Case 3 identification and object-link notes

| Image/detection class | Canonical name to use | Identified by/source | Notes |
|---|---|---|---|
| `C3-E03`, `person` | `June Park` | Investigator / investigator | Only if the staged image shows the consenting actor designated as the fictional witness. The exact witness label creates a graph witness node. |
| `C3-E02`, `car` | `Black Car 01` | Officer Nikhil Rao / witness | Use only if the photographed car is the scenario's staged Black Car 01 and that exact entity is present in the graph. The AI only returns `car`. |
| `C3-E01`, `bicycle` | `Blue Bicycle` | June Park / witness | Use only if the image shows the bicycle described in the statement and the exact object entity is extracted. |
| `C3-E01`, `traffic light` | `Traffic Light` | Investigator / investigator | Use only if this exact object entity exists in the graph; otherwise use the exact graph entity label. |

Human identification is a separate investigator/witness annotation. It does not change the YOLO class or prove involvement in the collision.
