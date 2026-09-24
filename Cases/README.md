# ForensIQ end-to-end demo case packs

These three case packs are **fictional training scenarios**, not real evidence. Dates, people, places, businesses, logs, and identifiers are invented. The packs contain text and image briefs; you create or source the images and turn the PDF-ready text into PDFs yourself.

## Run a case through ForensIQ

1. Create a case in the app using the title, date, location, and summary in that case's `CASE_BRIEF.md`.
2. In **Witness Statements**, choose the multi-statement document flow and upload `WITNESS_STATEMENTS.txt`. Keep the `Witness Name:` and `Witness Statement:` headers unchanged; the parser relies on them. `.txt` is supported for witness-statement import.
3. Wait until each statement is analyzed. Inspect extracted people, places, times, organizations, and objects. Entity extraction is probabilistic; the packs describe intended entities, not guaranteed model output.
4. Create each image from `EVIDENCE_PLAN.md` (or use a licensed image that actually depicts the described generic objects). Upload it as image evidence and run visual analysis. Save the PDF-ready records as PDFs, upload them as document evidence, and run document extraction.
5. In an analyzed image's detections, choose a detection and record the human identification from `IDENTIFICATION_PLAN.md`. The model returns generic class labels such as `person`, `car`, or `backpack`; it does not determine a person's name, vehicle color, vehicle subtype, or license plate.
6. Run contradiction analysis, build the timeline, rebuild the knowledge graph, generate leads, and export the report. Then submit the hypothesis prompts one at a time in **Hypothesis Analyzer**.

## Object detection and identity links

The image detector is YOLOv8n trained on COCO. ForensIQ's graph currently keeps these relevant detection labels: `person`, `car`, `motorcycle`, `bicycle`, `truck`, `bus`, `backpack`, `handbag`, `suitcase`, `laptop`, `cell phone`, `knife`, `scissors`, `umbrella`, `baseball bat`, `clock`, `traffic light`, `stop sign`, and `bottle` (the graph filter also lists `bag`, although standard COCO YOLO may not emit that label). A detection is not guaranteed just because an object appears in an image; use clear, well-lit, close images and treat the returned boxes as suggestions.

The identification form accepts any detection index. It records a **human** identification separately from the original testimony. For the graph to draw an `IDENTIFIED_AS` edge, the canonical name or alias must exactly match a graph entity label after basic punctuation/case normalization. Use a name that appears in the analyzed statements or an existing witness label, then check that entity exists in the graph. Non-person objects work too: for example, a `backpack` detection can be identified as `Blue Backpack` when that exact object name is present as an extracted entity. The YOLO class itself remains `backpack`.

The current UI does not populate the optional `statement_id` field when saving an identification. It does record `identified_by`, `identification_source`, and notes. Rebuild the graph after saving identifications.

For a person-to-name demo, use a consenting actor/staged image or an explicitly synthetic illustration. **Do not take an unrelated internet photo and label the depicted real person as a fictional suspect or witness.** For object-only detections, use images whose objects genuinely match the pack description and whose use is permitted.

## Important limits for this demo

- Case 2 deliberately tests a presence-versus-absence conflict. The current rule engine has time, color, quantity, and direction rules; it does not yet implement presence/absence contradiction detection. Treat a missing flag there as a known product gap, not a failed upload.
- Case 3 includes SUV/sedan/generic-car observations to ensure the NLI gate does not merge unrelated vehicle types. Generic YOLO detection normally labels these vehicles `car`; it cannot validate SUV/sedan subtype or color.
- NLI, Gemini hypotheses/leads, OCR, and entity extraction can vary. The expected outcomes below are checks for the workflow, not promised exact AI wording or confidence scores.
- Scene classification may return `unknown` when the Places365 weights are not installed. Image object detection and OCR are separate modules.
- Store the PDF-ready text below as real PDFs before uploading them as evidence. The general evidence upload accepts PDF/documents and images; use the dedicated witness import for `WITNESS_STATEMENTS.txt`.
- Run only with your configured development Supabase and model/API credentials. Do not put secrets in this folder.

## Contents

- [Case 1 — QuickStop robbery](case1/CASE_BRIEF.md)
- [Case 2 — Northline warehouse laptop loss](case2/CASE_BRIEF.md)
- [Case 3 — Harbor Junction collision](case3/CASE_BRIEF.md)
