# Case 3 — Harbor Junction collision and departure

**Case ID for your app:** `DEMO-2026-0919-HJ`  
**Case title:** Harbor Junction Collision  
**Incident date:** Saturday, 19 September 2026  
**Local time zone:** Asia/Kolkata  
**Location:** Harbor Junction, River Road at Market Street, Bellwether (fictional)  
**Incident window:** approximately 6:38–6:48 PM

## Case summary to paste into case creation

A cyclist was injured during a collision at Harbor Junction. Witnesses describe a white SUV and a black sedan in separate lanes just before impact. Two later witnesses saw a black car leave the scene but disagree about whether it travelled east or west. The intersection camera clock was four minutes fast. The vehicle-type descriptions are intentionally distinct and should not produce color contradictions between the SUV, sedan, and generic car.

## Cast and entities intended for extraction

- **Ravi Menon** — pedestrian witness.
- **Leena Shah** — shop owner witness.
- **Officer Nikhil Rao** — traffic officer witness.
- **Omar Sayed** — taxi driver witness.
- **June Park** — cyclist witness.
- **Ritu Das** — signal technician witness.
- **Harbor Junction**, **River Road**, **Market Street**, **White SUV**, **Black Sedan**, **Black Car 01**, **Blue Bicycle**, traffic light.

## Expected workflow checks

- Import all six statements.
- Timeline should reflect the camera-clock correction document as contextual evidence; do not hand-enter shifted times into testimony.
- Expected rule-based candidate: east versus west for the same `Black Car 01` leaving the scene.
- Expected NLI gate behavior: do not compare color claims for the white SUV, black sedan, and generic black car as though they were one identified vehicle. YOLO may label all three only as `car`.
- Use the traffic-light/bicycle/car image for YOLO, OCR, scene analysis, and non-person identification.
