# FieldWise Orchard Intelligence

## Technical and Commercial Feasibility of Orchard Diagnosis, Treatment, Irrigation Control, and Drone Pollination

**Prepared for:** FieldWise / Aurelian product and engineering leadership  
**Date:** 7 November 2026  
**Evidence cut-off:** 7 November 2026  
**Status:** Research report to guide product scope, pilot design, and engineering backlog  
**Working geography:** Pakistan (unconfirmed; see assumptions)  
**Working crops:** Date palm and mixed orchards/specialty crops (unconfirmed; see assumptions)

---

## How to read this report

This report separates four questions that are often blurred together:

1. **Can the system detect an anomaly?** For example, a vegetation-index drop, a hot spot, a wet block, or a valve that is not flowing.
2. **Can it classify a likely cause?** For example, red palm weevil (RPW), salinity, waterlogging, nutrient deficiency, or a blocked emitter.
3. **Can it confirm a diagnosis?** For example, a laboratory test, a trained agronomist's field inspection, or a trap catch.
4. **Can it safely act?** For example, dispatch a spray drone, open a valve, or pollinate a block.

These are different levels of evidence and different levels of product risk. A system that detects an anomaly is not a diagnostic system. A system that recommends a treatment is not an autonomous spray system. A system that records a completed job is not proof that the job was done correctly or that it worked.

The report uses these evidence labels:

| Label | Meaning | Typical examples |
|---|---|---|
| **E1 — Strong** | Systematic review/meta-analysis, replicated multi-site field trial, authoritative regulatory standard, or FAO/WHO guidance | FAO-56; FAO/WHO aerial application guidance; multi-site field trials |
| **E2 — Moderate** | Peer-reviewed primary field study, or a well-designed lab study with field validation | A single-orchard UAV trial; a calibrated sensor study |
| **E3 — Limited** | Single-site field trial, preprint, thesis, extension guide, or vendor trial with methods | A one-season date-palm pollination trial; a university extension fact sheet |
| **E4 — Marketing/anecdote** | Vendor marketing, trade media, demonstration video, unsourced blog | Drone vendor yield claims; YouTube demonstrations without methods |
| **E5 — Absent/conflicting** | No direct evidence, or evidence that conflicts across studies | Orchard drone spray efficacy in dense date palm canopies; date-palm drone pollination yield |

The labels describe the **strength of the evidence for the specific claim**, not the quality of the journal or the sincerity of the author. A peer-reviewed paper can still be E3 for a commercial claim if it is a single-site prototype with no yield outcome.

The report also uses these product-status labels:

| Status | Meaning |
|---|---|
| **READY-FOR-PROTOTYPE** | The underlying method is sufficiently established and the main work is product engineering, integration, and usability. This does not mean it is ready for unsupervised commercial use. |
| **NEEDS-FIELD-VALIDATION** | The method is plausible and partly demonstrated, but performance in the target crop, geography, and workflow is not established. A controlled trial is required before a commercial claim. |
| **EXPERIMENTAL** | Laboratory/prototype-stage, highly crop- or site-specific, or dependent on unproven agronomic or regulatory assumptions. Do not sell as a proven outcome. |
| **DEFER** | The risk, regulatory burden, capital cost, or evidence gap is too high for the current stage. Revisit only after explicit gates are met. |

The report follows this rule throughout: **detecting an anomaly is not a diagnosis; a recommendation is not an execution; an execution record is not an outcome.**

---

# 1. Executive summary

## 1.1 Bottom line

FieldWise should **build the observation-to-approval workflow first**, not the autonomous intervention layer.

The strongest, most defensible product is a **farm evidence and action ledger**: real field boundaries, satellite and weather time series, scouting observations, sensor data, agronomist review, lab confirmation, treatment recommendations, approvals, job records, and measured outcomes. This is buildable now, it matches the cautious direction already described in `SITREP.md`, and it creates the data needed for any later automation.

The four features are not equally ready:

- **Orchard diagnosis** is ready for a prototype as **anomaly detection and scouting triage**. It is **not** ready as an autonomous diagnostic authority. Cause-ranked diagnosis needs ground truth, local labels, and lab/agronomist confirmation.
- **Treatment recommendation and spray recordkeeping** are buildable now. **Drone spray execution in orchards is experimental to needs-field-validation**, and **fumigation is not a software-dispatchable operation**.
- **Drip and sprinkler monitoring/advisory** is ready for a prototype. **Closed-loop valve control** needs field validation, controller-specific integration, and hard safety limits.
- **Drone-assisted pollination** is experimental for commercial date palm. The evidence is mixed: some studies show acceptable fruit set, but not consistent yield superiority over manual pollination; several “AI drone pollination” claims are prototype or simulation claims without yield data.

The correct commercial posture is therefore:

> **Observe → understand → recommend → approve → act (by a qualified human or licensed operator) → measure.**

Not:

> **Detect → autonomously spray/pollinate/irrigate → claim ROI.**

## 1.2 Four-feature comparison

| Feature | What the evidence supports | What remains unproven or unsafe | Current product status | Recommendation |
|---|---|---|---|---|
| **A. Orchard health diagnosis** | UAV/ satellite imagery can detect vegetation anomalies; scouting can be prioritized; some date-palm/RPW studies show detectable signatures; lab/agronomist confirmation is possible | Cause-level diagnosis from images alone; cross-orchard generalization; early detection before visual symptoms; commercial date-palm/RPW performance; liability if a model misses a lethal pest | **READY-FOR-PROTOTYPE** for anomaly detection, scouting, and evidence capture. **NEEDS-FIELD-VALIDATION** for cause-ranked diagnosis. | Build the diagnostic **workflow** and ground-truth loop. Do not label image output as a confirmed diagnosis. |
| **B. Treatment, spraying, fumigation** | Treatment decisions can be standardized; spray job records and approvals are buildable; drone deposition/drift is measurable; regulation is explicit in several jurisdictions | Orchard drone spray efficacy in dense canopies; drift and off-target risk; Pakistan-specific approval; operator competence; fumigation safety; economic advantage at small scale | **READY-FOR-PROTOTYPE** for recommendation, approval, and job records. **EXPERIMENTAL/NEEDS-FIELD-VALIDATION** for orchard drone spray. **DEFER** for fumigation dispatch. | Build prescription and audit workflow. Use licensed ground or aerial contractors. Do not dispatch autonomous spray. |
| **C. Drip + sprinkler monitoring/control** | Soil moisture, weather, flow, pressure, and controller data can be integrated; ET-based scheduling is established; controller APIs exist; sensor calibration is documented | Root-zone representativeness; sensor drift/failure; connectivity; controller API limits; crop-specific Kc; water savings without yield loss; safe closed-loop control | **READY-FOR-PROTOTYPE** for monitoring and advisory. **NEEDS-FIELD-VALIDATION** for closed-loop control. | Build vendor-neutral monitoring and advisory first. Integrate one controller for read-only and bounded, approved writes. |
| **D. Drone-assisted pollination** | Liquid pollen suspension can set fruit in some date-palm trials; drones can reduce time/labor in some settings; pollen viability and timing matter | Consistent yield benefit vs manual; cost per palm; fruit quality; cultivar-specific response; optimal flight parameters; pollen waste; commercial-scale reliability; regulatory acceptance | **EXPERIMENTAL / NEEDS-FIELD-VALIDATION** | Run a partner-led, randomized field trial with manual control. Do not sell yield uplift. |

## 1.3 What to build first

1. **A spatial evidence ledger.** Field boundaries, management blocks, tree/row geometry where available, satellite scenes, weather, scouting notes, photos, lab results, sensor readings, recommendations, approvals, and job records — all with provenance and timestamps.
2. **A diagnosis triage workflow.** The system flags anomalies and asks for ground truth. It produces a ranked hypothesis list with confidence and “what would confirm this,” not a final diagnosis.
3. **An irrigation monitoring and advisory workflow.** Soil moisture, flow, pressure, weather, and ET-based recommendations. Human approval before any valve command.
4. **A treatment recommendation and spray job record.** Product, dose, target, block, buffer constraints, weather check, licensed applicator, approval, and post-application record.
5. **A measurement layer.** Yield, fruit set, water use, energy use, cost, and scouting time. Without this, “ROI” is a marketing claim.

## 1.4 What to defer

- **Autonomous drone spraying**, especially in dense orchards, until there is local regulatory approval, a licensed operator, measured deposition/drift, and biological efficacy data.
- **Fumigation execution or dispatch.** Fumigation is a certified-applicator, label-specific, buffer-zone operation with serious acute toxicity and environmental risks.
- **Closed-loop irrigation across all blocks.** Start with one block, one controller, hard limits, and a human override.
- **Commercial drone pollination claims.** Run a trial; do not promise yield.
- **Building drones or sensors.** Integrate proven hardware; build the workflow, data, and decision layer.

## 1.5 Pilot headline

A realistic first pilot is a **12-month, 40–60 ha date-palm orchard in Sindh, Pakistan**, with existing drip or bubbler irrigation, one cooperative agronomist, one laboratory partner, and a licensed spray contractor. The pilot should test **diagnosis triage, irrigation advisory, spray recordkeeping, and a small randomized pollination trial** — not autonomous spraying. A planning envelope of **USD 60,000-160,000** is more realistic than a demo budget: roughly 60,000-90,000 for a lean pilot, and 120,000-160,000 for a fuller trial with a purchased multispectral UAV and a larger pollination study. The range depends on whether UAV imagery is purchased as a service or acquired in-house. This is an order-of-magnitude planning figure, not a quote; local quotes are required.

## 1.6 What would change the recommendation

The recommendation would become more aggressive only if **all** of the following are true:

- A local, replicated trial shows orchard drone spray deposition and biological efficacy are non-inferior to conventional spraying, with drift inside accepted buffer limits.
- A Pakistan regulator provides written confirmation that the specific operation, product, drone class, and operator are permitted.
- A date-palm pollination trial shows fruit set and yield non-inferior to manual pollination across at least two cultivars and two seasons, at lower cost per palm.
- The product can prove sensor uptime, command auditability, and safe failure behavior in the field.
- Customers will pay for the measured outcome, not just the dashboard.

Until then, the product should sell **decision quality, traceability, and avoided losses**, not autonomous intervention.

---

# 2. Product framing and scope

## 2.1 Working assumptions

These assumptions are **not confirmed** and should be validated before engineering commitments:

| Assumption | Why it matters | How to confirm |
|---|---|---|
| **Geography: Pakistan** | Regulation, connectivity, labor, water, and crop mix are local | Confirm target province(s) and customer sites |
| **Crops: date palm plus mixed orchards/specialty crops** | Date palm is a long-cycle, high-value crop with specific pests and pollination biology; mixed orchards complicate models | Confirm crop list, cultivars, and acreage |
| **Farm size: small-to-medium, 5–100 ha** | Determines whether owned drones/sensors make sense or services are better | Interview 10–15 growers and service providers |
| **Delivery: cloud-connected mobile/web app** | Rural connectivity may be poor; offline-first is likely required | Test connectivity at candidate sites |
| **No assumption of an existing drone fleet** | Drone ownership is a major capital and regulatory burden | Inventory available service providers |
| **No assumption of reliable rural power or internet** | Sensors and gateways need solar/battery and store-and-forward | Site survey |
| **Water is scarce and/or costly** | Irrigation value proposition depends on water/energy savings or yield protection | Obtain water tariffs, energy costs, and pumping data |
| **Manual pollination labor is available but costly/uncertain** | Drone pollination only makes sense if it solves a real labor or timing constraint | Measure labor hours and cost per palm |

The report separates **global evidence** from **Pakistan-specific evidence**. A global finding is not automatically a Pakistan finding.

## 2.2 What the product currently claims vs what the evidence supports

The repository README describes “Aurelian” as a precision-agriculture “single command center” with “real-time field telemetry, multispectral crop analysis, drone operations, soil sensor data, and AI-powered decision support,” plus “autonomous intervention” and “measurable ROI.” These are vision statements, not validated capabilities.

| README claim | Evidence-based assessment | Recommended language |
|---|---|---|
| “Real-time field telemetry” | Satellite revisit is days, not real-time; scouting is periodic; sensors can be near-real-time but are sparse | “Timely field observations and sensor telemetry, with latency shown” |
| “Multispectral crop analysis” | Feasible, but vegetation indices are not diagnoses; NDVI saturates in dense canopies; tree-level resolution needs UAV/VHR imagery | “Multispectral anomaly detection and scouting prioritization” |
| “Drone operations” | Can be integrated, but spray/pollination execution is regulated and not proven in target orchards | “Drone mission planning and contractor coordination” |
| “AI-powered decision support” | Models can rank hypotheses, but field accuracy is lower than lab benchmarks and depends on local labels | “AI-assisted triage, reviewed by an agronomist” |
| “Autonomous intervention” | Not safe or legal for spraying/fumigation; irrigation can be bounded but needs fail-safes | “Approved intervention with audit trail and human override” |
| “Measurable ROI” | Only measurable if baseline and outcome data are collected | “Measured outcomes against a pre-agreed baseline” |

This is not a reason to weaken the vision. It is a reason to make the first product **credible**. A farmer who catches a false “disease detected” alert or an unauthorized valve opening will not trust the next recommendation.

## 2.3 Definitions used in this report

| Term | Definition | Product implication |
|---|---|---|
| **Observation** | A measured or reported fact: image index, sensor reading, scout note, trap count, lab result | Must have timestamp, location, source, and provenance |
| **Anomaly** | A deviation from expected or historical conditions | Can be detected automatically; not a cause |
| **Cause hypothesis** | A ranked candidate explanation for an anomaly | Must show confidence and supporting/contradicting evidence |
| **Diagnosis** | A conclusion that a specific cause is present, usually confirmed by a qualified person or lab | Requires evidence and accountable sign-off |
| **Recommendation** | A proposed action with product, dose, timing, and constraints | Must be reviewed and approved |
| **Approval** | An accountable human decision to proceed | Must record who, when, and on what evidence |
| **Dispatch** | Sending a job to an operator or controller | Must never be simulated as live |
| **Action** | The actual field operation | Must be recorded by the operator, not inferred from a plan |
| **Outcome** | Measured result: yield, fruit set, water use, cost, pest reduction | Must be compared with a baseline |

The existing `docs/fieldwise-schema.sql` already contains estates, sectors, sensors, alerts, and actions. The schema should be extended with explicit **observations, evidence, hypotheses, recommendations, approvals, jobs, lab results, treatment records, water events, trial plots, and audit logs**. The distinction between “planned,” “approved,” “dispatched,” “completed,” and “verified” should be a first-class state machine, not a free-text status.

## 2.4 Evidence grading and product-status rules

A capability can be **technically feasible** but **not commercially ready**. The report uses separate judgments:

- **Technical feasibility:** Can it be built with current technology?
- **Evidence strength:** Does it work in the real world, in the target crop and geography?
- **Regulatory readiness:** Is it legal and certifiable?
- **Data readiness:** Do we have the labels, baselines, and integrations?
- **Operational readiness:** Can a farm actually use it without new unsustainable labor?
- **Commercial readiness:** Will someone pay, and can we deliver safely at a cost?

A feature is **READY-FOR-PROTOTYPE** only when technical feasibility is high and the main uncertainty is product fit, not basic science. It is **NEEDS-FIELD-VALIDATION** when the science is plausible but local performance is unknown. It is **EXPERIMENTAL** when the core agronomic or regulatory claim is unproven. It is **DEFER** when the risk or capital requirement is disproportionate to the evidence.

## 2.5 Product principles

1. **Human authority over lethal or irreversible actions.** Spraying, fumigation, and pollination affect neighboring farms, workers, pollinators, and water. A human must approve.
2. **Provenance over polish.** Every recommendation should show its inputs, model version, confidence, and missing evidence.
3. **No simulated data presented as live.** Demo mode must be visibly labeled in the UI and in the data model.
4. **Uncertainty is a feature.** “I don't know” and “I need a lab test” are valid outputs.
5. **Local ground truth beats global benchmarks.** A model trained on PlantVillage or a foreign orchard is not a Pakistan diagnosis.
6. **Fail safe, not fail open.** Loss of connectivity, sensor failure, or ambiguous command should stop action, not guess.
7. **Measure the outcome.** A job record is not an outcome; yield, fruit set, water use, and cost are outcomes.
8. **Do not monetize unproven yield claims.** Sell traceability, decision quality, and avoided losses until yield effects are measured.

## 2.6 Non-goals for the first 12–18 months

- Building proprietary drones, sprayers, valves, or soil probes.
- Autonomous pesticide application.
- Fumigation planning or execution.
- A general-purpose crop-disease AI that claims to diagnose any crop.
- Real-time tree-level monitoring from free satellite imagery.
- A carbon-credit or water-credit product before measurement is audited.
- A “drone pollination as a service” business before a local trial.

---

# 3. Evidence review

## 3A. Orchard health diagnosis

### 3A.1 The diagnostic ladder

Orchard diagnosis is not one task. It is a ladder:

| Level | Output | What it can support | What it cannot support |
|---|---|---|---|
| **L1. Anomaly detection** | “This block/tree differs from its own baseline or from neighbors” | Prioritize scouting; catch a problem worth inspecting | A cause, a treatment, or a confirmed diagnosis |
| **L2. Symptom classification** | “This looks like chlorosis/necrosis/wilting/hot spot” | Narrow the inspection; choose a test | A specific pathogen or pest |
| **L3. Cause hypothesis** | “RPW is plausible; salinity is also plausible” | Ranked differential diagnosis with confidence | A final diagnosis without confirmation |
| **L4. Confirmed diagnosis** | “RPW larvae confirmed by lab/field dissection” or “salinity confirmed by soil test” | Treatment decision with accountability | Guaranteed treatment success |
| **L5. Prescription** | “Apply product X at dose Y to block Z under constraints” | Operational planning | Proof that the product works in that orchard |
| **L6. Outcome** | “Pest reduced / yield preserved / cost avoided” | Learning and ROI | Attribution without a design |

Most remote-sensing papers stop at L1–L2. Most product marketing implies L4. The gap is where trust and liability live.

### 3A.2 What remote sensing can actually do

