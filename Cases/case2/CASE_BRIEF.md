# Case 2 — Northline Archive warehouse laptop loss

**Case ID for your app:** `DEMO-2026-0918-NA`  
**Case title:** Northline Archive Warehouse Laptop Loss  
**Incident date:** Friday, 18 September 2026  
**Local time zone:** Asia/Kolkata  
**Location:** Northline Archive, Dock 3, Westbridge Industrial Estate (fictional)  
**Incident window:** 9:45–10:25 PM

## Case summary to paste into case creation

Two laptops were reported missing from the Northline Archive warehouse. The night security officer says a person was standing at the rear entrance at about 10:00 PM and later describes a Blue Backpack. The warehouse manager says nobody was at that entrance at the same time. An access log records a valid badge swipe assigned to contractor Alia Rao, but the log does not establish who carried the badge. This is intentionally a test of evidence, timeline, quantity, object linking, and a known presence/absence rule gap.

## Cast and entities intended for extraction

- **Maya Ortiz** — security officer and witness.
- **Arun Desai** — warehouse manager and witness.
- **Pooja Nair** — inventory clerk and witness.
- **Tomas Iyer** — cleaning contractor and witness.
- **Kira Bose** — access-control technician and witness.
- **Alia Rao** — contractor whose badge is referenced; badge association alone does not identify the person at the door.
- **Northline Archive**, **Dock 3**, **Westbridge Industrial Estate**, **Rear Entrance**, **Blue Backpack**, **Laptop 204**, **Laptop 205**.

## Expected workflow checks

- Import all five statements and analyze them.
- Timeline should preserve the approximately 10:00 PM presence claims and later inventory check.
- Quantity claims support a missing-laptop hypothesis; whether Tier 1 catches them depends on extracted quantity semantics.
- The app currently does **not** implement presence-versus-absence contradiction detection. Do not expect a contradiction card for Maya versus Arun from this rule set.
- Use the access log and inventory record as PDF document evidence; use a staged warehouse image for person/backpack/laptop detections.
- Test hypotheses and identification links using the files in this folder.
