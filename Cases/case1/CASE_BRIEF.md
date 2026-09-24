# Case 1 — QuickStop late-shift robbery

**Case ID for your app:** `DEMO-2026-0917-QS`  
**Case title:** QuickStop Late-Shift Robbery  
**Incident date:** Thursday, 17 September 2026  
**Local time zone:** Asia/Kolkata  
**Location:** QuickStop Grocery, 4th Avenue at Pine Street, Bellwether (fictional)  
**Incident window:** approximately 11:13–11:20 PM

## Case summary to paste into case creation

A late-shift robbery was reported at QuickStop Grocery. The clerk says the offender left with cash and a red backpack. A bystander saw the same person leave with a blue backpack and reports that a silver cell phone was dropped near the curb. Responding police secured the phone and bag. The statements agree on the short time window and northbound route but disagree about backpack color. A later, explicitly simulated photo-identification exercise names fictional person Darren Cole; it is training material, not a real identification.

## Cast and entities intended for extraction

- **Marcus Vance** — store clerk and witness.
- **Elena Rostova** — bystander and witness.
- **Dev Shah** — pharmacy clerk across Pine Street and witness.
- **Officer Lila Chen** — first responding officer and witness.
- **Nora Bell** — store manager and witness.
- **Darren Cole** — fictional person label used only in the scripted training lineup.
- **QuickStop Grocery**, **4th Avenue**, **Pine Street**, **Elm Street**, **Red Backpack**, **Blue Backpack**, **Silver Cell Phone**, cash register, front door.

## Expected workflow checks

- Import all five statements from `WITNESS_STATEMENTS.txt`.
- Timeline should use the 23:13/23:15 local anchors; relative phrases should stay relative/approximate.
- Expected rule-based candidate: red versus blue backpack for the same departing person.
- The app should not treat the handgun as a YOLO object class. The model may detect person, backpack, and cell phone in suitable images.
- Use `IDENTIFICATION_PLAN.md` for a scripted person link and an object link. Keep the scripted Darren Cole image synthetic/consented.
- Test hypotheses in `HYPOTHESIS_TESTS.md` and use the PDF-ready dispatch/POS records in `PDF_READY_DOCUMENTS.txt`.
