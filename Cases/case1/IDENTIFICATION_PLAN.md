# Case 1 identification and object-link notes

YOLO reports class labels and boxes; it does not name a person or identify a particular backpack/phone. Use the ID form only after inspecting the actual box and recording a scripted human identification. The `identification_source` and `identified_by` fields describe who made the identification; they do not upgrade a model guess into a fact.

- **Witness-to-image:** identify the person box in a staged Elena interview image as `Elena Rostova`. The exact label must match the witness node.
- **Named-person demo:** `Darren Cole` is a fictional training label. Only connect it to a staged actor used for the scripted simulated lineup. Do not use a random stock image or real internet person.
- **Non-person detections:** identify the `backpack` box as `Red Backpack` only if the image visibly shows the red backpack and the graph has that exact entity. Identify the phone box as `Silver Cell Phone` only if the statement/entity uses that same label.
- **Expected model limits:** YOLO COCO does not include a handgun class; do not expect a detected gun. It may detect a phone/person/backpack, but results are not guaranteed.