UAV and satellite imagery can detect **spatial and temporal anomalies** in canopy color, temperature, texture, and structure. A systematic review of UAV orchard monitoring found that imagery plus neural networks is widely used for tree detection, health classification, and yield-related traits, but the studies are heterogeneous and rarely validated across orchards and seasons ([Popescu et al., 2023](https://doi.org/10.3389/fpls.2023.1237695)). A review focused on date palm found that UAV remote sensing for pest and disease monitoring is promising but still dominated by proof-of-concept studies, with limited operational validation ([Alsadik et al., 2024](https://doi.org/10.3390/rs16234371)).

The practical implications are:

- **Vegetation indices are sensitive to many stresses.** NDVI, NDRE, and similar indices respond to chlorophyll, water, and structure. They do not distinguish drought from salinity from root disease from nutrient deficiency.
- **NDVI saturates in dense, healthy canopies.** A 2025 study in `ISPRS Journal of Photogrammetry and Remote Sensing` documented the saturation problem and proposed mitigation, but the core lesson is that NDVI alone is a poor differentiator in high-biomass orchards ([Tian et al., 2025](https://doi.org/10.1016/j.isprsjprs.2025.06.013)).
- **Thermal imagery is not a disease detector.** Canopy temperature reflects stomatal conductance, water status, wind, and sun angle. It can flag stress, but it cannot identify the pathogen.
- **Tree-level mapping is hard from free satellite data.** Sentinel-2 has 10–20 m visible/NIR/SWIR pixels (with 60 m atmospheric bands), which is often larger than an individual fruit-tree crown. Tree-level work generally needs UAV or very-high-resolution imagery; individual tree crown detection from optical remote sensing is an active research area, not a solved commodity ([Zheng et al., 2023](https://arxiv.org/abs/2310.13481); [Copernicus Sentinel-2 documentation](https://documentation.dataspace.copernicus.eu/Data/SentinelMissions/Sentinel2.html)).
- **Image models degrade in the field.** A 2025 review of plant disease detection reports lab accuracies around 95–99% but field accuracies around 70–85%, with some models dropping much further under domain shift; the widely used PlantVillage benchmark is not a field benchmark ([Shafay et al., 2025](https://doi.org/10.1186/s13007-025-01450-0)). This is the single most important caution for any “AI diagnosis” claim.

### 3A.3 Date palm and red palm weevil evidence

Date palm is a difficult diagnostic target because the economically important pest, RPW, spends much of its life inside the trunk. Early infestation may produce no visible canopy symptom. Detection methods include visual inspection, traps, acoustic sensors, thermal imagery, and volatile/optical methods.

Key findings:

- **Thermal UAV detection is possible but seasonal and limited.** A 2023 study in `Remote Sensing` detected RPW-related thermal anomalies in date palm from June onward, with limited validation and a need for larger datasets ([Delalieux et al., 2023](https://doi.org/10.3390/rs15051380)). This is a promising signal, not an operational early-warning system.
- **Optical methods are not a silver bullet.** A 2020 field evaluation of non-invasive RPW detection found thermal detection at about 61% versus visual detection at about 87%, while some other optical studies report much higher numbers ([Khawaja et al., 2020](https://doi.org/10.1016/j.sjbs.2019.10.010)). The contradiction matters: sensor performance depends on infestation stage, palm cultivar, time of day, and the reference method.
- **Acoustic/seismic sensing is a different, more direct modality.** A 2024 field study used seismic sensors to detect RPW larval activity and support management decisions in date palm plantations ([Mendel et al., 2024](https://doi.org/10.1002/ps.7836)). This supports the idea of in-tree or in-block sensors for high-value palms, not a canopy-image diagnosis.
- **A `Phoenix canariensis` study is not a commercial date-palm study.** Casas et al. (2023) used UAV multispectral imagery and machine learning to detect disease in palm groves of `Phoenix canariensis` (Canary Island date palm), reporting random-forest precision around 0.93 for infected and 0.77 for healthy palms and accuracy around 0.87 ([Casas et al., 2023](https://doi.org/10.3390/rs15143584)). That is a useful proof-of-concept, but it should not be generalized to commercial `Phoenix dactylifera` or to RPW. The species difference is material: the two palms differ in canopy structure and infestation biology, so a model validated on one should not be assumed to transfer to the other.
- **RPW is present in Pakistan.** A 2026 study in `Pakistan Journal of Zoology` documented RPW in Khairpur, Sindh, and evaluated management techniques ([Buriro et al., 2026](https://doi.org/10.17582/journal.pjz/20260523034541)). This supports local relevance, not a specific loss estimate. Older loss figures should be treated cautiously unless re-measured.

The honest product claim is therefore:

> “We can help you find palms and blocks that need inspection, and we can organize the evidence and follow-up. We cannot yet tell you from an image alone that a palm has RPW.”

### 3A.4 Global orchard evidence beyond date palm

The broader orchard literature supports **scouting prioritization** more than **confirmed diagnosis**:

- UAV multispectral and RGB imagery can map tree crowns, gaps, vigor, and stress zones in apple, citrus, olive, and vine systems.
- Disease detection studies often use a single orchard, a single season, and a small number of trees. They rarely report performance under variable weather, cultivars, pruning, or sensor settings.
- Lab and greenhouse studies often use controlled inoculation and uniform backgrounds; field studies deal with mixed symptoms, occlusion, and co-occurring stresses.
- Yield prediction from imagery is even less reliable than stress detection; it depends on flowering, fruit set, drop, and post-harvest factors that imagery may not capture.

A 2023 systematic review of UAV orchard monitoring is useful for the range of applications, but it is not evidence that any particular algorithm will work in a Pakistani date-palm orchard ([Popescu et al., 2023](https://doi.org/10.3389/fpls.2023.1237695)). The 2024 date-palm-focused review reaches a similar conclusion: promise, but limited operational validation ([Alsadik et al., 2024](https://doi.org/10.3390/rs16234371)).

### 3A.5 Detection vs classification vs confirmation

This distinction should be visible in the product:

| Question | What the system can do now | What the system must not do |
|---|---|---|
| Is there an anomaly? | Compare a block/tree to its baseline, neighbors, or a reference; flag it | Claim a cause |
| What are the plausible causes? | Rank hypotheses using imagery, weather, soil, phenology, pest models, and scout notes | Present a ranked list as a diagnosis |
| Which cause is present? | Request a scout visit, trap check, soil/water test, lab sample, or dissection | Guess and recommend a pesticide without confirmation |
| What should be done? | Propose a treatment with dose, timing, and constraints; require agronomist approval | Auto-dispatch a spray |
| Did it work? | Compare pre/post scouting, trap counts, lab results, yield, and cost | Infer success from a completed job record |

A useful UI pattern is a **hypothesis card**:

- **Observation:** “Block 4, palm row 12, NDRE dropped 18% vs 3-year baseline.”
- **Confidence:** “Moderate.”
- **Hypotheses:** RPW (plausible, because of local trap catches), salinity (plausible, because of irrigation water EC), waterlogging (less likely, because of soil moisture), nutrient deficiency (possible).
- **What would confirm:** “Inspect the crown/trunk; check traps; sample soil/water; send a lab sample if symptoms are ambiguous.”
- **Do not:** “Spray insecticide.”

This is less impressive than a red “DISEASE DETECTED” banner, but it is more defensible and more useful.

### 3A.6 Satellite vs UAV vs ground sensors vs scouting

| Method | Strength | Limitation | Best use |
|---|---|---|---|
| **Free satellite (Sentinel-2)** | Regular revisit (about 5 days with two satellites), broad coverage, low cost | 10–20 m pixels; clouds; mixed pixels; not tree-level; indices saturate | Block-level trends, zoning, change detection, prioritization |
| **Commercial VHR satellite** | Higher resolution; tasking | Cost; tasking latency; clouds; still not a diagnosis | Targeted high-value blocks |
| **UAV multispectral** | Centimeter-level; flexible timing; tree-level | Cost, pilot, weather, processing, calibration; small coverage per flight | Tree-level scouting maps, trials, problem blocks |
| **Thermal UAV** | Canopy temperature/stress | Confounded by weather, water, sun; not pathogen-specific | Irrigation stress, some pest/anomaly screening |
| **Ground sensors** | Continuous, local, direct | Sparse; calibration; power/connectivity; represents one point | Soil moisture, trunk/soil temperature, acoustic RPW sensing |
| **Human scouting** | Context, touch, smell, dissection, judgment | Labor, bias, inconsistent records, slow | Confirmation and ground truth |
| **Lab tests** | Specific and defensible | Cost, turnaround, sampling error | Confirming cause; regulatory/insurance evidence |

The best current system is **not** “replace the scout with AI.” It is “use remote sensing to decide where the scout should go, and use the scout/lab to create labels that improve the next season.”

### 3A.7 Pakistan-specific diagnosis issues

- **RPW is a real local problem**, at least in Sindh date-growing areas ([Buriro et al., 2026](https://doi.org/10.17582/journal.pjz/20260523034541)). A local pilot should include RPW as a target, but with trap and dissection confirmation, not image-only labels.
- **Salinity and waterlogging are widespread.** An older FAO country profile, citing the Soil Survey of Pakistan (1985–1990), reports about 1.78 million hectares of severely saline soils and 0.18 million hectares of very severely saline soils in Pakistan, and about 2.39 million hectares with a water table within 1.5 m of the surface in June 1989 ([FAO, n.d.](https://www.fao.org/4/w4356e/w4356e0o.HTM)). These are historical figures, not current estimates, but they show the scale of the constraint. These stresses can look like disease or nutrient deficiency in imagery.
- **Groundwater and energy distortions affect irrigation decisions.** Qureshi et al. (2010) describe roughly 0.8 million private tube wells in Pakistan, with more than 90% used for agriculture, and note that Balochistan's electricity subsidy (about Rs 8.5 billion/US$140 million) reached a small share of farmers ([Qureshi et al., 2010](https://doi.org/10.1007/s11269-009-9513-3)). A recommendation that ignores energy cost or subsidy may be agronomically right but economically wrong.
- **Local labels are scarce.** Public datasets are dominated by lab/benchmark images, not Pakistani orchard conditions. A model trained elsewhere should be treated as a prior, not a local diagnostic.
- **Extension and lab capacity vary.** The pilot must identify a laboratory that can confirm the target pests/diseases and a turnaround time that fits the decision window.

### 3A.8 Diagnosis verdict and product implications

**Verdict:** **READY-FOR-PROTOTYPE** for anomaly detection, scouting prioritization, evidence capture, and lab/agronomist workflow. **NEEDS-FIELD-VALIDATION** for cause-ranked diagnosis. **EXPERIMENTAL** for image-only confirmation of RPW or other lethal pests.

**Build now:**

- Block/tree anomaly detection with a visible baseline and confidence.
- Scout task generation with routing and offline forms.
- Photo, audio, trap, and lab evidence attached to a location.
- Hypothesis ranking with explicit “what would confirm” prompts.
- Agronomist review and sign-off.
- A label store for confirmed cases, including negative cases.

**Do not build yet:**

- A generic “disease classifier” marketed as a diagnosis.
- Automated pesticide recommendations from imagery alone.
- A claim that the system can detect RPW before visual symptoms at commercial accuracy.

**Success measure for diagnosis:** at least one target (e.g., RPW or a nutrient/salinity issue) with **lab/agronomist-confirmed ground truth**, precision ≥0.8 and recall ≥0.7 on held-out blocks, and a false-alert rate low enough that scouts trust the queue. If the system cannot beat a simple “scout the hot spots” baseline, it is not adding value.

---

## 3B. Treatment, spraying, and fumigation

### 3B.1 Separate the decision from the execution

A treatment feature has four distinct layers:

1. **Diagnosis and target selection:** what problem, which block, which pest/life stage, what threshold.
2. **Prescription:** product, formulation, dose, water volume, nozzle/droplet, timing, interval, pre-harvest interval (PHI), re-entry interval (REI), buffer zones, resistance management.
3. **Execution:** who applies it, with what equipment, under what weather, with what records.
4. **Outcome:** efficacy, phytotoxicity, resistance, residue, cost, and off-target effects.

Software can add value at layers 1, 2, and 4 immediately. Layer 3 is where the safety, regulatory, and liability risk sits. **FieldWise should not conflate a prescription with an execution capability.**

### 3B.2 What the spray evidence says

Drone spraying is not new, but its performance is highly context-dependent.

- **Apple orchard trial:** Wang et al. (2022) evaluated a six-rotor UAV in an orchard operation mode. The rotor downwash helped deposition in small/sparse trees, but dense, tall canopies were harder to penetrate, and underside coverage was weak ([Wang et al., 2022](https://doi.org/10.1002/ps.6875)). This is directly relevant to date palm, where the canopy is tall and the target (RPW) is often in the trunk/axils, not on the outer leaves.
- **European orchard comparison:** Godyń et al. (2025) compared drone and conventional orchard spraying under European conditions and found drift and insufficient deposition uniformity for drone application relative to conventional sprayers in apple orchards ([Godyń et al., 2025](https://doi.org/10.3390/agriculture15232467)). This is a negative finding that should be taken seriously.
- **Industry best-practice review:** The UAPASTF response to regulators summarizes calibration, release height, volume, speed, spray quality, drift management, and recordkeeping ([Portillo et al., 2025](https://doi.org/10.3390/drones9060388)). It is useful as an operational checklist, but it is an industry position paper, not independent efficacy evidence.
- **India's SOP:** India's 2021 standard operating procedure for drone pesticide application specifies pre-application, during-application, and post-application requirements, critical parameters, pesticide registration for drone use, and a spray monitoring form ([Government of India, 2021](https://croplifeindia.org/wp-content/uploads/2022/03/Drone-SOP-Final.pdf)). It is a regulatory/operational template, not proof of orchard efficacy.
- **US extension guidance:** Ohio State University Extension notes that drone spraying is expanding, but optimal equipment configurations, drift management, and regulatory labels are still evolving ([OSU CFAES, 2024](https://cfaes.osu.edu/fact-sheet/drones-spraying-pesticides-opportunities-and-challenges)). The original URL has changed; use the current CFAES Knowledge Hub page.

The consistent theme: **drone spraying can work in some field crops and some orchard geometries, but dense, tall, high-value canopies are a difficult case.** Date palm is a difficult case.

### 3B.3 The specific problem with date palm

Date palm presents several challenges:

- **Height:** mature palms can be 10–20 m or more; spray droplets must penetrate and deposit on the target.
- **Canopy structure:** fronds form a dense crown; the trunk/axils (where RPW larvae feed) are shielded.
- **Target location:** many pests are not on the outer leaf surface. A spray that wets the outside of the crown may not reach the pest.
- **Product choice:** some treatments are trunk-injected or applied as a paste; others are soil-applied; not all are suitable for aerial application.
- **Non-target risk:** date palms are often near homes, water channels, livestock, and other crops; drift and residues matter.
- **Worker safety:** application may require climbing, pruning, or handling infested material; this is not a pure drone problem.

A drone can be useful for **survey, mapping, and maybe targeted vector/adult control**, but it is not a proven replacement for trunk injection, sanitation, trapping, or careful ground application in date palm.

### 3B.4 Regulatory evidence: aerial application is a regulated activity

Aerial pesticide application is not ordinary software-enabled farm work. The FAO/WHO 2024 guidance states that aerial application should be part of integrated pest management, with trained/certified operators, appropriate equipment, meteorological monitoring, buffer zones, and records ([FAO & WHO, 2024](https://doi.org/10.4060/cc8321en)). The guidance is authoritative on the risk-management expectations.

National examples show how strict the gate is:

- **United Kingdom:** HSE states that aerial spraying, including by drone, requires an aerial spraying permit; the permit must reference each application, and there are no commercial on-label authorizations for drone pesticide application — only permits for extrapolated trials ([UK HSE, n.d.](https://www.hse.gov.uk/pesticides/using-pesticides/general/aerial-spraying.htm)). This is a high-capacity regulator with a mature pesticide system, and it still treats drone spraying as exceptional.
- **United States:** EPA regulates pesticides and label directions; drone application is only lawful where the label and state requirements allow it. EPA's soil-fumigant buffer-zone guidance illustrates the level of specificity: buffer distances depend on application method, rate, field size, and credits, with a minimum and maximum range ([US EPA, n.d.](https://www.epa.gov/soil-fumigants/calculating-buffer-zones-guide-applicators)). A software “dispatch” button cannot substitute for a label and a certified applicator.
- **India:** the 2021 SOP requires drone-specific pesticide registration, trained pilots, defined operating parameters, and records ([Government of India, 2021](https://croplifeindia.org/wp-content/uploads/2022/03/Drone-SOP-Final.pdf)).

The implication for Pakistan is not “it is banned forever” or “it is now allowed.” It is “the specific operation must be legally authorized, and the authorization is not established by a generic drone registration.”

### 3B.5 Pakistan's regulatory position is unsettled

Pakistan has several overlapping instruments and signals:

| Instrument/signal | What it says | What it does not settle |
|---|---|---|
| **Agricultural Pesticides Ordinance, 1971 and Rules, 1973** | Framework for pesticide registration, labeling, and enforcement ([FAOLEX consolidated text](https://faolex.fao.org/docs/pdf/pak4115.pdf)) | Whether a drone application is a permitted method for a given product |
| **Department of Plant Protection (DPP) 2022 statement** | “All the usage of drone in private sector for agriculture purposes is illegal and unlawful” ([DPP, 2022](https://plantprotection.gov.pk/tag/pesticide-registration/)) | Whether this position has been superseded in practice |
| **Civil Unmanned Aircraft Rules, 2024** | Creates drone registration, weight classes, remote pilot licensing, and operating rules ([Dawn, 2024](https://www.dawn.com/news/1841590); [Unmanned Airspace, 2024](https://www.unmannedairspace.info/uncategorized/pakistan-issues-new-rules-on-uas-registration/)) | Whether pesticide application is authorized; whether procedures are operational |
| **PCAA implementation** | Press reports and a third-party account indicate that the Civil UAS Rules and procedures were still under development in September 2025 ([Drone Laws Pakistan, 2025](https://drone-laws.com/drone-laws-in-pakistan)) | Timelines, provincial variation, and enforcement |
| **NAFSA Ordinance 2025 / NAFSA Act 2026** | Creates a National Agri-Trade and Food Safety Authority and a transition path for pesticide regulation ([NAFSA Act 2026](https://na.gov.pk/uploads/documents/6965f5957687e_838.pdf)) | Implementing regulations, provincial roles, and drone-specific approvals |
| **Balochistan High Court research memorandum** | Warns that the 2025 ordinance repealed the APO and could create an intra-provincial regulatory vacuum ([High Court of Balochistan, 2025](https://rc.bhc.gov.pk/research-memorandum/pesticide.pdf)) | How other provinces will enforce; whether the 2026 Act resolves it |

The practical conclusion: **do not build a business on either the old ban or the new framework being fully operational.** Obtain written confirmation from the relevant federal and provincial authorities for each crop, product, drone class, and operator. Until then, treat drone spraying as a **partner-led, permitted trial activity**, not a commercial feature.

There is also a **drone-specific label gap**: no public evidence was found of a Pakistani pesticide label or approval that explicitly authorizes aerial drone application for orchards. A registered pesticide is not automatically registered for drone application. This is a common regulatory trap.

### 3B.6 Fumigation is a different risk category

Fumigation is not “spraying with a different product.” Soil fumigants are volatile, acutely toxic, and regulated with buffer zones, application restrictions, notification, and certified-applicator requirements. EPA's buffer-zone guidance shows that distances depend on the fumigant, rate, application method, field size, and credits; the minimum is 25 feet and the maximum can be half a mile, with credits up to 80% for certain practices ([US EPA, n.d.](https://www.epa.gov/soil-fumigants/calculating-buffer-zones-guide-applicators)).

Fumigation also has:

- **Acute worker and bystander risk:** exposure can cause serious illness or death.
- **Environmental risk:** volatility, groundwater, and non-target effects.
- **Equipment and training requirements:** specialized injection/tarping equipment, monitoring, and emergency response.
- **Recordkeeping and notification:** labels, permits, and local requirements.
- **Limited drone relevance:** fumigants are typically soil-injected or shank-applied, not sprayed from a drone. A drone may be useful for mapping or monitoring, not for fumigant application.

**Recommendation:** do not build fumigation execution, dispatch, or “dosage recommendation” into the product. If a customer needs fumigation, refer to a licensed fumigation contractor and record the service. The software can hold the recommendation, the contractor's certificate, the buffer-zone check, and the post-treatment record, but it must not pretend to control the operation.

### 3B.7 Economics: drones are not automatically cheaper

The University of Missouri Extension cost guide is one of the more transparent public analyses. It estimates, in a US context, about **$12.27/acre for farmer-owned drone application at 1,000 acres**, about **$7.39/acre for a custom operator at 4,000 acres**, about **$16/acre for custom hire**, and about **$12.50/acre for a crop duster**, with a break-even around **980 acres** for the modeled ownership case ([Rocha et al., 2025](https://extension.missouri.edu/publications/g1274)). These numbers are US-specific and depend on labor, fuel, insurance, depreciation, and utilization. They should not be transplanted to Pakistan without local quotes.

The cost drivers are:

- **Capital:** drone, batteries, charger, generator, nozzles, pump, tank, transport.
- **Utilization:** acres per season; idle time is expensive.
- **Labor:** certified pilot, spotter, maintenance, logistics.
- **Regulatory/compliance:** registration, permits, insurance, records, training.
- **Product and water:** dose, concentration, number of passes.
- **Risk:** drift liability, crop damage, accidents, insurance premiums.
- **Maintenance:** batteries degrade; pumps/nozzles wear; firmware and parts.
- **Weather:** wind, heat, rain, and visibility reduce operable hours.

For a 5–20 ha orchard, ownership is unlikely to be efficient unless the drone also serves other crops or a service business. **Contracting a licensed operator is usually the rational first step.** The product should support “request a service” and “verify the record,” not force a hardware purchase.

### 3B.8 Operational requirements if a customer insists on drone spray

If FieldWise supports a partner-led drone spray trial, the minimum data model is:

- **Block and target:** geometry, crop, cultivar, phenology, pest/disease, threshold.
- **Product:** registered name, active ingredient, formulation, label rate, max rate, PHI, REI, resistance group, compatibility.
- **Mix:** water volume, concentration, adjuvant, tank sequence, batch.
- **Equipment:** drone model, nozzle type, droplet spectrum, number of nozzles, pump setting, release height, speed, swath, flow rate.
- **Weather:** temperature, humidity, wind speed/direction, inversion risk, rain forecast, delta T.
- **Sensitive areas:** water bodies, homes, schools, livestock, apiaries, organic fields, public roads, buffer distances.
- **People:** licensed pilot, spotter, applicator, PPE, re-entry warning.
- **Records:** start/end time, GPS track, area treated, product used, deviations, incident report.
- **Verification:** deposition cards/water-sensitive paper, drift observations, efficacy scouting, residue testing if required.
- **Outcome:** pest reduction, crop injury, yield, cost, complaints.

The product should **refuse to generate a job** if the product is not registered for the crop/method, the operator is not licensed, the weather is outside limits, the buffer zone is violated, or the approval is missing.

### 3B.9 Spraying verdict and product implications

**Verdict:** **READY-FOR-PROTOTYPE** for treatment recommendation, approval, and job records. **EXPERIMENTAL/NEEDS-FIELD-VALIDATION** for orchard drone spray, especially in date palm. **DEFER** for fumigation execution.

**Build now:**

- A treatment knowledge base with label constraints, PHI/REI, resistance groups, and local registration status.
- A prescription object that cannot be dispatched without approval and a licensed operator.
- A weather/buffer/sensitive-area check.
- Job records with planned vs actual and deviation reasons.
- Outcome capture: efficacy, phytotoxicity, cost, complaints.
- A “service provider” mode for licensed contractors.

**Do not build yet:**

- Autonomous spray execution.
- A generic “drone spray” recommendation for date palm.
- Fumigation dosing or dispatch.
- A marketplace that implies regulatory approval before it exists.

**Success measure for spraying:** 100% of jobs have an approved prescription, a licensed operator, a weather check, a buffer-zone check, and a completed record; measured deposition/drift in a local trial is within accepted limits; biological efficacy is non-inferior to the farmer's conventional practice; no off-target incidents. If those cannot be shown, the product remains advisory.

---

## 3C. Drip and sprinkler irrigation monitoring and control

### 3C.1 What is being monitored

Irrigation is a control problem with a slow, noisy feedback loop. The relevant variables are:

- **Soil water:** volumetric water content or matric potential at one or more depths; root-zone storage.
- **Plant water status:** canopy temperature, stem water potential, sap flow, or visual stress.
- **Weather:** reference evapotranspiration (ET₀), rainfall, temperature, humidity, wind, solar radiation.
- **Hydraulics:** flow, pressure, valve state, pump status, filter differential pressure, tank level, energy use.
- **Crop:** species, cultivar, phenology, root depth, salinity tolerance, yield target.
- **Management:** irrigation schedule, valve/block configuration, emitter rate, spacing, run time, maintenance.

No single sensor measures “the right irrigation.” The product has to combine sparse sensors, weather, crop coefficients, and hydraulic data, and it has to show uncertainty.

### 3C.2 ET-based scheduling is established, but not plug-and-play

FAO-56 remains the standard reference for computing crop evapotranspiration and irrigation requirements ([Allen et al., 1998](https://www.fao.org/3/x0490e/x0490e00.htm)). The basic approach is:

- Compute ET₀ from weather data.
- Apply a crop coefficient (Kc) for the crop and growth stage.
- Adjust for soil water, salinity, and management constraints.
- Convert to run time using emitter rate, spacing, and application efficiency.

Pereira et al. (2015) review the FAO56 approach and its evolution, including the need for local calibration and the limitations of generic Kc values ([Pereira et al., 2015](https://doi.org/10.1016/j.agwat.2014.07.031)). The method is well established, but the **local implementation** is where errors occur:

- A generic Kc for “date palm” may not match the cultivar, climate, canopy size, or ground cover.
- Weather data from an airport or regional grid may not represent the orchard.
- Rain, frost, heat waves, and dust storms change the calculation.
- Soil water storage and rooting depth are uncertain.
- Salinity requires leaching fractions and yield-response adjustments.
- Drip/sprinkler distribution uniformity is rarely measured.

The product should therefore present an **ET-based recommendation with a range**, not a single “correct” number of minutes.

### 3C.3 Soil and plant sensors: useful, but maintenance-heavy

A 2026 University of Arizona extension guide is a practical summary of the failure modes: sensors need correct installation, soil-specific calibration, regular checking, and maintenance; readings can drift or become unrepresentative due to air gaps, rodent damage, cable issues, and changing soil conditions ([Elshikha et al., 2026](https://extension.arizona.edu/publication/guide-maintaining-and-calibrating-field-installed-soil-and-plant-moisture-sensors)). The guide is E3 (extension), but it reflects well-established field practice.

Key realities:

- **One sensor is not a block.** Soil moisture varies with texture, elevation, emitter placement, and root distribution. A single probe can be misleading.
- **Calibration matters.** Capacitance sensors are sensitive to soil salinity, temperature, and installation. Manufacturer calibrations are generic; local calibration is better.
- **Depth matters.** Surface readings may miss deep percolation or deep-root uptake. Date palm roots can explore deep profiles.
- **Power and connectivity matter.** Solar/battery and LoRaWAN/NB-IoT can work, but installation quality determines uptime.
- **Sensor failure is normal.** The product must detect stuck values, impossible jumps, and flatlines, and must degrade to weather/ET advisory rather than silently recommending a wrong schedule.

### 3C.4 Remote sensing of root-zone moisture is indirect

Satellite and UAV remote sensing can estimate surface soil moisture and vegetation water stress, but root-zone moisture is harder. A 2023 review of root-zone soil moisture estimation found a wide range of methods (optical, thermal, microwave, data assimilation, machine learning), with trade-offs in spatial resolution, depth, and validation ([Li et al., 2023](https://doi.org/10.3390/rs15225361)). The practical conclusion:

- **Surface soil moisture** can be mapped at coarse resolution.
- **Root-zone storage** is usually inferred, not measured.
- **Vegetation indices** integrate water stress over time and can lag the actual depletion.
- **Crop water stress index (CWSI)** is sensitive to soil water dynamics, but its performance depends on the method and the degree of depletion; Katimbo et al. (2022) found greater sensitivity when depletion exceeded about 80% ([Katimbo et al., 2022](https://doi.org/10.1016/j.agwat.2022.107575)). That is late for many decisions.

Remote sensing is best used for **zoning and anomaly detection**, not as a replacement for soil moisture probes or a water balance.

### 3C.5 Controllers and integrations

The integration landscape is fragmented:

| Platform | Integration reality | Implication |
|---|---|---|
| **Rain Bird IQ4** | Cloud platform with a partner/API program; access and permissions depend on account roles and authorization ([Rain Bird, n.d.](https://www.rainbird.com/professionals/iq4-product-development-update-new-bms-Integration)) | Good candidate for a read/write integration, but commercial terms and certification apply |
| **Rachio** | Public cloud API documented for developers ([Rachio API docs](https://rachio.readme.io)) | Easier prototype path; cloud dependency; user authorization required |
| **Hydrawise** | Cloud API with terms of use; access is not a free-for-all ([Hydrawise API terms](https://www.hunterirrigation.com/support/hydrawise-api-terms-use)) | Feasible but must respect vendor terms and cloud-only architecture |
| **OpenSprinkler** | Open-source controller with local/HTTP API and firmware documentation ([OpenSprinkler firmware](https://github.com/OpenSprinkler/OpenSprinkler-Firmware)) | Best for lab/field pilots and vendor-neutral control; requires more integration work |
| **SDI-12 sensors** | Standard serial-digital interface for microprocessor-based sensors, version 1.4 (2021) ([SDI-12 Support Group, 2021](https://www.sdi-12.org/current_specification/SDI-12_version-1_4-Jan-30-2021.pdf)) | Good sensor abstraction; still need installation, calibration, and logging |
| **John Deere Operations Center** | API for field operations and machinery data ([John Deere developer](https://developer.deere.com/precision/get-started)) | Relevant for large mechanized farms, less so for small orchards |

The product should define a **controller abstraction**:

- `read_state`: valves, schedules, flow, pressure, faults.
- `read_history`: run times, water events, alarms.
- `propose_schedule`: a recommendation, not an automatic write.
- `apply_schedule`: only with approval, limits, and audit.
- `manual_override`: always available to the farmer.
- `fail_safe`: close valves / hold schedule on uncertainty.

Do not build a different integration for every controller. Build one abstraction and a small number of certified adapters.

### 3C.6 Date palm water requirements and salinity

Date palm is drought-tolerant but productive only with adequate water. Two studies give a useful range:

- Dewidar et al. (2015) used lysimeters for surface drip-irrigated date palm in Saudi Arabia and derived water requirements and crop coefficients ([Dewidar et al., 2015](https://www.interesjournals.org/articles/lysimeter-based-water-requirements-and-crop-coefficient-of-surface-dripirrigated-date-palm--in-saudi-arabia.pdf)).
- Al-Omran et al. (2019) combined actual applied water and Penman–Monteith calculations in Saudi Arabia, reporting crop water requirements and Kc values, and expressed water needs per tree under different ETc replacement levels ([Al-Omran et al., 2019](https://doi.org/10.1007/s13201-019-0936-6)).

Taken together, the evidence supports a **wide range** (roughly 87–297 L/day, with an average around 182 L/day, and Kc roughly 0.74–0.91 in the cited conditions), depending on climate, canopy, soil, and replacement level. The exact numbers are less important than the principle: **date palm water use is site-specific and seasonal, and a generic schedule is unsafe.**

Salinity is a first-order constraint in Pakistan. An older FAO country profile documents extensive salt-affected soils and shallow water tables in the Indus Basin ([FAO, n.d.](https://www.fao.org/4/w4356e/w4356e0o.HTM)); the figures are historical, so they should be updated with current provincial data. Date palm is relatively salt-tolerant, but yield still declines with salinity, and irrigation water with high EC requires a leaching fraction. A scheduling product that ignores salinity can recommend “efficient” water use that slowly salinizes the root zone.

### 3C.7 Pakistan-specific irrigation context

- **Groundwater is the buffer, but it is stressed.** Qureshi et al. (2010) describe about 0.8 million private tube wells, with more than 90% of groundwater used for agriculture, and note the energy subsidy distortions in Balochistan ([Qureshi et al., 2010](https://doi.org/10.1007/s11269-009-9513-3)).
- **Freshwater scarcity is macro-critical.** Pakistan's Planning Commission reports that per-capita water availability has fallen from more than 5,000 m³ at independence to about 850 m³, below the 1,000 m³ scarcity threshold ([Planning Commission, 2026](https://pc.gov.pk/uploads/pub/national-water-security-23-09-2026.pdf)).
- **Drip subsidies exist but are uneven.** Punjab's official FAQ describes a 75% subsidy up to 7.5 acres and 60% above 7.5 acres for drip, up to 12.5 acres, with similar support for solar ([Punjab Agriculture Department, n.d.](https://agripunjab.gov.pk/wm-faqs)). The exact terms should be verified before citing in a sales proposal.
- **Rural connectivity is improving but not universal.** DataReportal's 2025 Pakistan report and ITU/ProPakistani data show a persistent rural–urban gap; roughly half of rural adults use mobile internet, and internet-enabled phone ownership is lower than total phone ownership ([DataReportal, 2025](https://datareportal.com/reports/digital-2025-pakistan); [ProPakistani, 2026](https://propakistani.pk/2026/09/17/only-half-of-rural-pakistani-adults-use-mobile-internet)). Offline-first is not optional.
- **Energy cost and reliability shape pumping.** A recommendation to irrigate at a certain time may conflict with load-shedding, tariff windows, or solar availability. The product should optimize for **water and energy**, not just soil moisture.

### 3C.8 Control safety: advisory vs closed-loop

Irrigation control is lower-risk than spraying, but it is not risk-free. An unauthorized valve opening can:

- Flood a block, leach nutrients, or waterlog roots.
- Waste water and energy.
- Apply poor-quality water to a salt-sensitive crop.
- Create a safety hazard (electrical, pump dry-run, erosion).
- Conflict with a worker in the field.

A safe progression is:

| Level | Capability | Requirements |
|---|---|---|
| **L0. Read-only monitoring** | See valve state, flow, pressure, soil moisture | Controller integration; no writes |
| **L1. Advisory** | Recommend schedule; farmer executes manually | ET, sensors, crop model, clear uncertainty |
| **L2. Approved one-click** | Farmer approves a schedule; system writes to controller | Authentication, limits, audit, manual override, dry-run |
| **L3. Bounded automation** | System adjusts within a pre-approved envelope | Flow/pressure/soil limits, rain hold, fault detection, kill switch |
| **L4. Fully autonomous** | System schedules without approval | Only after multi-season validation; likely not appropriate for most farms |

FieldWise should target **L0–L2** in the first product and **L3 only in a single pilot block** after validation. L4 is not a near-term goal.

### 3C.9 Irrigation verdict and product implications

**Verdict:** **READY-FOR-PROTOTYPE** for monitoring, ET-based advisory, and controller read integration. **NEEDS-FIELD-VALIDATION** for approved writes and bounded automation.

**Build now:**

- Weather/ET ingestion and a transparent water-balance model.
- Soil moisture and flow/pressure ingestion with quality flags.
- Block-level irrigation recommendations with ranges and reasons.
- A controller abstraction with read-only adapters first.
- Alerts for leaks, dry-run, stuck valves, and sensor failures.
- An audit log for every recommendation, approval, and command.
- Offline-first mobile scouting and manual water-event records.

**Do not build yet:**

- Fully autonomous irrigation.
- A generic “water saving” percentage claim without a measured baseline.
- A controller integration that bypasses the vendor's terms or safety certifications.
- A recommendation that ignores salinity, energy, or labor constraints.

**Success measure for irrigation:** sensor uptime ≥90%; recommendation latency within one irrigation cycle; measured water use reduced by at least 10% (or energy cost reduced) without yield loss over two seasons; zero unauthorized valve events; farmer-reported trust and usability. If the farm cannot maintain sensors, the product should default to weather/ET advisory, not fake precision.

---

## 3D. Drone-assisted pollination

### 3D.1 The biology and the baseline

Pollination is not a spray problem. It is a **timing, viability, and delivery** problem:

- Pollen must be viable at the time of application.
- Female flowers must be receptive.
- The right pollen must reach the stigma in sufficient quantity.
- Weather (heat, wind, rain, humidity) affects both pollen and flower receptivity.
- In date palm, pollination is normally done by climbing the palm and placing male inflorescence or pollen on the female inflorescence, often several times per season.

FAO's date palm cultivation guidance notes that a worker may need to climb a date palm eight to ten times from pollination through harvest, and that mechanical pollination was developed where labor is expensive or unavailable ([FAO, 1999](https://www.fao.org/4/y4360e/y4360e0c.htm)). This is the real baseline: not “no pollination,” but **labor-intensive manual pollination**.

Liquid pollination is an alternative: pollen is suspended in water and sprayed onto the female inflorescence. ICARDA describes a cost-effective liquid pollination technology using standard ground-level jet equipment, with about 0.5–1 g pollen per liter ([ICARDA, n.d.](https://icarda.org/research/innovations/cost-effective-liquid-pollination-technology-date-palm-production)). This is important because it shows that **the liquid-suspension method is not inherently a drone method**; a drone is one possible delivery platform.

### 3D.2 Date palm evidence

The date palm drone evidence is mixed and often weaker than the marketing suggests.

| Study | Design | Key finding | Evidence strength and caveat |
|---|---|---|---|
| **Alyafei et al. (2022)**, `HortScience` | Drone with water-suspended pollen vs hand pollination (HP) and hand spray (HS) in three cultivars (Barhi, Lulu, Khesab) | Drone fruit set was lower than HP/HS in Lulu and Khesab, not significantly different in Barhi; Khesab pollen efficiency was lower; fruit set was commercially acceptable; authors call for more research | E3. A real field study, but limited sites/seasons; “commercially acceptable” is not “yield-equivalent.” |
| **Hassan et al. (2026)**, `Zoo Botanica` | UAV pollination trial in Chakwal, Pakistan; compared UAV treatments and manual | Manual yield was higher than UAV; UAV was faster and cheaper; best UAV treatment produced about 26.3 kg/palm at 2 m height and 1.5 m/s, 30–40% above other UAV treatments | E3. Low-tier, single-site, short duration; useful for local feasibility, not a commercial yield claim. |
| **Rehna & Inamdar (2022)**, `IJIRSS` | Drone pollination in Oman; reported 60–66% fruit set | Reported fruit set in a commercial range, but no manual control in the design | E4/E3. Weak evidence; cannot attribute fruit set to the drone without a control. |
| **AlRaeesi & El-Khazali (2026)**, `Scientific Reports` | AI-enabled drone framework using YOLOv5/YOLOv8; prototype/simulation | Reports labor/time/pollen efficiency and mAP; claims large labor and pollen reductions | E2/E3 for the computer-vision prototype, but **not** evidence of fruit set, yield, or fruit quality. The abstract's metrics are detection/efficiency, not agronomic outcomes. |
| **Salomon-Torres et al. (2024)**, `Emirates Journal of Food and Agriculture` | Ground liquid pollen suspension at 4 g/L vs control in Mejhoul date palm, Mexicali Valley, Mexico | Reported 68% fruit set vs 55% control | E2/E3. Supports liquid pollination, not drone delivery; single cultivar/location. |
| **Kadri et al. (2022)**, `Saudi Journal of Biological Sciences` | Pollination time, hour of day, pollen storage temperature/duration, viability, germinability, fruit set in Deglet Nour | Timing and storage affect pollen viability and fruit set | E2. Supports the importance of pollen handling; not a drone study. |

The pattern is clear:

- **Drone delivery can produce fruit set.** That is not the same as **yield superiority**.
- **Manual pollination often performs as well or better** in fruit set/yield, especially when done well.
- **The drone advantage is time/labor/access**, not necessarily agronomic performance.
- **Cultivar and timing matter**; a result in Barhi may not transfer to Medjool, Deglet Nour, or local Pakistani cultivars.
- **Pollen viability and storage** can dominate the result, independent of the delivery platform.

A 2026 `Scientific Reports` paper with an AI/drone framing should not be read as proof of yield benefit. Its abstract reports labor/time/pollen efficiency and detection metrics, not fruit set, yield, or quality. It is a prototype/simulation contribution, not a commercial field trial.

### 3D.3 Fruit trees, vegetables, and flowers

The evidence outside date palm is crop-specific and mostly supplemental:

- **Apples, cherries, almonds:** Dropcopter has claimed 25–50% yield increases from drone pollination, based on its own trial experience, as reported in trade media ([AOPA, 2019](https://www.aopa.org/news-and-media/all-news/2019/january/07/drones-deliver-pollen-better-fruit)). This is **E4 vendor/marketing** evidence. It may be true in specific orchards, but the methods, controls, and independent replication are not public in a form that supports a general claim.
- **Greenhouse tomatoes:** Arugga's “Polly” robot is a ground robot, not a drone, that uses air pulses to vibrate flowers; Biobest markets it alongside bumblebees and claims a 2–6% yield increase with bumblebees, one robot per hectare, about 10 hours of battery, and a 48-hour revisit ([Biobest, n.d.](https://www.biobest.com/en-BE/polly-pollination-robot)). This is **E4 vendor** evidence, but the agronomic rationale is plausible: greenhouse tomato pollination is labor-intensive and bumblebee availability can be constrained. It is not date palm and not a drone.
- **Kiwifruit:** Gao et al. (2025) developed a multinozzle targeting pollination robot for clustered kiwifruit flowers using air–liquid dual-flow spraying, reporting 93.4% targeting rate, 88.9% fruit set, and about 1.0 s/flower ([Gao et al., 2025](https://doi.org/10.1002/rob.22499)). This is a strong engineering prototype (TRL 5-ish), but it is crop-specific and not a commercial field-scale validation.
- **General review:** Broussard et al. (2023) conclude that most artificial pollination technologies **supplement** natural pollination; some crops can rely on artificial pollination alone, but the effectiveness is crop- and context-specific ([Broussard et al., 2023](https://doi.org/10.3390/agronomy13051351)). This is the right framing for the product: pollination is a managed input, not a universal replacement for bees or manual work.

For **open-field vegetables and flowers**, the economics are even more uncertain. Many crops are wind- or insect-pollinated; drone delivery may be unnecessary, ineffective, or harmful to pollinators. The product should not offer a generic “drone pollination” service across crops. It should require a crop-specific protocol and a control.

### 3D.4 What is proven vs not proven

| Claim | Evidence status | Product implication |
|---|---|---|
| A drone can deliver pollen suspension to date palm inflorescences | **Proven in principle** (Alyafei 2022; Hassan 2026) | Feasible to prototype |
| Drone pollination is faster/cheaper than manual climbing | **Plausible and locally reported** (Hassan 2026), but cost depends on labor, drone, pollen, and area | Measure cost per palm, not just time |
| Drone pollination produces fruit set in the commercial range | **Mixed**; cultivar-dependent; some studies show lower fruit set than manual | Do not promise equivalence |
| Drone pollination increases yield vs manual | **Not established**; some studies show manual higher | Do not sell yield uplift |
| Drone pollination improves fruit quality | **Not established** | Measure quality if claimed |
| AI can target individual flowers/inflorescences | **Prototype**; detection metrics do not equal pollination success | Keep as R&D |
| Drone pollination works for apples/almonds/cherries | **Vendor claims**, limited independent evidence | Treat as experimental |
| Drone pollination works for greenhouse vegetables | **Different technology** (ground robot/air pulses); not a drone | Do not conflate |
| Drone pollination is legal and approved in Pakistan | **Unsettled**; drone rules exist, pesticide/aerial application rules do not clearly authorize pollination | Obtain written confirmation |

### 3D.5 Operational, regulatory, and economic realities

**Operational:**

- Flowering windows are short; weather can close them further.
- Date palm inflorescences are high and may require precise positioning or upward airflow.
- Pollen is perishable; viability must be tested.
- The drone must avoid damaging fronds and avoid drift of pollen to non-target palms (genetic contamination is a real issue in date palm).
- Revisit intervals matter; one pass may not be enough.
- Post-flight cleaning matters to avoid pollen cross-contamination between cultivars.

**Regulatory:**

- Pollination is not pesticide application, but it is still drone operation. The Civil UAS Rules 2024 impose registration, weight-class, pilot licensing, and operating requirements ([Dawn, 2024](https://www.dawn.com/news/1841590)).
- If the pollen is treated as an agricultural input or if the operation is deemed aerial application, additional rules may apply. This needs legal clarification.
- Cross-border movement of pollen and plant material has phytosanitary rules. Local pollen sourcing is preferable.
- Privacy, land access, and noise complaints apply.

**Economic:**

- The value proposition is **labor avoided and timing gained**, not necessarily yield.
- Cost drivers: pollen (source, viability, quantity), drone and pilot, flight time, battery swaps, travel, weather downtime, supervision, and fruit-set measurement.
- In a high-wage, labor-scarce environment, drone pollination can make sense even at equal yield. In a low-wage, labor-abundant environment, the case is weaker unless timing/labor availability is the constraint.
- The technology must be compared with **ground liquid pollination**, which ICARDA and Salomon-Torres show can be effective without a drone.

### 3D.6 Pollination verdict and product implications

**Verdict:** **EXPERIMENTAL / NEEDS-FIELD-VALIDATION** for commercial date palm. **EXPERIMENTAL** for fruit trees and open-field vegetables/flowers. **Do not claim yield benefits.**

**Build now (only as a trial/workflow feature):**

- A pollination trial protocol and data capture module.
- Palm/inflorescence mapping and flight planning.
- Pollen viability and storage records.
- Treatment randomization, fruit-set counts, yield, and quality capture.
- Cost-per-palm calculation.
- Contractor/operator coordination and regulatory checklist.

**Do not build yet:**

- A commercial “drone pollination” SKU with a yield guarantee.
- An autonomous flower-targeting system for date palm.
- A generic multi-crop pollination claim.
- A comparison that ignores manual and ground liquid alternatives.

**Success measure for pollination:** fruit set and yield **non-inferior to manual pollination** within a pre-specified margin (e.g., 10% relative) across at least two cultivars and two seasons, at a lower cost per palm or a clear labor/timing benefit, with no quality penalty and no genetic contamination. If the trial cannot show that, the product should remain a research partnership.

---

# 4. Capability and maturity matrix

The matrix below is a product decision tool, not a technology wish list. “Evidence” refers to the specific capability, not the general field. “Maturity” is the realistic state for a Pakistani orchard deployment in 2026.

| Capability | Evidence | Technical maturity | Data readiness | Regulatory readiness | Operational readiness | Recommendation | Why |
|---|---|---|---|---|---|---|---|
| **Field boundary and block mapping** | E1 for GIS methods | Commercial | High; farmer/drone/GPS | Low risk | High | **BUILD NOW** | Foundation for everything; already partly present in the repo |
| **Satellite vegetation-index time series** | E1/E2 for anomaly detection | Commercial | Medium; clouds/mixed pixels | Low risk | Medium | **BUILD NOW** | Cheap, scalable; use for zoning and change detection, not diagnosis |
| **Weather and ET₀ ingestion** | E1 (FAO-56) | Commercial | Medium; local station/grid | Low risk | High | **BUILD NOW** | Required for irrigation and spray windows |
| **Scouting forms and photo evidence** | E1 for workflow; E2 for impact | Commercial | High if designed well | Low risk | Medium | **BUILD NOW** | Creates ground truth; improves trust |
| **Anomaly detection / scouting triage** | E2/E3 | Prototype to commercial | Medium; needs local baselines | Low risk | Medium | **BUILD NOW** | High value, low regulatory risk |
| **Cause-ranked diagnosis** | E3 for most orchard targets | Prototype | Low; local labels scarce | Low risk but liability | Low | **VALIDATE** | Needs confirmed cases and held-out blocks |
| **Lab confirmation loop** | E1 for lab methods; E3 for orchard workflow | Commercial labs exist | Medium; sample logistics | Low risk | Medium | **BUILD NOW** | Turns hypotheses into defensible diagnoses |
| **Treatment recommendation** | E2/E3; label-dependent | Commercial knowledge base possible | Medium; local products/labels | Medium; pesticide rules | Medium | **BUILD NOW (advisory)** | High customer value if constrained by labels and approval |
| **Spray job planning and records** | E2/E3 | Prototype | Medium | Medium | Medium | **BUILD NOW** | Traceability without execution risk |
| **Ground spray contractor coordination** | E2 | Commercial service | Medium | Medium | Medium | **BUILD NOW** | Uses existing licensed capacity |
| **Drone spray execution in orchards** | E3/E5; conflicting | Prototype | Low; local deposition data | **Low/unsettled** | Low | **VALIDATE / DEFER** | Dense canopy, drift, labels, permits, liability |
| **Fumigation execution** | E1 for hazard; E5 for software dispatch | Commercial but specialized | Low | High | Low | **DEFER** | Acute toxicity, buffer zones, certified applicators |
| **Soil moisture monitoring** | E1/E2 | Commercial | Medium; calibration | Low risk | Medium | **BUILD NOW (integrate)** | Mature hardware; integration and maintenance are the work |
| **Flow/pressure/valve monitoring** | E1/E2 | Commercial | Medium; controller-specific | Low risk | Medium | **BUILD NOW (read-only)** | Detects leaks, dry-run, and stuck valves |
| **ET-based irrigation advisory** | E1/E2 | Commercial | Medium; local Kc | Low risk | Medium | **BUILD NOW** | Strong value; transparent uncertainty |
| **Approved controller writes** | E2 | Prototype | Medium | Low/medium | Low/medium | **VALIDATE** | Needs safety limits, audit, and vendor terms |
| **Bounded closed-loop irrigation** | E3 | Prototype | Low | Low/medium | Low | **DEFER until pilot** | Small error can waste water or damage roots |
| **Drone pollination mission planning** | E3 | Prototype | Low | Medium (drone rules) | Low | **VALIDATE** | Useful for trials; not a commercial SKU |
| **Drone pollination execution** | E3/E4 | Prototype | Low | Unsettled | Low | **EXPERIMENTAL** | Mixed fruit-set/yield evidence; cultivar-specific |
| **AI flower/inflorescence targeting** | E2/E3 (lab/prototype) | Prototype | Low | Medium | Low | **EXPERIMENTAL** | Detection metrics ≠ pollination success |
| **Outcome measurement (yield, water, cost)** | E1 for measurement methods | Commercial | Low; farm records | Low risk | Medium | **BUILD NOW** | The only defense against false ROI claims |

## 4.1 Reading the matrix

Three patterns stand out:

1. **The highest-value, lowest-risk capabilities are data and workflow capabilities**, not autonomous machines. Boundaries, weather, scouting, lab loops, recommendations, approvals, and records are all buildable and directly useful.
2. **The riskiest capabilities are execution capabilities**: spray, fumigation, closed-loop irrigation, and pollination. They are also the ones most likely to be marketed as “AI” or “autonomous.”
3. **The evidence is weakest exactly where the capital requirement is highest.** Drone spray and drone pollination require hardware, pilots, permits, insurance, and field trials; the evidence base is thinner than the marketing.

This argues for a **workflow-first, hardware-agnostic** product. The moat is not the drone; it is the trusted record of what was observed, recommended, approved, done, and measured.

## 4.2 What “commercial” means here

A capability is “commercial” only if:

- It works across multiple farms/seasons without bespoke engineering.
- It has a clear support model.
- It is legal in the target jurisdiction.
- It has a cost structure that can be priced.
- It has evidence that customers will pay.

By that standard, **satellite monitoring, weather, scouting, recordkeeping, and irrigation advisory** are closest to commercial. **Cause-ranked diagnosis** is a prototype with commercial potential. **Drone spray and pollination** are field-validation projects, not products.

---

# 5. Build vs integrate

## 5.1 Decision rule

Build only what creates durable product differentiation or is unavailable commercially. Integrate everything else.

| Layer | Build or integrate? | Rationale |
|---|---|---|
| **Field boundaries / GIS** | **Build the workflow**, integrate basemaps and GPS | Core UX and data model; not a hard science problem |
| **Satellite imagery** | **Integrate** Sentinel-2/Planet/commercial providers | Commodity; no reason to own a satellite |
| **Weather** | **Integrate** local stations and forecast APIs | Commodity; quality varies |
| **Soil moisture sensors** | **Integrate** SDI-12/LoRaWAN/NB-IoT devices | Hardware is mature; calibration and installation are the work |
| **Irrigation controllers** | **Integrate** via vendor APIs; build abstraction | Vendor lock-in is real; do not rebuild controllers |
| **UAV imagery** | **Integrate** service providers or own a small fleet only for pilots | Capital and regulatory burden; service market exists |
| **Spray drones** | **Integrate** licensed contractors | High capital, high risk, uncertain utilization |
| **Pollination drones** | **Partner** for trials | Experimental; no commercial case yet |
| **Lab testing** | **Integrate** accredited labs | Not a software business |
| **Agronomy** | **Build the network and workflow**, not the agronomist | Human judgment is the product; software supports it |
| **AI models** | **Build** only for narrow, validated tasks; otherwise use/open models | Generic crop AI is a trap; local labels are the moat |
| **Payments / financing** | **Integrate** | Commodity |
| **Insurance** | **Integrate** | Specialized; partner |
| **Data platform / audit ledger** | **Build** | Core differentiation and trust |

## 5.2 Recommended architecture

A pragmatic architecture for the first 18 months:

1. **Ingestion layer**
   - Satellite provider API (Sentinel-2 first; commercial VHR on demand).
   - Weather API and local weather station.
   - Sensor gateway (LoRaWAN/NB-IoT/MQTT) with SDI-12 device profiles.
   - Controller adapters (Rain Bird, Rachio, Hydrawise, OpenSprinkler) behind one interface.
   - Mobile offline capture for scouts and farmers.
   - Lab result import (CSV/API).

2. **Canonical data model**
   - Farm → block → tree/row (optional) → observation → evidence → hypothesis → recommendation → approval → job → outcome.
   - Every record has `source`, `observed_at`, `geometry`, `confidence`, `provenance`, `model_version`, and `review_status`.

3. **Rules and models**
   - Deterministic agronomic rules first (ET, degree days, spray windows, buffer zones, PHI/REI, salinity leaching).
   - Statistical anomaly detection second (baseline deviation, spatial outliers, time-series change).
   - ML models only for narrow, validated tasks (e.g., tree crown delineation, pest trap image classification) with a human review loop.

4. **Workflow engine**
   - Task generation, assignment, due dates, escalation.
   - Approval gates and role-based access.
   - State machine: draft → proposed → approved → scheduled → dispatched → completed → verified → closed.
   - “Simulated” as an explicit state, never a hidden flag.

5. **Audit and safety**
   - Immutable audit log for recommendations, approvals, commands, and overrides.
   - Signed controller commands, allowlists, rate limits, and geofences.
   - Dry-run mode and manual override.
   - Alerting on sensor failure, command failure, and unexpected flow.

6. **Analytics**
   - Water use per block, energy cost, yield, fruit set, pest pressure, scouting time, cost per ha, avoided loss.
   - Baseline vs treatment comparisons with confidence intervals.

## 5.3 Data model implications

The existing `docs/fieldwise-schema.sql` is a good start: estates, sectors, sensors, alerts, and actions. The following additions are recommended:

- `observations`: generic fact table for images, scout notes, trap counts, lab results, sensor readings.
- `evidence`: files/links with checksum, capture time, location, and chain of custody.
- `hypotheses`: target, confidence, supporting/contradicting evidence, status.
- `recommendations`: product/action, dose, timing, constraints, evidence links.
- `approvals`: approver, role, timestamp, scope, conditions.
- `jobs`: planned vs actual, operator, equipment, weather, GPS track, deviations.
- `lab_results`: sample ID, method, result, lab, turnaround.
- `water_events`: block, valve, start/end, volume, source, energy, reason.
- `trial_plots`: treatment, randomization, replication, harvest data.
- `audit_log`: immutable event stream.
- `model_registry`: model version, training data, validation metrics, drift monitoring.

The schema should enforce **referential integrity** between a recommendation and its evidence, and between a job and its approval. A job without an approval should be impossible, not just discouraged.

## 5.4 Integration risks

| Risk | Mitigation |
|---|---|
| Vendor API changes or is withdrawn | Adapter layer; contract terms; fallback to manual records |
| Controller cloud outage | Local manual override; no dependency for safe shutdown |
| Sensor vendor lock-in | SDI-12/LoRaWAN standards; multi-vendor gateway |
| Satellite cloud cover | Multi-source imagery; weather-aware scheduling; UAV on demand |
| Lab turnaround too slow | Local lab partnerships; rapid tests; prioritize high-value samples |
| Data ownership disputes | Written data-sharing agreements; farmer owns farm data |
| Cybersecurity | SSO, RBAC, encryption, signed commands, penetration testing |
| Rural connectivity | Offline-first mobile; store-and-forward; SMS/USSD fallback for critical alerts |
| Regulatory change | Modular jurisdiction rules; legal review; written permits |

## 5.5 Build/buy verdict

**Build:** the evidence ledger, workflow engine, agronomy rules, controller abstraction, audit/safety layer, and narrow ML for validated tasks.

**Integrate:** imagery, weather, sensors, controllers, drones, labs, payments, insurance.

**Do not build:** satellites, generic crop foundation models, drones, sprayers, sensors, or a fumigation service.

---

# 6. Recommended workflow

## 6.1 The operating loop

The product loop should be explicit in the UI and the data model:

```text
OBSERVE
  satellite / UAV / weather / sensors / scout / lab / farmer report
    ↓
UNDERSTAND
  anomaly? baseline? spatial pattern? confidence? what is missing?
    ↓
RECOMMEND
  hypothesis + proposed action + constraints + alternatives + cost
    ↓
APPROVE
  agronomist / farmer / licensed operator / regulator check
    ↓
ACT
  human or licensed contractor; controller with limits; never autonomous spray
    ↓
MEASURE
  efficacy / yield / water / energy / cost / complaints / lessons
    ↓
LEARN
  update baseline, model, rules, and next season's plan
```

The loop should be the same for all four features. The differences are the evidence, the approval role, and the safety envelope.

## 6.2 Diagnosis workflow

**Trigger:** satellite anomaly, UAV anomaly, sensor threshold, scout observation, farmer report, or scheduled inspection.

**Steps:**

1. **Frame the question.** Which block, which palm/tree, which time window, which symptom?
2. **Assemble evidence.** Imagery time series, weather, soil moisture, salinity, phenology, trap counts, previous lab results, scouting photos.
3. **Detect and describe the anomaly.** Show the baseline, the deviation, and the spatial pattern. State the confidence.
4. **Generate hypotheses.** Rank causes with supporting and contradicting evidence. Include “unknown/abiotic” as a candidate.
5. **Specify the confirmation test.** “Inspect the crown,” “check traps,” “sample soil/water,” “send a lab sample,” “do nothing and re-image in 7 days.”
6. **Assign a scout or agronomist.** Offline mobile form with photos, GPS, and required fields.
7. **Record the confirmation or refutation.** Lab result, dissection, trap count, or expert judgment.
8. **If confirmed, recommend treatment.** Link the recommendation to the evidence and the label constraints.
9. **If not confirmed, close the loop.** Record the negative result; it is training data.
10. **Re-image after the intervention.** Measure whether the anomaly changed.

**UI states:** `new → triaged → awaiting evidence → confirmed → recommendation → approved → treated → verified → closed` and `new → triaged → refuted → closed`.

**Guardrail:** the system must never show “RPW detected” unless there is a confirmation record. It can show “RPW plausible — inspection required.”

## 6.3 Treatment and spray workflow

**Trigger:** confirmed diagnosis or a preventive/seasonal program.

**Steps:**

1. **Select target and block.** Crop, cultivar, phenology, area, pest/disease, threshold.
2. **Choose product.** Registered products only; show label rate, PHI, REI, resistance group, compatibility, and local registration status.
3. **Check constraints.** Buffer zones, water bodies, apiaries, homes, organic fields, wind, temperature, inversion risk, rain forecast.
4. **Build prescription.** Dose, water volume, nozzle/droplet, timing, number of passes, adjuvant.
5. **Review alternatives.** Cultural, biological, mechanical, and do-nothing options; cost and risk.
6. **Approve.** Agronomist and farmer; licensed applicator for the method.
7. **Select executor.** Ground spray contractor, drone contractor, or farm crew. Verify license/registration.
8. **Dispatch.** Send the job sheet; do not imply the job is done. State `dispatched`.
9. **Record actuals.** Product batch, equipment, weather, start/end, area, deviations, incidents.
10. **Verify.** Efficacy scouting, phytotoxicity check, residue test if required, complaint log.
11. **Measure.** Cost per ha, pest reduction, yield, avoided loss.

**Guardrails:**

- No job generation if the product is not registered for the crop/method.
- No job generation if the operator is not licensed/registered for the method.
- No job generation if weather or buffer constraints fail.
- No “completed” status without operator confirmation and evidence.
- No autonomous dispatch.
- No fumigation execution.

**UI states:** `draft → proposed → approved → dispatched → in_progress → completed → verified → closed` plus `cancelled`, `deviated`, `incident`.

## 6.4 Irrigation workflow

**Trigger:** scheduled check, soil moisture threshold, weather forecast, flow/pressure alarm, or farmer request.

**Steps:**

1. **Read state.** Valve status, flow, pressure, soil moisture, weather, tank, pump, energy.
2. **Compute water balance.** ET₀, Kc, rainfall, irrigation, soil storage, salinity leaching.
3. **Diagnose.** Is the block wet, dry, leaking, or sensor-faulty? Show confidence.
4. **Recommend.** Run time and timing with a range; explain the drivers.
5. **Approve.** Farmer or manager; for writes, require a second confirmation.
6. **Apply.** Write to controller only within limits; verify flow/pressure response.
7. **Monitor.** Compare actual volume to planned; detect leaks/dry-run.
8. **Record.** Water event, energy, reason, outcome.
9. **Review.** Weekly water use vs baseline; adjust Kc or schedule.

**Guardrails:**

- Read-only by default.
- Maximum run time, maximum volume, and allowed windows.
- Rain hold and soil-moisture cutoff.
- Flow/pressure interlocks; pump dry-run protection.
- Manual override always available.
- No writes if sensor data quality is low or controller state is unknown.
- Audit every command and override.

**UI states:** `monitoring → recommendation → approved → writing → running → completed → verified` plus `held`, `fault`, `override`.

## 6.5 Pollination workflow (trial mode only)

**Trigger:** flowering window and trial protocol.

**Steps:**

1. **Select trial palms.** Cultivar, age, health, flowering stage, randomization.
2. **Test pollen.** Viability, germination, source, storage.
3. **Plan mission.** Flight path, height, speed, nozzle, volume, pollen concentration, weather limits.
4. **Apply treatments.** Manual control, ground liquid, drone liquid; randomize within blocks.
5. **Record.** Time, labor, pollen, volume, weather, operator, drone settings.
6. **Measure fruit set.** Count flowers/fruit on marked inflorescences.
7. **Harvest and measure yield/quality.** Weight, grade, sugar, defects.
8. **Analyze.** Non-inferiority test; cost per palm; labor and timing.
9. **Decide.** Continue, modify, or stop.

**Guardrails:**

- No commercial yield claim from a single trial.
- No unrandomized comparison.
- No ignoring manual/ground-liquid alternatives.
- No cross-cultivar pollen contamination.
- No operation without drone registration/pilot licensing and landowner permission.

**UI states:** `protocol → randomized → applied → fruit_set → harvested → analyzed → decision`.

## 6.6 Roles and accountability

| Role | Responsibility | Cannot do |
|---|---|---|
| **Farmer/manager** | Approve farm operations; own the data; set risk tolerance | Override a legal restriction |
| **Agronomist** | Confirm diagnosis; approve recommendations; supervise scouts | Sign off outside competence |
| **Scout** | Collect observations, photos, traps, samples | Declare a diagnosis |
| **Lab** | Confirm the specific test | Recommend treatment |
| **Licensed applicator/pilot** | Execute the spray/flight within label and permit | Change the prescription without approval |
| **Irrigation technician** | Install/maintain sensors and controllers; verify hydraulics | Approve agronomic schedule alone |
| **FieldWise support** | Maintain integrations, models, audit, and alerts | Make farm decisions |
| **Regulator** | Authorize the operation/product/method | — |

A simple RACI for each workflow should be embedded in the product, not left to custom contracts.

## 6.7 UI and trust requirements

- **Show the evidence, not just the answer.** A recommendation should expand to show inputs, model version, confidence, and missing data.
- **Show the date and source of every data point.** “Last satellite image: 3 days ago, 40% cloud” is better than a green dot.
- **Show what the system does not know.** “No recent soil moisture; using ET only.”
- **Separate “planned,” “approved,” “dispatched,” “completed,” and “verified.”** Use color and text, not just icons.
- **Make demo mode obvious.** A banner and a data flag; never mix simulated and live records.
- **Support Urdu and local language labels** where the user base requires it; technical terms should have plain-language explanations.
- **Design for offline.** Cache the field map, tasks, and forms; sync when connected; resolve conflicts explicitly.
- **Design for low-end Android.** Avoid heavy maps and large imagery downloads in the field.

## 6.8 Acceptance criteria for the workflow

A workflow is not “done” when the screen exists. It is done when:

- A real user can complete it without a support call.
- Every state transition is recorded with who/when/why.
- The system blocks illegal or unsafe transitions.
- The evidence survives an audit.
- The outcome is measured and visible.
- The workflow works offline and syncs without data loss.
- The error messages are actionable.
- The user can override safely and the override is logged.

---

# 7. Phased roadmap, dependencies, and exit criteria

## 7.1 Roadmap at a glance

The roadmap is deliberately **sequential**. Running all four features at once would create too many unknowns and make attribution impossible. The sequencing follows evidence and risk: observe first, then advise, then approve, then act in a bounded pilot.

| Phase | Time | Scope | Key dependencies | Exit criteria | Decision |
|---|---|---|---|---|---|
| **0. Foundations** | Weeks 0–8 | Boundaries, blocks, user roles, data model, audit log, offline capture, satellite/weather ingestion | GIS data; product design; security review | A real farm can be mapped; satellite/weather data arrives; a scout can submit offline; audit works | Proceed if data quality is usable |
| **1. Diagnosis triage** | Months 2–6 | Anomaly detection, scouting tasks, photo/lab evidence, hypothesis cards, agronomist review | Phase 0; lab partner; agronomist | ≥20 confirmed cases; scout time reduction; false-alert rate acceptable; no “diagnosis” without confirmation | Proceed if triage beats baseline |
| **2. Irrigation monitoring** | Months 3–9 | Soil moisture/flow/pressure ingestion, ET advisory, alerts, read-only controller integration | Phase 0; sensor supplier; controller API | Sensor uptime ≥90%; advisory used for ≥8 weeks; no safety incidents; water/energy baseline measured | Proceed if farm uses recommendations |
| **3. Treatment records** | Months 6–12 | Product/label knowledge base, prescription, approval, contractor coordination, job records | Phase 1; legal review; licensed contractor | 100% of pilot spray jobs have approval + record; no off-label/illegal jobs; contractor feedback positive | Proceed if records are trusted |
| **4. Approved irrigation writes** | Months 9–15 | One block, bounded writes, flow/pressure interlocks, manual override | Phase 2; controller certification; safety review | Zero unauthorized events; water use measured; farmer confidence | Proceed only if safe |
| **5. Pollination trial** | Months 12–18 | Randomized date-palm trial with manual/ground/drone treatments | Phase 1 mapping; pollen supplier; drone operator; statistician | Fruit set/yield data; cost per palm; no quality penalty; protocol followed | Continue only if non-inferior and cheaper/better |
| **6. Scale decision** | Months 18–24 | Multi-farm rollout of proven capabilities; defer unproven ones | Phases 1–3; unit economics; support model | Repeatable onboarding; gross margin; customer retention; no safety/legal incidents | Scale, narrow, or stop |

## 7.2 Dependency logic

- **Do not start Phase 4 before Phase 2 has at least 8 weeks of clean sensor/controller data.** A closed-loop system without a baseline is a liability.
- **Do not start Phase 5 before Phase 1 has palm-level mapping and a lab/agronomist loop.** Pollination trials need identifiable palms and a way to measure outcomes.
- **Do not start Phase 3 before legal review.** A treatment recommendation feature can create liability even without execution.
- **Do not start any drone execution before registration, pilot licensing, insurance, and written permission are in place.**
- **Do not scale any feature until the outcome measurement is working.** Otherwise the company cannot distinguish product value from seasonality.

## 7.3 Exit criteria by capability

### Diagnosis triage

- At least 20 lab/agronomist-confirmed cases across at least two blocks.
- Precision ≥0.8 and recall ≥0.7 for at least one target on held-out data.
- False-alert rate low enough that scouts do not ignore the queue.
- Time from anomaly to scout visit <72 hours in the pilot.
- Scout time per confirmed case reduced by ≥30% vs baseline.
- No unconfirmed case labeled as a diagnosis in the UI or exports.

### Irrigation advisory

- Sensor uptime ≥90% over 8 weeks.
- Data latency within one irrigation cycle.
- At least 10% water or energy reduction, or a documented yield-protection benefit, without yield loss.
- Zero unauthorized valve events.
- Farmer can explain why a recommendation was made.
- Salinity/leaching check is part of the recommendation.

### Treatment records

- 100% of pilot jobs have product, dose, area, operator, weather, approval, and completion record.
- 100% of operators are licensed/registered for the method.
- Zero off-label or unapproved product/method combinations.
- At least one efficacy follow-up per job.
- Legal review sign-off on the workflow.

### Pollination trial

- Pre-registered protocol and power analysis.
- At least two cultivars or two seasons (prefer both).
- Fruit set and yield measured per palm, not just per block.
- Manual control included.
- Cost per palm calculated with labor, pollen, drone, and supervision.
- Non-inferiority margin defined in advance (e.g., 10% relative).
- No commercial claim until the analysis is complete.

## 7.4 Engineering backlog epics

| Epic | Description | Acceptance criteria | Priority |
|---|---|---|---|
| **E1. Farm/block GIS** | Map farms, blocks, rows, palms/trees; import GeoJSON/KML; offline map | A farm can be mapped in <1 day; geometry is versioned | P0 |
| **E2. Evidence ledger** | Observations, photos, lab results, sensor readings, provenance, audit | Every record has source/time/geometry; immutable audit | P0 |
| **E3. Workflow engine** | Tasks, states, approvals, roles, escalation | Illegal transitions blocked; audit complete | P0 |
| **E4. Satellite/weather ingestion** | Sentinel-2, weather API, local station; cloud masking; indices | Data arrives reliably; latency/coverage shown | P0 |
| **E5. Offline mobile** | Scout/farmer forms; photo capture; sync; conflict resolution | Works for 7 days offline; no data loss | P0 |
| **E6. Diagnosis triage** | Anomaly detection, hypothesis cards, confirmation tasks | ≥20 confirmed cases; precision/recall targets | P1 |
| **E7. Lab loop** | Sample ID, chain of custody, result import, alert | Turnaround tracked; result linked to case | P1 |
| **E8. Sensor gateway** | SDI-12/LoRaWAN/NB-IoT ingestion; calibration; quality flags | Uptime ≥90%; bad data flagged | P1 |
| **E9. ET/water balance** | FAO-56, Kc, rainfall, salinity, recommendation | Recommendation explainable; range shown | P1 |
| **E10. Controller abstraction** | Read-only adapters first; Rain Bird/Rachio/Hydrawise/OpenSprinkler | One adapter in pilot; no vendor lock-in | P1 |
| **E11. Treatment knowledge base** | Products, labels, PHI/REI, resistance, local registration | Legal review; versioned labels | P2 |
| **E12. Spray job records** | Prescription, approval, contractor, weather, buffer, actuals | 100% records; no illegal job | P2 |
| **E13. Bounded irrigation writes** | Limits, interlocks, audit, override | Zero unauthorized events | P2 |
| **E14. Pollination trial** | Randomization, flight plan, fruit set/yield, cost | Protocol executed; analysis complete | P3 |
| **E15. Outcome analytics** | Baseline, comparison, confidence intervals, cost | ROI claims traceable | P1 |

## 7.5 Team and budget

**Minimum team for the first 12 months:**

- 1 product lead / agronomy domain lead.
- 1 full-stack engineer (workflow, mobile, backend).
- 1 geospatial/data engineer (satellite, GIS, sensors).
- 1 field agronomist / scout coordinator (Pakistan-based).
- 1 part-time designer/UX researcher.
- 1 part-time legal/regulatory advisor.
- 1 part-time data scientist/ML engineer (after Phase 1).
- 1 field technician (sensors/controllers).
- Support: lab partner, drone contractor, accountant.

This is a **field-heavy** product. A team of only software engineers will build a dashboard that farmers do not use.

**Planning envelope:** USD 60,000-160,000 for a 12-month pilot, depending on scope and whether UAV imagery is purchased as a service (lower capital) or acquired (higher capital). A lean pilot is roughly 60,000-90,000; a fuller trial with a purchased multispectral UAV and a larger pollination study is 120,000-160,000. This excludes major hardware manufacturing and excludes the cost of a commercial spray drone fleet. It includes:

- Field staff and travel.
- Satellite/weather/API costs.
- Sensor hardware and installation.
- UAV imagery services or a small UAV.
- Lab tests.
- Software/cloud.
- Legal/regulatory review.
- Contingency (15–20%).

## 7.6 Cost drivers by feature

| Feature | Main cost drivers | What to measure | What not to assume |
|---|---|---|---|
| **Diagnosis** | Imagery acquisition, processing, scout labor, lab tests, model maintenance, support | Cost per confirmed case; cost per hectare; time to confirmation | That free satellite is sufficient for tree-level diagnosis |
| **Spraying** | Drone capital, batteries, nozzles, pilot, insurance, permits, product, water, drift liability, maintenance | Cost per hectare vs ground; utilization; downtime; incident rate | That drone spraying is cheaper or more effective in date palm |
| **Irrigation** | Sensors, gateways, installation, calibration, controller integration, power/connectivity, maintenance, agronomist time | Cost per block; water/energy saved; uptime; yield effect | That sensors are maintenance-free or that ET alone is enough |
| **Pollination** | Pollen, viability testing, drone/pilot, flight time, batteries, supervision, weather downtime, fruit-set measurement | Cost per palm; fruit set/yield vs manual; labor/time saved | That drone pollination increases yield |

---

# 8. One realistic pilot

## 8.1 Site and scope

**Working pilot:** a **40–60 ha commercial date-palm orchard in the Sindh date belt (e.g., Khairpur or Nawabshah)**, with:

- One principal cultivar (or two, if the orchard is mixed).
- Existing drip or bubbler irrigation, or a 5 ha block where temporary drip can be installed.
- A cooperative farm manager and access to an agronomist.
- A laboratory partner that can confirm RPW and soil/water salinity/nutrient issues.
- A licensed drone operator for mapping (and, if permitted, a small pollination trial).
- A licensed ground/air spray contractor for any treatment execution.

**Why this site:** date palm is economically important in Pakistan; Sindh accounts for a large share of production; RPW is present; salinity and water scarcity are real; and the crop has a clear pollination window. The exact site must be selected after a due-diligence visit, not assumed.

**Pilot duration:** 12 months, with a 2-month setup/baseline and a 10-month operational window covering at least one flowering and harvest cycle.

**Pilot scope:** four workstreams, but **not** autonomous spraying:

1. **Diagnosis triage** on 3 blocks (10–20 ha each), with 30 sentinel palms per block.
2. **Irrigation monitoring/advisory** on the same blocks, with 20 soil moisture probes, 2 weather stations, and 6 flow/pressure sensors.
3. **Treatment records** for all spray operations, executed by a licensed contractor.
4. **Pollination trial** on a subset of palms (e.g., 90–120 palms) with manual, ground-liquid, and drone-liquid treatments.

## 8.2 Questions the pilot must answer

| Question | Why it matters | Minimum evidence |
|---|---|---|
| Can satellite/UAV triage find confirmed problems earlier or faster than current scouting? | Core diagnosis value | ≥20 confirmed cases; time-to-confirmation; precision/recall |
| Can the system reduce scout time without missing serious problems? | Adoption and cost | Scout hours per confirmed case; missed-case audit |
| Can irrigation advisory reduce water/energy use without yield loss? | Core irrigation value | Measured water/energy; yield; soil salinity trend |
| Can the workflow produce complete, auditable spray records? | Liability and trust | 100% job records; zero illegal jobs |
| Is drone pollination non-inferior to manual/ground liquid? | Commercial viability | Fruit set, yield, quality, cost per palm |
| What does it cost to deliver each capability? | Business model | Cost per ha/case/palm; support time |

## 8.3 Design

### Diagnosis

- **Sentinel palms:** 30 per block, geo-located and labeled.
- **Baseline:** historical satellite time series (2–3 years), current UAV multispectral mosaic, soil/water tests, trap counts.
- **Monitoring:** Sentinel-2 every 5 days (cloud permitting); UAV monthly and on-demand; scout visits triggered by anomalies and a random control sample.
- **Ground truth:** every flagged palm is inspected; suspected RPW is confirmed by dissection/trap/lab; salinity/nutrient issues by soil/water/leaf test.
- **Control sample:** randomly selected unflagged palms are also inspected to estimate false negatives.
- **Labels:** confirmed positive, confirmed negative, inconclusive. Negative labels are essential.

### Irrigation

- **Sensors:** 20 soil moisture probes (multiple depths where possible), 2 weather stations, 6 flow/pressure sensors, 1 controller integration.
- **Baseline:** at least 4 weeks of baseline irrigation, water/energy use, and yield history.
- **Advisory:** ET-based recommendation with soil moisture and salinity checks; farmer executes manually for the first 8 weeks.
- **Bounded writes:** only after 8 weeks of clean data and a safety review; one block only; limits and manual override.
- **Measurements:** water volume per block, pump energy, soil salinity (EC), water table, yield, fruit quality.

### Treatment records

- **All sprays** in the pilot are recorded: target, product, dose, area, weather, operator license, approval, start/end, deviations, efficacy.
- **Execution** is by a licensed contractor, not by FieldWise.
- **No drone spray** unless a separate written permit and trial protocol exist. If a drone spray trial is added, it is a measured sub-study with deposition cards and drift monitoring, not a commercial operation.

### Pollination

- **Treatments:** manual pollination (control), ground liquid pollination, drone liquid pollination.
- **Randomization:** randomized complete block design, stratified by cultivar and flowering date; 10-13 palms per treatment per block; 3 blocks; 30-40 palms per treatment total.
- **No unpollinated control** if it would cause commercial loss; manual is the comparator.
- **Pollen:** local, viable pollen; test germination; record source, storage, and concentration.
- **Application:** record height, speed, volume, nozzle, weather, time per palm, pollen mass.
- **Outcomes:** fruit set on marked inflorescences, yield per palm, fruit quality (size, grade, sugar, defects), cost per palm.
- **Analysis:** pre-registered non-inferiority margin (e.g., 10% relative for fruit set/yield); mixed-effects model with block and cultivar; report confidence intervals, not just means.

## 8.4 Data collection and quality

- **Unique IDs** for farms, blocks, palms, samples, flights, jobs, and sensors.
- **Timestamps and geometry** for every record.
- **Chain of custody** for lab samples.
- **Calibration records** for sensors and imagery.
- **Weather** at the block, not just at the airport.
- **Photo protocol** (angle, distance, lighting) for repeatability.
- **Double entry** for critical yield/fruit-set data.
- **Weekly data quality review**; missing data flagged, not imputed silently.
- **Versioned protocols**; changes documented.

## 8.5 Sample size and analysis

The pilot is a **learning project**, not a definitive registration trial. Still, it should be designed to avoid obvious underpowering:

- **Diagnosis:** ≥20 confirmed cases per target is a minimum for a preliminary precision/recall estimate; more is better. Report confidence intervals.
- **Irrigation:** compare treated vs baseline blocks or a crossover design; at least one full season; account for weather.
- **Pollination:** 30-40 palms per treatment (90-120 total) across 3 blocks; power analysis before starting. If the expected difference is small, the trial may need more palms or more seasons.
- **Avoid pseudo-replication:** treat palms/blocks as the unit, not individual fruit.
- **Pre-register** the primary outcome and analysis plan. Do not fish for a significant result.

## 8.6 Success and kill criteria

### Go criteria

- Diagnosis triage finds confirmed problems with acceptable precision/recall and reduces scout time.
- Irrigation advisory is used, sensor uptime is acceptable, and water/energy savings are measured without yield loss.
- Treatment records are complete and trusted by the farm and contractor.
- Pollination is non-inferior to manual/ground liquid on fruit set/yield, with a credible cost or labor advantage.
- The farm is willing to pay for at least one capability after the pilot.

### Kill/pause criteria

- The farm cannot maintain sensors or connectivity.
- The lab cannot confirm cases within the decision window.
- The false-alert rate destroys scout trust.
- The controller integration is unsafe or unavailable.
- The drone pollination trial is underpowered or shows a consistent yield penalty.
- The regulatory position prevents the planned operation.
- The cost per outcome is higher than the existing practice.

## 8.7 Budget envelope

| Line item | Planning range (USD) | Notes |
|---|---|---|
| Field agronomist / coordinator | 15,000–25,000 | Part-time to full-time, 12 months |
| Scout labor | 5,000–10,000 | 3 blocks, weekly/triggered |
| Satellite/weather/API/cloud | 5,000–10,000 | Sentinel-2 free; commercial VHR extra |
| UAV imagery (service) | 10,000–20,000 | Monthly + event flights; or capital purchase |
| Soil moisture probes/gateway | 8,000–15,000 | 20 probes, installation, telemetry |
| Weather stations | 3,000–6,000 | 2 stations |
| Flow/pressure sensors | 3,000–6,000 | 6 sensors, installation |
| Controller integration | 3,000–8,000 | One adapter, certification, labor |
| Lab tests | 5,000–10,000 | RPW, soil, water, leaf, residues |
| Pollination trial | 8,000–15,000 | Pollen, drone, labor, analysis |
| Legal/regulatory review | 3,000–6,000 | Written opinion; permits |
| Travel/logistics/insurance | 5,000–10,000 | Field visits, equipment, liability |
| Contingency (15–20%) | 10,000–20,000 | Weather, delays, repairs |
| **Total** | **~80,000–160,000** | Depends on in-house vs service; excludes major hardware |

A leaner version (UAV service, fewer sensors, one block) could be **USD 60,000–90,000**. A more ambitious version with a purchased multispectral UAV and a full pollination trial could exceed **USD 150,000**. These are planning envelopes, not quotes.

## 8.8 Timeline

| Month | Milestones |
|---|---|
| **0–1** | Site selection, agreements, baseline data, legal review, lab/contractor onboarding |
| **2** | Boundary mapping, sentinel palm IDs, sensor installation, satellite/UAV baseline |
| **3–4** | Diagnosis triage live; irrigation advisory live; scout training |
| **5–6** | First confirmed cases; treatment records; mid-season review |
| **7–8** | Flowering window (if applicable); pollination trial; irrigation advisory refinement |
| **9–10** | Harvest/fruit-set measurement; outcome analysis; controller write safety review |
| **11–12** | Final analysis, cost model, go/no-go, scale plan |

The exact flowering window depends on cultivar and location; the plan must be adjusted after the site visit.

## 8.9 Governance, safety, and ethics

- **Written data-sharing agreement:** farmer owns farm data; FieldWise gets a license for product improvement; no sale to third parties without consent.
- **Human approval** for every treatment and irrigation write.
- **Licensed operators** for spraying and drone flights.
- **Insurance** for field operations and drone flights.
- **No autonomous spray or fumigation.**
- **No simulated data presented as live.**
- **Worker safety:** heat, PPE, re-entry intervals, electrical/pump safety.
- **Environmental safety:** buffer zones, water bodies, pollinators, drift.
- **Privacy:** minimize imagery of homes/people; no unnecessary surveillance.
- **Research ethics:** informed consent for farmer interviews; anonymize data in publications.
- **Incident reporting:** near-miss and incident log; stop-work authority.

## 8.10 What not to do in the pilot

- Do not test all four features on all blocks at once.
- Do not buy a spray drone before the regulatory and efficacy case is clear.
- Do not claim yield improvement from a single season.
- Do not use the pilot as a sales demo with simulated data.
- Do not let a vendor's agronomist be the only reviewer of the vendor's product.
- Do not ignore negative results. A well-run pilot that kills a bad idea is a success.

---

# 9. Risks and open questions

## 9.1 Risk register

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| **Overclaiming diagnosis** | High | High — liability, trust loss, wrong treatment | Hypothesis language; confirmation required; confidence shown; disclaimers; agronomist sign-off | Product/agronomy |
| **False negatives on lethal pests (RPW)** | Medium | High — palm loss, liability | Sentinel palms; traps; periodic inspection; do not rely on imagery alone; clear scope | Agronomy |
| **Drone spray drift/off-target** | Medium | High — health, environment, legal | No autonomous spray; licensed operator; buffers; weather limits; insurance; deposition/drift monitoring | Operations/legal |
| **Unclear Pakistan regulation** | High | High — stop-work, penalties | Written legal opinion; permits; pilot-only; modular jurisdiction rules | Legal |
| **No drone-specific pesticide label** | High | High — illegal application | Verify product/method registration; do not assume; use ground application if needed | Legal/agronomy |
| **Fumigation incident** | Low (if deferred) | Very high | Defer; use certified contractor; no software dispatch | Operations |
| **Sensor failure/calibration drift** | High | Medium — wrong irrigation | QC flags; redundancy; maintenance; fallback to ET; calibration schedule | Field ops |
| **Controller integration unsafe** | Medium | High — crop/water damage | Read-only first; limits; interlocks; audit; manual override; vendor terms | Engineering |
| **Connectivity/power gaps** | High | Medium — data loss, missed alerts | Offline-first; LoRaWAN/NB-IoT; solar; store-and-forward; SMS fallback | Engineering |
| **Model fails in new orchard/season** | High | Medium — bad recommendations | Local validation; drift monitoring; human review; conservative defaults | Data/ML |
| **Label scarcity / data quality** | High | High — model cannot improve | Ground-truth budget; lab partnership; active learning; negative labels | Data/agronomy |
| **Cost per outcome too high** | Medium | High — no business | Start with service model; measure cost; narrow scope; partner hardware | Product/finance |
| **Farmer adoption/trust** | Medium | High — low usage | Co-design; local language; agronomist champion; show evidence; small wins | Product/field |
| **Vendor lock-in** | Medium | Medium — margin/control | Abstraction layer; open standards; multi-vendor | Engineering |
| **Cybersecurity/unauthorized command** | Low–medium | High — crop/water damage | SSO; RBAC; signed commands; rate limits; penetration test; audit | Engineering |
| **Pollination trial underpowered** | Medium | Medium — wrong conclusion | Power analysis; pre-registration; enough palms/blocks/seasons | Research |
| **Pollen viability/contamination** | Medium | High — poor fruit set | Viability test; storage protocol; local pollen; cleaning; records | Agronomy |
| **Data privacy/land rights** | Medium | Medium — legal/reputation | Consent; data minimization; agreements; no unauthorized surveillance | Legal |
| **Heat/worker safety** | Medium | High — injury | Work windows; hydration; PPE; emergency plan | Field ops |
| **Seasonality/one-season evidence** | High | High — false confidence | Multi-season trials; explicit limitations; no commercial claim after one season | Research/product |

## 9.2 Open questions

| # | Question | Why it matters | How to resolve | Owner |
|---|---|---|---|---|
| 1 | Which province(s) and orchard(s) are the real target? | Regulation, logistics, crop mix, connectivity | Site visits; customer interviews | Product |
| 2 | Which pests/diseases are the commercial priorities? | Model scope; lab needs; treatment relevance | Agronomist interviews; farm records | Agronomy |
| 3 | Is there a local lab that can confirm the target within 72 hours? | Diagnosis workflow viability | Lab audit; sample turnaround test | Operations |
| 4 | What irrigation controllers are installed? | Integration feasibility | Site survey; API/vendor check | Engineering |
| 5 | Is water metered and priced? | Value proposition | Utility/farm data | Product |
| 6 | What is the labor cost and availability for manual pollination? | Drone pollination business case | Farm interviews; time studies | Research |
| 7 | What is the pollen source and viability? | Pollination outcome | Lab test; supplier audit | Agronomy |
| 8 | What is the current regulatory status for drone spraying/pollination? | Legal risk | Written legal opinion; regulator meeting | Legal |
| 9 | What is the farm's yield baseline and variability? | Outcome measurement | Historical records; pre-season sampling | Research |
| 10 | What data can be shared, and under what terms? | Privacy/legal | Data-sharing agreement | Legal |
| 11 | What is the willingness to pay? | Business model | Pricing interviews; pilot contract | Product |
| 12 | Can the farm maintain sensors and connectivity? | Operational feasibility | 8-week instrumentation test | Field ops |
| 13 | What is the false-alert tolerance of scouts? | Adoption | Usability testing; pilot metrics | Product |
| 14 | Is a spray drone service available locally? | Execution path | Vendor/contractor scan | Operations |
| 15 | What is the insurance/liability model? | Risk transfer | Broker consultation | Legal/finance |

## 9.3 Assumptions to confirm before build

These are the assumptions most likely to invalidate the plan:

1. **Pakistan is the target market.** If the first customer is in the Gulf or another country, regulation, labor, and crop economics change.
2. **Date palm is the anchor crop.** If the first customer is a mixed orchard or a vegetable operation, the diagnosis and pollination scope changes.
3. **The farm has or can install drip/bubbler irrigation.** If it is flood-irrigated, the irrigation product needs a different design.
4. **There is a lab and agronomist willing to participate.** Without confirmation, diagnosis is limited to anomaly detection.
5. **The farm will share data and allow field trials.** Without this, the pilot cannot generate evidence.
6. **The regulatory environment permits a mapped/pollination drone flight.** Mapping is lower risk than spraying, but registration/licensing still apply.
7. **The customer will pay for a service, not just a dashboard.** The pilot should include a pricing conversation, not just a trial.

---

# 10. Recommendation and what evidence would change it

## 10.1 Recommendation

**Build the evidence-and-approval platform now. Integrate hardware. Defer autonomous spray and commercial pollination claims.**

Specifically:

1. **Make the observation-to-approval workflow the product.** Boundaries, satellite/weather, scouting, lab confirmation, hypotheses, recommendations, approvals, job records, outcomes.
2. **Ship diagnosis as triage, not diagnosis.** Anomaly detection + scouting + evidence + hypothesis ranking. Require confirmation before treatment.
3. **Ship irrigation as monitoring + advisory.** Read-only controller integration first; approved writes in one block only after validation.
4. **Ship treatment as prescription + records.** Use licensed contractors for execution. Do not build autonomous spray or fumigation.
5. **Run pollination as a partner-led trial.** Do not sell yield uplift. Compare with manual and ground liquid.
6. **Measure outcomes from day one.** Baseline, treatment, and comparison. No ROI claim without data.
7. **Be explicit about uncertainty.** Show data gaps, confidence, and what would change the recommendation.

The commercial story is:

> “FieldWise helps you see what is happening, decide what to do, get the right person to do it, and prove whether it worked.”

That story is credible today. “Autonomous AI drone orchard” is not.

## 10.2 Evidence thresholds for scaling

| Capability | Threshold to move from pilot to commercial | Evidence required |
|---|---|---|
| **Diagnosis triage** | 2 orchards, 2 seasons, ≥40 confirmed cases, precision ≥0.8/recall ≥0.7 for at least one target | Confusion matrix with confidence intervals; false-negative audit |
| **Cause-ranked diagnosis** | Same as above, plus external validation on a held-out orchard | Lab-confirmed labels; domain-shift analysis |
| **Irrigation advisory** | ≥10% water/energy reduction or documented yield protection, no yield loss, 2 seasons | Metered water/energy; yield; soil salinity |
| **Approved controller writes** | Zero unauthorized events; 2 seasons; farmer confidence | Audit log; safety review; incident log |
| **Spray records** | 100% complete; zero illegal jobs; contractor acceptance | Audit sample; legal review |
| **Drone spray** | Non-inferior deposition/efficacy; drift within limits; written regulatory approval; 2 seasons | Field trial; deposition/drift data; permits |
| **Pollination** | Non-inferior fruit set/yield within 10% relative; lower cost or clear labor benefit; 2 cultivars/seasons | Randomized trial; quality data; cost per palm |
| **Commercial** | Willingness to pay; gross margin; retention | Pilot contracts; unit economics |

## 10.3 What would change the recommendation

The recommendation would become **more aggressive** if:

- A reputable, independent Pakistani field trial shows drone spray is safe, legal, and non-inferior in date palm.
- A multi-season date-palm pollination trial shows non-inferior yield at lower cost, with a clear labor constraint.
- The regulator publishes a clear, operational approval pathway and a drone-specific label.
- The pilot shows farmers will pay enough to cover field support and sensor maintenance.
- A controller vendor provides a certified, safe write API with clear terms.

The recommendation would become **more conservative** if:

- The lab/agronomist loop cannot be sustained.
- False alerts erode scout trust.
- Sensor maintenance is too costly for the target farm size.
- The regulatory environment remains unclear or becomes more restrictive.
- Drone pollination shows a consistent yield penalty.
- The cost per outcome is higher than the existing practice.

## 10.4 Decision summary

| Decision | Recommendation | Rationale |
|---|---|---|
| **Diagnosis** | Build triage + confirmation workflow | High value, low regulatory risk, creates data moat |
| **Treatment** | Build recommendation + records; use contractors | Needed for trust and liability; execution is not the moat |
| **Spray drone** | Defer/validate | Dense canopy, drift, regulation, weak local evidence |
| **Fumigation** | Defer | Acute toxicity, certified applicator, not software-dispatchable |
| **Irrigation** | Build monitoring + advisory; validate writes | Mature sensing, clear value, but control safety matters |
| **Pollination** | Trial only | Mixed evidence; no yield claim; crop-specific |
| **Hardware** | Integrate, do not build | Capital and regulatory burden; commodity hardware |
| **Data/audit** | Build | Core differentiation and trust |
| **ROI claims** | Measure, do not assume | Protects credibility and informs pricing |

---

# 11. Annotated source appendix

## 11.1 Search method

**Search date:** 7 November 2026.  
**Languages:** English; Urdu/Pakistani media where accessible.  
**Geographic focus:** Pakistan, with global evidence for methods, regulation, and crop biology.

**Sources searched:**

- Google Scholar, PubMed, Crossref, arXiv, Semantic Scholar.
- Publisher sites: MDPI, Wiley, Elsevier, Springer Nature, Frontiers, ASHS, USDA ARS.
- FAO, WHO, ICARDA, CGIAR, national extension services.
- US EPA, UK HSE, Government of India, Government of Pakistan, PCAA, PIDE, High Court of Balochistan.
- World Bank, ITU, DataReportal, ProPakistani.
- Vendor documentation and trade media for commercial claims.
- YouTube and demonstration videos for orientation only.

**Search terms included:**

- Orchard: `orchard UAV disease detection`, `date palm remote sensing`, `red palm weevil UAV`, `RPW thermal detection`, `individual tree crown detection`, `NDVI saturation orchard`, `plant disease detection field accuracy`.
- Spraying: `drone spray orchard deposition`, `UAV spray drift apple`, `date palm drone spraying`, `aerial pesticide application regulation`, `fumigation buffer zone`, `drone spray economics`.
- Irrigation: `FAO-56 date palm`, `date palm crop coefficient`, `soil moisture sensor calibration`, `root zone soil moisture remote sensing`, `CWSI limitations`, `irrigation controller API`, `SDI-12`.
- Pollination: `date palm drone pollination`, `liquid pollination date palm`, `UAV pollination fruit set`, `drone pollination yield`, `kiwifruit pollination robot`, `artificial pollination review`.
- Pakistan: `Pakistan agricultural drone regulation`, `Civil Unmanned Aircraft Rules 2024`, `Pakistan pesticide law drone`, `NAFSA Act 2026`, `Pakistan date palm production`, `Pakistan groundwater irrigation`, `Pakistan rural internet`.

**Inclusion rules:**

- Priority to 2020–2026.
- Foundational older sources included where they remain authoritative (FAO-56 1998; APO 1971; FAO date palm 1999).
- Peer-reviewed reviews and field trials preferred.
- Preprints, theses, extension guides, and vendor documents included only with explicit labels.
- Pakistan-specific sources included where available; global evidence used when local evidence was absent and clearly labeled.

**Exclusion rules:**

- Vendor marketing was not used to support efficacy or yield claims; it was used only to describe claims, product features, or commercial positioning.
- YouTube videos were not used for quantitative claims because they generally lacked methods, replication, controls, and independent verification.
- Papers that could not be accessed in full were used only for abstract-level claims, with that limitation noted.

**Cross-checking:** Key claims were checked against at least two independent sources where possible. Where sources conflicted, the report says so rather than averaging them. Examples: thermal RPW detection performance, drone spray deposition/drift, and date-palm drone fruit set.

**Limitations:**

- No primary field visits or farmer interviews were conducted for this report.
- Some full texts were paywalled; abstract-level evidence is labeled.
- MDPI pages sometimes returned 403; metadata was cross-checked via PubMed/Crossref/search results where possible.
- Pakistan's regulatory position is changing; verify before acting.
- Local cost data are scarce; cost figures are planning envelopes or foreign benchmarks, not quotes.
- Publication bias likely favors positive results.
- Date-palm trials are heterogeneous in cultivar, climate, pollen source, and method, limiting meta-analysis.

## 11.2 Evidence labels used in the appendix

| Label | Meaning |
|---|---|
| **E1** | Strong: systematic review/meta-analysis, replicated multi-site trial, authoritative standard/guidance, or primary legal instrument |
| **E2** | Moderate: peer-reviewed primary field study or well-designed lab study with field relevance |
| **E3** | Limited: single-site trial, preprint, thesis, extension guide, vendor trial with methods |
| **E4** | Marketing/anecdote: vendor claim, trade media, demonstration, unsourced blog |
| **E5** | Absent/conflicting: no direct evidence, or studies disagree |

## 11.3 Diagnosis sources

**Popescu, D.; Ichim, L.; Stoican, F. (2023).** “Orchard monitoring based on unmanned aerial vehicles and image processing by artificial neural networks: a systematic review.” *Frontiers in Plant Science* 14:1237695. DOI: [10.3389/fpls.2023.1237695](https://doi.org/10.3389/fpls.2023.1237695).  
*Type:* Systematic review. *Evidence:* E1 for the breadth of UAV orchard applications; E2 for performance claims because the underlying studies are heterogeneous.  
*Annotation:* Useful map of tree detection, health classification, and yield-related applications. Does not establish that any model generalizes to Pakistani date palm. The review's main value is showing how much of the literature is proof-of-concept.

**Alsadik, B.; Ellsäßer, F.J.; Awawdeh, M.; Al-Rawabdeh, A.; Almahasneh, L.; Oude Elberink, S.; Abuhamoor, D.; Al Asmar, Y. (2024).** “Remote Sensing Technologies Using UAVs for Pest and Disease Monitoring: A Review Centered on Date Palm Trees.” *Remote Sensing* 16(23):4371. DOI: [10.3390/rs16234371](https://doi.org/10.3390/rs16234371).  
*Type:* Review. *Evidence:* E2.  
*Annotation:* Closest review to the date-palm use case. It supports the promise of UAV sensing but documents limited operational validation and the difficulty of early pest detection. Do not cite it as proof of field diagnostic accuracy.

**Delalieux, S.; Hardy, T.; Ferry, M.; Gomez, S.; Kooistra, L.; Culman, M.; Tits, L. (2023).** “Red Palm Weevil Detection in Date Palm Using Temporal UAV Imagery.” *Remote Sensing* 15(5):1380. DOI: [10.3390/rs15051380](https://doi.org/10.3390/rs15051380).  
*Type:* Primary field/remote-sensing study. *Evidence:* E2/E3.  
*Annotation:* Reports thermal UAV detection of RPW-related anomalies from June onward, with limited validation and a call for larger datasets. Supports “seasonal, promising signal,” not “early warning system.” The temporal restriction is critical: a negative flight in spring does not rule out infestation.

**Casas, E.; Arbelo, M.; Moreno-Ruiz, J.A.; Hernández-Leal, P.A.; Reyes-Carlos, J.A. (2023).** “UAV-Based Disease Detection in Palm Groves of Phoenix canariensis Using Machine Learning and Multispectral Imagery.” *Remote Sensing* 15(14):3584. DOI: [10.3390/rs15143584](https://doi.org/10.3390/rs15143584).  
*Type:* Primary UAV/ML study. *Evidence:* E2 for `Phoenix canariensis`; not evidence for commercial date palm or RPW.  
*Annotation:* Reports random-forest precision around 0.93 for infected and 0.77 for healthy palms, accuracy around 0.87, and pixel classification above 0.96. The species difference is material. This is a useful methodological proof-of-concept, not a product validation.

**Khawaja, G.R. et al. (2020).** “Evaluation of some non-invasive approaches for the detection of red palm weevil infestation.” *Saudi Journal of Biological Sciences* 27(1):401–406. DOI: [10.1016/j.sjbs.2019.10.010](https://doi.org/10.1016/j.sjbs.2019.10.010).  
*Type:* Primary field evaluation. *Evidence:* E2.  
*Annotation:* Found thermal detection around 61% versus visual detection around 87%, contradicting higher optical-detection claims elsewhere. The lesson is that sensor performance depends on infestation stage, cultivar, time, and reference standard. This is an important negative/contradictory finding.

**Mendel, Z.; Voet, H.; Modan, N.; Naor, R.; Ment, D. (2024).** “Seismic sensor-based management of the red palm weevil Rhynchophorus ferrugineus in date palm plantations.” *Pest Management Science* 80(3):1053–1064. DOI: [10.1002/ps.7836](https://doi.org/10.1002/ps.7836).  
*Type:* Primary field study. *Evidence:* E2.  
*Annotation:* Supports in-tree seismic/acoustic sensing as a direct detection modality and a management input. It is not a canopy-image diagnosis. Useful for a high-value-palm sensor product, but installation/maintenance at scale is non-trivial.

**Shafay, M.; Hassan, T.; Owais, M.; Hussain, I.; Khawaja, S.G.; Seneviratne, L.; Werghi, N. (2025).** “Recent advances in plant disease detection: challenges and opportunities.” *Plant Methods* 21:140. DOI: [10.1186/s13007-025-01450-0](https://doi.org/10.1186/s13007-025-01450-0).  
*Type:* Review. *Evidence:* E1/E2.  
*Annotation:* Reports lab accuracies around 95–99% but field accuracies around 70–85%, with large drops under domain shift (e.g., ConvNeXt dropping about 27.71 points in the reported comparison). PlantVillage is a lab benchmark, not a field benchmark. This is the central citation for “do not market lab accuracy as field diagnosis.”

**Tian, Z.; Fan, J.; Yu, T.; de Leon, N.; Kaeppler, S.M.; Zhang, Z. (2025).** “Mitigating NDVI saturation in imagery of dense and healthy vegetation.” *ISPRS Journal of Photogrammetry and Remote Sensing* 227:234–250. DOI: [10.1016/j.isprsjprs.2025.06.013](https://doi.org/10.1016/j.isprsjprs.2025.06.013).  
*Type:* Primary methods study. *Evidence:* E2.  
*Annotation:* Documents the saturation problem in dense, healthy canopies and proposes mitigation. Supports the report's caution that NDVI alone is a weak differentiator in high-biomass orchards. It does not validate a specific orchard diagnostic model.

**Zheng, J.; Yuan, S.; Li, W.; Fu, H.; Yu, L. (2023).** “A review of individual tree crown detection and delineation from optical remote sensing images.” arXiv:2310.13481. [https://arxiv.org/abs/2310.13481](https://arxiv.org/abs/2310.13481).  
*Type:* Preprint/review. *Evidence:* E3.  
*Annotation:* Useful for understanding tree-crown detection and delineation, including the difficulty of dense canopies and mixed pixels. It is a preprint, so treat specific performance numbers as provisional. It supports the claim that tree-level mapping is an active research area, not a solved commodity.

**Buriro, Y. et al. (2026).** “Spatiotemporal Distribution and Bioassay Management Techniques against Red Palm Weevil, Rhynchophorus ferrugineus (Olivier, 1790) in Khairpur, Sindh, Pakistan.” *Pakistan Journal of Zoology*, online first, pp. 1–10, 27 October 2026. DOI: [10.17582/journal.pjz/20260523034541](https://doi.org/10.17582/journal.pjz/20260523034541).  
*Type:* Primary local field study. *Evidence:* E2/E3.  
*Annotation:* Confirms RPW presence and management activity in Khairpur, Sindh. Use for local relevance. Do not use it for national loss estimates or for the performance of remote sensing.

## 11.4 Treatment, spraying, fumigation, and Pakistan policy sources

**FAO & WHO (2024).** *International Code of Conduct on Pesticide Management – Guidance for aerial application of pesticides.* Rome: FAO and WHO. DOI: [10.4060/cc8321en](https://doi.org/10.4060/cc8321en).  
*Type:* International guidance. *Evidence:* E1.  
*Annotation:* Authoritative risk-management guidance for aerial application, including operator competence, equipment, meteorology, buffer zones, and records. It does not authorize any specific national practice; national law still governs.

**Wang, C.; Liu, Y.; Zhang, Z.; Han, L.; Li, Y.; Zhang, H.; Wongsuk, S.; Li, Y.; Wu, X.; He, X. (2022).** “Spray performance evaluation of a six-rotor unmanned aerial vehicle sprayer for pesticide application using an orchard operation mode in apple orchards.” *Pest Management Science* 78(6):2449–2466. DOI: [10.1002/ps.6875](https://doi.org/10.1002/ps.6875).  
*Type:* Primary field study. *Evidence:* E2.  
*Annotation:* Shows rotor downwash can help deposition in small/sparse apple trees, but dense/tall canopies are harder to penetrate and underside coverage is weak. Directly relevant to date palm's tall, dense crown. Do not generalize the positive result to all orchards.

**Godyń, A.; Świechowski, W.; Doruchowski, G.; Hołownicki, R.; Bartosik, A.; Sas, K. (2025).** “Spray Deposition, Drift and Equipment Contamination for Drone and Conventional Orchard Spraying Under European Conditions.” *Agriculture* 15(23):2467. DOI: [10.3390/agriculture15232467](https://doi.org/10.3390/agriculture15232467).  
*Type:* Primary comparative field study. *Evidence:* E2.  
*Annotation:* Found drift and insufficient deposition uniformity for drone spraying relative to conventional sprayers in European apple orchards. A negative finding that should temper claims of orchard drone superiority. European conditions differ from Pakistan, but the physical principles transfer.

**Portillo, H.; Barbosa, R.; Beckwith, M.; Gullen, T.; Haynie, R.; Hovinga, S.; Kesavaraju, B.; Lang, E.; Livingston, P.; Newton, N.; Oostlander, M.; Watson, G.; Sinha, R. (2025).** “Industry (UAPASTF) Response to Pesticide Regulators’ ‘State of the Knowledge’ Review of Drone Use for Pesticide Application: Best Practices for Safe and Effective Application of Pesticides.” *Drones* 9(6):388. DOI: [10.3390/drones9060388](https://doi.org/10.3390/drones9060388).  
*Type:* Industry best-practice/position paper. *Evidence:* E3; potential industry bias.  
*Annotation:* Useful checklist for calibration, release height, volume, speed, spray quality, drift, and records. It is an industry response, not independent efficacy evidence. Use for operational requirements, not for claims that drone spraying works in date palm.

**Government of India, Ministry of Agriculture and Farmers Welfare (2021).** *Standard Operating Procedure (SOP) for use of Drone application with pesticides for crop protection in agricultural, forestry, non-cropped areas, etc.* [PDF](https://croplifeindia.org/wp-content/uploads/2022/03/Drone-SOP-Final.pdf).  
*Type:* Regulatory/operational SOP. *Evidence:* E1 for process; not efficacy evidence.  
*Annotation:* Specifies pre-, during-, and post-application requirements, critical parameters, drone-specific pesticide registration, and a spray monitoring form. A useful template for what a serious jurisdiction requires.

**UK Health and Safety Executive (HSE) (n.d.).** “Aerial spraying permit arrangements.” [https://www.hse.gov.uk/pesticides/using-pesticides/general/aerial-spraying.htm](https://www.hse.gov.uk/pesticides/using-pesticides/general/aerial-spraying.htm).  
*Type:* Regulator guidance. *Evidence:* E1.  
*Annotation:* States that aerial spraying, including by drone, requires a permit referencing each application, and that there are no commercial on-label authorizations for drone pesticide application — only permits for extrapolated trials. This is a strong caution against assuming rapid commercial approval elsewhere.

**US Environmental Protection Agency (EPA) (n.d.).** “Calculating Buffer Zones: A Guide for Applicators.” [https://www.epa.gov/soil-fumigants/calculating-buffer-zones-guide-applicators](https://www.epa.gov/soil-fumigants/calculating-buffer-zones-guide-applicators).  
*Type:* Regulator guidance. *Evidence:* E1.  
*Annotation:* Shows how soil-fumigant buffer zones depend on fumigant, rate, application method, field size, and credits, with a minimum of 25 feet and a maximum of half a mile in the described framework, and credits up to 80%. Demonstrates why fumigation cannot be a simple software dispatch.

**Ohio State University CFAES (2024).** “Drones for Spraying Pesticides—Opportunities and Challenges.” Fact Sheet FABE-0540. [https://cfaes.osu.edu/fact-sheet/drones-spraying-pesticides-opportunities-and-challenges](https://cfaes.osu.edu/fact-sheet/drones-spraying-pesticides-opportunities-and-challenges).  
*Type:* Extension fact sheet. *Evidence:* E3.  
*Annotation:* Useful overview of drone spray adoption, equipment, drift, and regulatory gaps. Extension material, not a controlled trial. The URL changed from an earlier path; use the current CFAES page.

**Rocha, A. Jr.; Kientzy, D.; Singh, G. (2025).** *Economics of Drone Ownership for Agricultural Spray Applications.* University of Missouri Extension Publication G1274. [https://extension.missouri.edu/publications/g1274](https://extension.missouri.edu/publications/g1274).  
*Type:* Extension economic analysis. *Evidence:* E3.  
*Annotation:* US cost estimates: about $12.27/acre farmer-owned at 1,000 acres, $7.39/acre custom at 4,000 acres, $16/acre custom hire, $12.50/acre crop duster, break-even around 980 acres. Use as a cost-driver framework, not a Pakistan price list.

**Agricultural Pesticides Ordinance, 1971 (Ordinance No. II of 1971) and Agricultural Pesticides Rules, 1973 (consolidated).** FAOLEX. [https://faolex.fao.org/docs/pdf/pak4115.pdf](https://faolex.fao.org/docs/pdf/pak4115.pdf).  
*Type:* Primary legal instrument. *Evidence:* E1.  
*Annotation:* The historical framework for pesticide registration, labeling, and enforcement in Pakistan. It does not explicitly authorize drone application. Read with the 2022 DPP statement and the NAFSA transition.

**Department of Plant Protection (DPP), Government of Pakistan (2022).** Pesticide registration committee note, including the statement that “All the usage of drone in private sector for agriculture purposes is illegal and unlawful.” [https://plantprotection.gov.pk/tag/pesticide-registration/](https://plantprotection.gov.pk/tag/pesticide-registration/).  
*Type:* Official statement/minutes. *Evidence:* E2 for the existence of the position; not a court ruling.  
*Annotation:* Important evidence that the regulator has treated private-sector agricultural drone use as unlawful. The statement may be outdated or superseded in practice, but no public evidence of a drone-specific approval was found. Verify with the current authority.

**National Agri-Trade and Food Safety Authority Act, 2026 (Act No. IV of 2026).** [https://na.gov.pk/uploads/documents/6965f5957687e_838.pdf](https://na.gov.pk/uploads/documents/6965f5957687e_838.pdf).  
*Type:* Primary legislation. *Evidence:* E1.  
*Annotation:* Creates a new authority and a transition path for agri-trade and food safety, including pesticide regulation. Implementing regulations and provincial arrangements are the open questions. Do not assume the Act alone authorizes drone application.

**High Court of Balochistan, Research Center (2025).** *Report on the Regulatory Law of Pesticide in Balochistan.* [https://rc.bhc.gov.pk/research-memorandum/pesticide.pdf](https://rc.bhc.gov.pk/research-memorandum/pesticide.pdf).  
*Type:* Court research memorandum. *Evidence:* E2 legal analysis.  
*Annotation:* Notes that the NAFSA Ordinance 2025 repealed the APO and warns of an intra-provincial regulatory vacuum in Balochistan. Useful for understanding transition risk; not a binding ruling for all provinces.

**Dawn (2024, June 24).** “Will new drone registration rules fly or not?” By Mohammad Asghar. [https://www.dawn.com/news/1841590](https://www.dawn.com/news/1841590).  
*Type:* News reporting. *Evidence:* E3.  
*Annotation:* Describes the draft Civil Unmanned Aircraft Rules, 2024: four weight categories, registration, remote pilot licence, Ministry of Defence clearance for imports over 10 kg, and stakeholder criticism. Press report, not the legal text.

**Unmanned Airspace (2024, June 19).** “Pakistan issues new rules on UAS registration.” By Kylie Bielby. [https://www.unmannedairspace.info/uncategorized/pakistan-issues-new-rules-on-uas-registration/](https://www.unmannedairspace.info/uncategorized/pakistan-issues-new-rules-on-uas-registration/).  
*Type:* Trade press. *Evidence:* E3.  
*Annotation:* Summarizes registration timelines, the three-drone-per-year limit, categories, and remote pilot licence requirements. Corroborates the Dawn reporting. Still secondary.

**Drone Laws Pakistan (2025).** “Pakistan Drone Laws 2026,” including a quoted PCAA reply dated 2 September 2025 that the Civil Unmanned Aircraft Rules and related procedures were “still under development.” [https://drone-laws.com/drone-laws-in-pakistan](https://drone-laws.com/drone-laws-in-pakistan).  
*Type:* Third-party legal/industry guide with a quoted regulator reply. *Evidence:* E3.  
*Annotation:* Important implementation caveat: the rules may exist on paper but not be operational. The quote is only as reliable as the site's transcription; seek direct PCAA confirmation.

**PIDE (2024).** “Regulatory Constraints in Using Drone Technology.” Author: Hafsa Sarfraz. *Discourse 2024-04.* [https://pide.org.pk/research/regulatory-constraints-in-using-drone-technology](https://pide.org.pk/research/regulatory-constraints-in-using-drone-technology).  
*Type:* Policy analysis. *Evidence:* E2.  
*Annotation:* Documents registration, licensing, NOCs, and operational friction in Pakistan. Useful for the “compliance cost” argument. It is an advocacy/policy analysis, not a legal opinion.

**PIDE (2026).** *Policy Viewpoint No. 77:2026 — Responsible and Scalable Agricultural Drone Adoption in Pakistan: A CPEC 2.0 Pilot-to-Scale Pathway.* Authors: Eeman Taimur and Uzair Khaleeq-uz-Zaman. [https://pide.org.pk/research/responsible-and-scalable-agricultural-drone-adoption-in-pakistan-a-cpec-2-0-pilot-to-scale-pathway](https://pide.org.pk/research/responsible-and-scalable-agricultural-drone-adoption-in-pakistan-a-cpec-2-0-pilot-to-scale-pathway).  
*Type:* Policy viewpoint. *Evidence:* E2.  
*Annotation:* Recommends a single-window protocol and pilot-to-scale pathway; notes that spray performance varies with nozzle, droplet size, rotor airflow, altitude, speed, canopy, and weather. Useful for the regulatory and operational agenda, not for product efficacy.

## 11.5 Irrigation and Pakistan water/connectivity sources

**Allen, R.G.; Pereira, L.S.; Raes, D.; Smith, M. (1998).** *Crop evapotranspiration: Guidelines for computing crop water requirements.* FAO Irrigation and Drainage Paper 56. Rome: FAO. [https://www.fao.org/3/x0490e/x0490e00.htm](https://www.fao.org/3/x0490e/x0490e00.htm).  
*Type:* FAO standard/guideline. *Evidence:* E1.  
*Annotation:* The foundational reference for ET₀, crop coefficients, and irrigation scheduling. It provides methods, not a turnkey orchard schedule. Local calibration remains necessary.

**Pereira, L.S.; Allen, R.G.; Smith, M.; Raes, D. (2015).** “Crop evapotranspiration estimation with FAO56: Past and future.” *Agricultural Water Management* 147:4–20. DOI: [10.1016/j.agwat.2014.07.007](https://doi.org/10.1016/j.agwat.2014.07.031).  
*Type:* Review. *Evidence:* E1.  
*Annotation:* Reviews the evolution and limitations of FAO56, including local calibration and the need for accurate weather and crop data. Supports a “range + uncertainty” product design rather than a single-minute recommendation.

**Elshikha, D. et al. (2026).** *A Guide to Maintaining and Calibrating Field-Installed Soil and Plant Moisture Sensors.* University of Arizona Cooperative Extension az2193, March 2026. [https://extension.arizona.edu/publication/guide-maintaining-and-calibrating-field-installed-soil-and-plant-moisture-sensors](https://extension.arizona.edu/publication/guide-maintaining-and-calibrating-field-installed-soil-and-plant-moisture-sensors).  
*Type:* Extension guide. *Evidence:* E3.  
*Annotation:* Practical failure modes: installation, soil-specific calibration, air gaps, rodent/cable damage, drift, and maintenance. Supports the report's emphasis on sensor QC and fallback rather than blind trust.

**Li, M.; Sun, H.; Zhao, R. (2023).** “A Review of Root Zone Soil Moisture Estimation Methods Based on Remote Sensing.” *Remote Sensing* 15(22):5361. DOI: [10.3390/rs15225361](https://doi.org/10.3390/rs15225361).  
*Type:* Review. *Evidence:* E1/E2.  
*Annotation:* Surveys optical, thermal, microwave, data assimilation, and ML methods; highlights trade-offs in depth, resolution, and validation. Supports the claim that root-zone moisture is usually inferred, not directly measured, from remote sensing.

**Katimbo, A. et al. (2022).** “Crop water stress index computation approaches and their sensitivity to soil water dynamics.” *Agricultural Water Management* 266:107575. DOI: [10.1016/j.agwat.2022.107575](https://doi.org/10.1016/j.agwat.2022.107575).  
*Type:* Primary methods study. *Evidence:* E2.  
*Annotation:* Finds CWSI more sensitive when soil water depletion exceeds about 80%, meaning it can be late for proactive irrigation. Useful caution against treating canopy temperature as an early, precise stress detector.

**SDI-12 Support Group (2021).** *SDI-12: A Serial-Digital Interface Standard for Microprocessor-Based Sensors, Version 1.4*, 30 January 2021. [PDF](https://www.sdi-12.org/current_specification/SDI-12_version-1_4-Jan-30-2021.pdf).  
*Type:* Technical standard. *Evidence:* E1.  
*Annotation:* Standard interface for many environmental sensors. Supports a vendor-neutral sensor abstraction. It standardizes communication, not calibration or installation quality.

**Rain Bird (n.d.).** “IQ4 Product Development Update – NEW! BMS Integration.” [https://www.rainbird.com/professionals/iq4-product-development-update-new-bms-Integration](https://www.rainbird.com/professionals/iq4-product-development-update-new-bms-Integration).  
*Type:* Vendor documentation. *Evidence:* E4 for technical capability; not independent.  
*Annotation:* Shows IQ4 is a cloud platform with partner/API integration. Access, roles, and commercial terms apply. Good candidate for a certified adapter, not a reason to assume open access.

**Rachio (n.d.).** *Rachio API documentation.* [https://rachio.readme.io](https://rachio.readme.io).  
*Type:* Vendor API docs. *Evidence:* E4.  
*Annotation:* Public cloud API for Rachio controllers. Easier for a prototype than many commercial controllers, but cloud-dependent and subject to vendor terms.

**Hunter Industries (n.d.).** *Hydrawise API Terms of Use.* [https://www.hunterirrigation.com/support/hydrawise-api-terms-use](https://www.hunterirrigation.com/support/hydrawise-api-terms-use).  
*Type:* Vendor terms. *Evidence:* E4.  
*Annotation:* Shows Hydrawise integration is governed by contractual terms and is cloud-based. Do not assume a local, unrestricted control API. Legal review is required before writes.

**OpenSprinkler (n.d.).** *OpenSprinkler Firmware* (including API documentation). [https://github.com/OpenSprinkler/OpenSprinkler-Firmware](https://github.com/OpenSprinkler/OpenSprinkler-Firmware).  
*Type:* Open-source project documentation. *Evidence:* E4 for the software; useful for pilots.  
*Annotation:* Provides a local/HTTP API and a transparent controller for lab and field pilots. Better for vendor-neutral experimentation than for a commercial farm that already has a proprietary controller.

**Dewidar, A.Z.; Ben Abdallah, A.; Al-Fuhaid, K.M.; Essafi, N. (2015).** "Lysimeter based water requirements and crop coefficient of surface drip-irrigated date palm in Saudi Arabia." *International Research Journal of Agricultural Science and Soil Science* 5(7):173-182. [PDF](https://www.interesjournals.org/articles/lysimeter-based-water-requirements-and-crop-coefficient-of-surface-dripirrigated-date-palm--in-saudi-arabia.pdf).  
*Type:* Primary lysimeter study. *Evidence:* E2/E3.  
*Annotation:* Provides date-palm water requirements and crop coefficients under surface drip in Saudi Arabia. Useful, but site-specific; do not treat the numbers as universal.

**Al-Omran, A.; Eid, S.; Alshammari, F. (2019).** “Crop water requirements of date palm based on actual applied water and Penman–Monteith calculations in Saudi Arabia.” *Applied Water Science* 9:69. DOI: [10.1007/s13201-019-0936-6](https://doi.org/10.1007/s13201-019-0936-6).  
*Type:* Primary field/calculation study. *Evidence:* E2.  
*Annotation:* Reports date-palm water requirements and Kc values, including per-tree volumes at different ETc replacement levels. Combined with Dewidar, supports a wide range (roughly 87–297 L/day; average around 182 L/day; Kc roughly 0.74–0.91 in the cited conditions) rather than a single number.

**FAO (n.d.).** “Irrigation in the Near East Region in Figures: Pakistan.” FAO country profile. [https://www.fao.org/4/w4356e/w4356e0o.HTM](https://www.fao.org/4/w4356e/w4356e0o.HTM).  
*Type:* FAO technical report/country profile. *Evidence:* E2 (historical data).  
*Annotation:* Provides Pakistan-specific salt-affected-soil and water-table context. Citing the Soil Survey of Pakistan (1985–1990), it reports about 1.78 Mha severely saline, 0.18 Mha very severely saline, and about 2.39 Mha with a water table within 1.5 m in June 1989. These are historical figures, not current estimates; use them to show scale, and update with current provincial data before making operational claims.

**Qureshi, A.S.; McCornick, P.G.; Sarwar, A.; Sharma, B.R. (2010).** “Challenges and Prospects of Sustainable Groundwater Management in the Indus Basin, Pakistan.” *Water Resources Management* 24:1551–1569. DOI: [10.1007/s11269-009-9513-3](https://doi.org/10.1007/s11269-009-9513-3).  
*Type:* Peer-reviewed policy/hydrology analysis. *Evidence:* E2.  
*Annotation:* Describes roughly 0.8 million private tube wells, more than 90% of groundwater used for agriculture, and subsidy distortions (e.g., Balochistan electricity subsidy). Older data but still useful for structural context; update with current figures.

**Punjab Agriculture Department (n.d.).** “Water Management FAQs.” [https://agripunjab.gov.pk/wm-faqs](https://agripunjab.gov.pk/wm-faqs).  
*Type:* Government extension/FAQ. *Evidence:* E2 for program design; verify current terms.  
*Annotation:* Describes drip subsidy levels (e.g., 75% up to 7.5 acres and 60% above 7.5 acres up to 12.5 acres, with similar solar support). Subsidy details change; confirm before using in a sales proposal.

**Planning Commission, Government of Pakistan (2026).** *National Water Security under URAAN Pakistan 2026.* [https://pc.gov.pk/uploads/pub/national-water-security-23-09-2026.pdf](https://pc.gov.pk/uploads/pub/national-water-security-23-09-2026.pdf).  
*Type:* Official policy report. *Evidence:* E1/E2.  
*Annotation:* States per-capita water availability fell from more than 5,000 m³ at independence to about 850 m³, below the 1,000 m³ scarcity threshold. Useful macro context for the irrigation value proposition.

**DataReportal (2025).** *Digital 2025: Pakistan.* [https://datareportal.com/reports/digital-2025-pakistan](https://datareportal.com/reports/digital-2025-pakistan).  
*Type:* Industry data compilation. *Evidence:* E3.  
*Annotation:* Provides internet, mobile, and social media penetration estimates. Useful for product design, but methodology is industry-style, not a national statistical survey.

**ProPakistani (2026, September 17).** “Only Half of Rural Pakistani Adults Use Mobile Internet.” [https://propakistani.pk/2026/09/17/only-half-of-rural-pakistani-adults-use-mobile-internet](https://propakistani.pk/2026/09/17/only-half-of-rural-pakistani-adults-use-mobile-internet).  
*Type:* News reporting on ITU/telecom data. *Evidence:* E3.  
*Annotation:* Reports about 50% rural mobile internet use, about 78% phone ownership, and about 46% internet-enabled phone ownership. Supports offline-first and low-end-device design. Verify the underlying ITU DataHub figures for formal citations.

**Copernicus (n.d.).** *Sentinel-2 documentation.* [https://documentation.dataspace.copernicus.eu/Data/SentinelMissions/Sentinel2.html](https://documentation.dataspace.copernicus.eu/Data/SentinelMissions/Sentinel2.html).  
*Type:* Official technical documentation. *Evidence:* E1.  
*Annotation:* Confirms Sentinel-2's 13 bands, 10/20/60 m spatial resolutions, 290 km swath, and about 5-day revisit with two satellites. Supports the report's statement that 10 m pixels are often larger than tree crowns.

**John Deere (n.d.).** *Operations Center API — Get Started.* [https://developer.deere.com/precision/get-started](https://developer.deere.com/precision/get-started).  
*Type:* Vendor developer documentation. *Evidence:* E4.  
*Annotation:* Shows a major machinery data API exists for field operations. Relevant to large mechanized farms; less relevant to small orchards. Integration terms and data permissions apply.

## 11.6 Pollination and date-sector sources

**Alyafei, M.A.S.; Al Dakheel, A.; Almoosa, M.; Ahmed, Z.F.R. (2022).** “Innovative and Effective Spray Method for Artificial Pollination of Date Palm Using Drone.” *HortScience* 57(10):1298–1305. DOI: [10.21273/HORTSCI16739-22](https://doi.org/10.21273/HORTSCI16739-22).  
*Type:* Primary field study. *Evidence:* E2/E3.  
*Annotation:* Drone water-suspended pollen vs hand pollination and hand spray in Barhi, Lulu, and Khesab. Drone fruit set was lower than hand methods in Lulu and Khesab, not significantly different in Barhi; Khesab pollen efficiency was lower; authors call for more research. Important mixed result. “Commercially acceptable” is not “yield-equivalent.”

**Hassan, M.A.; Iqbal, T.; Raza, S.M.; Haq, Z.U.; Saleem, S.R.; Rehman, U.U.; Zafar, M.U. (2026).** "Investigation of artificial pollination through UAV on date palm yield." *Zoo Botanica* 4(1):9-19. DOI: [10.55627/zoobotanica.004.01.1909](https://doi.org/10.55627/zoobotanica.004.01.1909). [PDF](https://rootspress.org/journals/zoobotanica/article/download/1909/1715/11948).  
*Type:* Primary local field trial. *Evidence:* E3.  
*Annotation:* Pakistan (Chakwal) UAV trial. Manual yield was higher than UAV; UAV was faster and cheaper; the best UAV treatment produced about 26.3 kg/palm at 2 m height and 1.5 m/s, 30–40% above other UAV treatments. Low-tier, single-site evidence. Useful for local feasibility and cost, not a commercial yield claim.

**Rehna, V.J.; Inamdar, A. (2022).** “Impact of Autonomous Drone Pollination in Date Palms.” *International Journal of Innovative Research and Scientific Studies* 5(4):297–305. DOI: [10.53894/ijirss.v5i4.732](https://doi.org/10.53894/ijirss.v5i4.732).  
*Type:* Primary/observational study. *Evidence:* E4/E3.  
*Annotation:* Oman drone study reported 60–66% fruit set but lacked a manual control, so the result cannot be attributed to the drone. Weak evidence; useful only as an example of the claim landscape.

**AlRaeesi, I.; El-Khazali, R. (2026).** “AI-enabled drones for date palm pollination.” *Scientific Reports* 16:10158. DOI: [10.1038/s41598-026-39739-2](https://doi.org/10.1038/s41598-026-39739-2). [https://www.nature.com/articles/s41598-026-39739-2](https://www.nature.com/articles/s41598-026-39739-2).  
*Type:* Prototype/simulation framework. *Evidence:* E2/E3 for computer vision; not evidence of yield.  
*Annotation:* Uses YOLOv5/YOLOv8 and reports labor/time/pollen efficiency and mAP, with claims of large labor and pollen reductions. The abstract does not report fruit set, yield, or quality. Do not present it as proof of pollination outcome.

**Salomon-Torres, R.; Acosta-Perez, J.; Gutierrez-Pacheco, M.; Krueger, R.; Ruisanchez-Ortega, Y.; Oihabi, A.; Abul-Soad, A.; Zaid, A. (2024).** “Influence of pollination in liquid suspension on the date palm (Phoenix dactylifera L.) Mejhoul cultivar in Mexicali Valley, Mexico.” *Emirates Journal of Food and Agriculture* 36:1–8. DOI: [10.3897/ejfa.2024.120425](https://doi.org/10.3897/ejfa.2024.120425).  
*Type:* Primary field study. *Evidence:* E2/E3.  
*Annotation:* Ground liquid pollen suspension at 4 g/L reportedly gave 68% fruit set vs 55% control. Supports liquid pollination, not drone delivery. Single cultivar/location; treat the exact numbers as study-specific.

**Kadri, K.; Elsafy, M.; Makhlouf, S.; Awad, M.A. (2022).** “Effect of pollination time, the hour of daytime, pollen storage temperature and duration on pollen viability, germinability, and fruit set of date palm (Phoenix dactylifera L.) cv ‘Deglet Nour’.” *Saudi Journal of Biological Sciences* 29(2):1085–1091. DOI: [10.1016/j.sjbs.2021.09.062](https://doi.org/10.1016/j.sjbs.2021.09.062).  
*Type:* Primary lab/field study. *Evidence:* E2.  
*Annotation:* Shows pollination timing, time of day, storage temperature, and duration affect pollen viability/germinability and fruit set. Supports the report's point that pollen handling can dominate the result, independent of the delivery platform.

**Gao, C.; He, L.; Ding, Y.; Murengami, B.G.; Chen, J.; Zhou, C.; Ye, H.; Li, R.; Fu, L. (2025).** “A Novel Multinozzle Targeting Pollination Robot for Clustered Kiwifruit Flowers Based on Air–Liquid Dual-Flow Spraying.” *Journal of Field Robotics* 42(5):2136. DOI: [10.1002/rob.22499](https://doi.org/10.1002/rob.22499).  
*Type:* Engineering prototype/field evaluation. *Evidence:* E2/E3.  
*Annotation:* Reports 93.4% targeting rate, 88.9% fruit set, about 1.0 s/flower, and low pollen consumption in a commercial kiwifruit orchard. Strong engineering result, but crop-specific and not date palm. It is a ground robot, not a drone.

**Broussard, M.A.; Coates, M.; Martinsen, P. (2023).** “Artificial Pollination Technologies: A Review.” *Agronomy* 13(5):1351. DOI: [10.3390/agronomy13051351](https://doi.org/10.3390/agronomy13051351).  
*Type:* Review. *Evidence:* E1/E2.  
*Annotation:* Concludes most artificial pollination technologies supplement natural pollination; some crops can rely on artificial pollination alone, but effectiveness is crop- and context-specific. The right framing for a product: pollination is a managed input, not a universal replacement for bees or manual work.

**ICARDA (n.d.).** “Cost-Effective Liquid Pollination Technology for Date Palm Production.” [https://icarda.org/research/innovations/cost-effective-liquid-pollination-technology-date-palm-production](https://icarda.org/research/innovations/cost-effective-liquid-pollination-technology-date-palm-production).  
*Type:* Research/extension innovation note. *Evidence:* E3.  
*Annotation:* Describes ground-level liquid pollination with standard jet equipment and about 0.5–1 g pollen/L. Critical for comparing drone delivery with a cheaper ground method. Not a controlled trial in the cited page.

**FAO (1999).** *Date palm cultivation.* FAO Plant Production and Protection Paper 156. Chapter VIII: Pollination and bunch management (A. Zaid and P.F. de Wet). [https://www.fao.org/4/y4360e/y4360e0c.htm](https://www.fao.org/4/y4360e/y4360e0c.htm).  
*Type:* FAO technical reference. *Evidence:* E1/E2.  
*Annotation:* Describes manual pollination, repeated climbing (estimated eight to ten times from pollination through harvest), and mechanical pollination where labor is expensive or unavailable. Provides the baseline against which drone pollination must be compared.

**AOPA (2019, January 7).** “Drones deliver pollen, better fruit?” [https://www.aopa.org/news-and-media/all-news/2019/january/07/drones-deliver-pollen-better-fruit](https://www.aopa.org/news-and-media/all-news/2019/january/07/drones-deliver-pollen-better-fruit).  
*Type:* Trade media reporting vendor claims. *Evidence:* E4.  
*Annotation:* Reports Dropcopter claims of 25–50% yield increases based on its own trial experience. No independent methods/controls in the article. Use only to describe the marketing claim, not as evidence of yield benefit.

**Biobest (n.d.).** “Polly Pollination Robot.” [https://www.biobest.com/en-BE/polly-pollination-robot](https://www.biobest.com/en-BE/polly-pollination-robot).  
*Type:* Vendor marketing. *Evidence:* E4.  
*Annotation:* Describes a ground robot for greenhouse tomatoes using air pulses, marketed with bumblebees; claims 2–6% yield increase with bumblebees, one robot per hectare, about 10 hours of battery, and a 48-hour revisit. Not a drone and not date palm; useful only as a comparator for controlled-environment pollination.

**Planning Commission, Government of Pakistan (n.d.).** *Dates Cluster Report.* [https://sawie.net/wp-content/uploads/2025/01/Dates_Cluster_Report.pdf](https://sawie.net/wp-content/uploads/2025/01/Dates_Cluster_Report.pdf).  
*Type:* Government sector report. *Evidence:* E2.  
*Annotation:* Provides 2017–18 date-sector figures: about 98,415 ha and 540,606 t; Sindh about 57.3% of production; Balochistan about 54.3% of area; Punjab about 4,930 ha; Sindh about 8.0 t/ha vs Balochistan about 3.4 t/ha. Useful context, but data are dated; update with current statistics.

**Ministry of National Food Security and Research (MNFSR), Government of Pakistan (2025).** *Agricultural Statistics of Pakistan 2024–25.* [https://mnfsr.gov.pk/SiteImage/Downloads/CAP2024-25.pdf](https://mnfsr.gov.pk/SiteImage/Downloads/CAP2024-25.pdf).  
*Type:* Official statistics. *Evidence:* E1.  
*Annotation:* Current official crop area/production statistics. Use for updated date-palm figures rather than the older cluster report. Verify the table and units before quoting.

## 11.7 Key contradictions and evidence gaps

| Issue | Contradiction/gap | How the report handles it |
|---|---|---|
| **Thermal/optical RPW detection** | Some studies report high accuracy; Khawaja et al. (2020) found thermal detection lower than visual (61% vs 87%) | Report treats RPW image detection as promising but not reliable; recommends traps/acoustic/lab confirmation |
| **Drone spray orchard efficacy** | Positive deposition results in some apple trials; Godyń et al. (2025) found drift and uneven deposition vs conventional | Report does not generalize; treats date palm as a difficult case requiring local trials |
| **Drone pollination date palm** | Alyafei (2022) found lower fruit set in some cultivars; Hassan (2026) found manual yield higher; Rehna (2022) reported 60–66% without control | Report treats pollination as experimental; no yield claim; requires randomized trial |
| **AI pollination** | AlRaeesi (2026) reports detection/efficiency metrics, not fruit set/yield; media may imply more | Report distinguishes prototype metrics from agronomic outcomes |
| **Pakistan drone regulation** | DPP 2022 says private agricultural drone use is unlawful; Civil UAS Rules 2024 create a framework; PCAA says procedures are still under development; NAFSA Act 2026 creates a new authority | Report treats the position as unsettled; recommends written confirmation and pilot-only operations |
| **Pakistan pesticide law** | APO 1971 framework; NAFSA Ordinance 2025 repealed APO; NAFSA Act 2026; Balochistan HC warns of a vacuum | Report recommends legal review and does not assume a drone-specific label |
| **Irrigation savings** | ET/sensor advisory can save water, but savings depend on baseline, crop, and behavior; remote sensing root-zone estimates are indirect | Report requires measured baseline and two-season validation; no generic savings claim |
| **Connectivity** | National statistics show improving mobile internet, but rural gaps and phone ownership remain | Report requires offline-first design and field testing |
| **Economics** | US drone cost studies do not transfer to Pakistan; local labor/energy/water prices differ | Report uses US figures only as cost-driver benchmarks; local quotes required |

## 11.8 Source limitations and how to update this report

This report is a **desk review**, not a field validation. The most important limitations are:

1. **No primary interviews or site visits.** Farmer preferences, actual controller models, lab capacity, and local costs must be confirmed.
2. **No independent access to all full texts.** Some claims are abstract-level; the report labels them.
3. **Publication bias.** Positive results are more likely to be published; negative results and failed trials are underreported.
4. **Crop and cultivar heterogeneity.** Date palm studies use different cultivars, climates, pollen sources, and methods; direct comparison is difficult.
5. **Regulatory volatility.** Pakistan's drone and pesticide rules are in transition. Re-verify before any operation.
6. **Vendor claims.** Dropcopter, Arugga/Biobest, Rain Bird, Rachio, Hydrawise, and others are treated as vendor documentation, not independent evidence.
7. **Cost data.** The pilot budget is a planning envelope, not a quote. Local suppliers must price sensors, UAV services, labs, and labor.
8. **No YouTube evidence.** Videos were screened but not used for quantitative claims because they generally lack methods, controls, and independent verification.

**Recommended update cadence:** before each phase gate, re-check (a) Pakistan drone/pesticide regulation, (b) controller API terms, (c) new date-palm pollination trials, (d) local input/water/energy prices, and (e) any new RPW detection studies. Assign an owner and record the date of each review.

---

## Closing note

The most valuable thing FieldWise can build is not a drone that sprays or pollinates. It is a **trusted record of what happened in the orchard** — what was observed, what was suspected, what was confirmed, what was recommended, who approved it, who did it, and whether it worked.

That record is the foundation for every later automation. It is also the thing that makes the product honest. Build it first.

---

*End of report.*
