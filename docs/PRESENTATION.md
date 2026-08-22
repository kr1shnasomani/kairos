# KAIROS — Presentation Script

One presenter · one screen · live app · offline delivery.

**Measured: 1,154 spoken words + ~63 s of screen action.** That is **8:44 delivered** at a rehearsed
150 wpm, **9:17** if you drift to 140. Both sit inside the 8-minute slot plus its 2-minute grace, and
nowhere near the 10-minute wall.

**Pick your version before you walk up:**

| Your slot | Present | Lands at |
|---|---|---|
| Hard 8:00 bell | Take **cuts 1–4** from [§9](#9-cut-ladder--if-you-are-running-long) *before* you start | **7:52** |
| 8:00 + grace (most likely) | The full script as written | **8:44** |
| Confirmed 10:00 | Full script + **one** module from [§8](#8-optional-modules--only-if-10-minutes-is-confirmed) | **9:29** |

Do not add both modules. Do not improvise extra beats — there is no room.

Judging weights this is built against: **Innovation 25 · Business Impact 25 · Technical Excellence 20
· Scalability 15 · UX 15**. Every beat below is annotated with which weight it is buying.

Coverage of the problem statement is audited in [§7](#7-problem-statement-coverage-map) — every
"what you may build" bullet and every "evaluation focus" item is on screen at some point in these
eight minutes.

---

## 1. Pre-flight — before you walk up

**The single biggest risk is synthesis latency.** Measured p50 is 32.1 s, p95 66.0 s
(`benchmark/RESULTS.md` §2). One live Copilot query can eat 12% of your slot watching a spinner.
Every model-backed screen is **pre-run into a tab**. You switch tabs; you never wait for a load.

| # | Action | Why |
|---|---|---|
| 1 | `make dev` — confirm all containers up; open `/system-health` once and close it | A cold start mid-demo is fatal |
| 2 | Build the **10-tab** plan below, logged in, pre-loaded, in demo order | Tab order *is* the script order |
| 3 | **Pre-run Copilot Q14 in Tab 5.** Leave the cited answer on screen | Turns 32 s into a 0 s tab switch |
| 4 | **Pre-run the hydrotest refusal in Tab 6.** Leave the refusal card on screen | Same reason |
| 5 | **Pre-generate the RCA pack in Tab 7** (`EQ-101`, `SEAL-FAIL`, incident 15-Jul-2026) | ~90 s if run live. Never run it live |
| 6 | **Do a throwaway ingest once** so Temporal + NIM are warm, then reset Tab 2 with the file picked but *not* uploaded | The one live moment; warm it first |
| 7 | Zoom to 110–125%; dark or light, pick one and stay | The back row must read the source chips |
| 8 | Notifications off, Slack/mail closed, laptop on mains, sleep disabled | — |
| 9 | Tab 1 (landing) is your **fallback deck** — it carries the problem, the scenario, the architecture diagram and every benchmark number | If the stack dies you keep going |

### Tab plan — this is the running order

| Tab | URL | Persona | State when you start |
|---|---|---|---|
| 1 | `/` landing | — | Scrolled to hero |
| 2 | `/documents/ingest` | admin | Degraded-scan file **selected, not uploaded** |
| 3 | `/documents/<pid-doc-id>/topology` | admin | P&ID topology graph visible |
| 4 | `/briefs/<eq101-brief-id>` | admin | EQ-101 brief open |
| 5 | `/copilot` | admin | **Q14 asked**, answer + source chips visible |
| 6 | `/copilot` (2nd session/profile) | admin | **Hydrotest question asked**, refusal card visible |
| 7 | `/rca` | admin | EQ-101 `SEAL-FAIL` pack **already generated** |
| 8 | `/governance/moc/<id>` | admin | MoC detail for the 16.2 bar change, blast radius visible |
| 9 | `/compliance` | compliance | Gap dashboard; `/compliance/audit-pack` is one click away |
| 10 | `/field/voice` in a **390 px window** | field_worker | Recorder screen; snap it beside Tab 9 or alt-tab to it |

Log in with **Try demo** on `/login` for the admin tabs. Tab 9 uses `compliance@kairos.local` and
Tab 10 uses `field_worker@kairos.local` **on purpose** — a judge seeing a narrower sidebar is
seeing role-based access control without you having to claim it.

**Do not touch during the demo:** `/rca` *generate* (~90 s) · `/governance/model-gate` **Run**
(~12 min async) · `/management/cross-site` (deliberate honest empty state) · any benchmark harness
(`run_safety_eval.py` exhausts provider quota and returns `INVALID`).

---

## 2. The script

Every beat carries its **clock** (word counts are in the [pace card](#3-pace-card--tape-this-to-the-laptop)).
Rehearse against a stopwatch — this fails on pace, not on content. Times assume ~150 wpm plus the
screen action noted in italics.

---

### Beat 1 · Cold open — the problem · **0:00 – 0:44** *(Business Impact)*

> *Tab 1. Landing hero.*

"Every large plant in this country already owns the answer to almost every question it has — spread
across seven to twelve systems that do not talk to each other.

So people spend **thirty-five percent of their working day** looking for what already exists.
McKinsey's number. But the wasted time is not the cost."

> *Scroll to the four problem stats.*

"**Eighteen to twenty-two percent of unplanned downtime** in Indian heavy industry traces back to a
maintenance decision made without the equipment's history in front of them. And **a quarter of
India's experienced engineers retire within the decade.**

This is not a filing problem. It is a safety problem."

---

### Beat 2 · The insight — why a search box does not fix it · **0:44 – 1:12** *(Innovation)*

> *Stay on the problem section.*

"Everyone attacking this builds a better search box — enterprise search, document management, a RAG
chatbot. All of them assume you already know what to ask.

That is why they fail. **The most dangerous knowledge gaps are the ones nobody knows to search
for.** A technician who has never heard that this pump failed this way before does not think to go
looking.

So Kairos does not wait to be asked."

---

### Beat 3 · Everything gets in — ingestion, OCR, drawings · **1:12 – 2:01** *(Technical Excellence)*

> *Tab 2. File already selected. Hit upload as you start the sentence.*

"First, everything has to get in. A **degraded scan** of an OEM bulletin — what is actually in a
plant's archive, not what is in a demo. Hashed into an immutable vault, OCR'd, entities lifted,
linked into the graph."

> *Point at the pipeline timeline as it completes. ~8 s.*

"Eight seconds. Same gate for PDFs, spreadsheets, forms, handwritten shift logs, voice notes."

> *Tab 3. P&ID topology.*

"And drawings — a vision model reads the P&ID into a connected topology, which valve isolates what.
Now read that label: **candidate.** Until an engineer confirms it element by element, it may not
answer a single question."

---

### Beat 4 · The brief nobody asked for · **2:01 – 2:42** *(Innovation · Business Impact)*

> *Tab 4. EQ-101 brief.*

"This morning a work order opens on pump EQ-101. **Nobody searched.** Kairos saw the event and
assembled this.

Three things the technician does not know. This pump has failed this exact way **three times since
2018** — and both sister pumps have too. The vendor **changed the seal part number eighteen months
ago**; here is the new one. And a technician left a handwritten note about unusual vibration six
months back that was never investigated.

That last one is **labelled unverified**. Useful, so we surface it. Unconfirmed, so it never passes
as fact."

---

### Beat 5 · The answer, and its evidence · **2:42 – 3:26** *(UX · Technical Excellence)*

> *Tab 5. Answer already on screen. Read the question off the screen.*

"The question a reliability engineer asks after the incident —

**'In the May 2025 EQ-101 seal repair, was the updated part number used?'**

**No.** The old part was fitted, because the bulletin never reached maintenance stores. That is the
whole failure in one sentence — normally a week across three systems.

But the answer matters less than these. **Every claim carries its sources** — those chips open the
original document in the vault. And evidence is ranked by **authority**: a regulation outranks a
vendor manual, which outranks a local note. We never average conflicting sources. We rank them, and
show the conflict."

---

### Beat 6 · The refusal — the part nobody else builds · **3:26 – 4:26** *(Innovation — your peak)*

> *Tab 6. Refusal card already on screen. Slow down. This is the beat they remember.*

"This is the one I want you to remember.

I asked a safety-critical question — **the hydrotest pressure for a heat exchanger series.** There is
a procedure in this corpus that says hydrotest equals 110% of operating pressure. The system has the
rule. It has the pressure. **It could just multiply.**"

> *Two seconds of silence. Let them read the card.*

"It refuses. Because no source states that value **for this series**, and computing it silently is a
guess wearing a citation. So it hands over the sources and points at the human authority instead.

We ran **fifteen adversarial questions** built to make it guess — wrong premises, prompt injection,
evidence that lives only in an unverified note. **Zero unsafe answers.**

A system that always answers is easy to build and impossible to trust in a plant. Knowing when to
stay quiet is the harder half."

---

### Beat 7 · Root cause · **4:26 – 4:53** *(Business Impact)*

> *Tab 7. RCA pack already generated. Scroll timeline → hypotheses.*

"Same evidence, different job. Three retrieval passes in parallel — failure timeline from the graph,
event record from the plant systems, OEM and inspection evidence from the corpus — ranked into
**hypotheses weighted by the evidence behind each**, every one carrying the documents it stands on.
Two days of a reliability engineer's week, on one screen."

---

### Beat 8 · Blast radius — knowledge that goes stale · **4:53 – 5:41** *(Innovation · Technical Excellence)*

> *Tab 8. MoC detail with blast radius.*

"Now the harder half. A vendor bulletin drops the maximum pressure on a heat exchanger class **from
18.5 bar to 16.2**.

The danger is not the new number. It is everything downstream still quoting the old one. Kairos
traces it — **four operating procedures and two inspection records**, contaminated. All six flagged.

And it does **not** update the graph itself. A safety parameter routes into a formal **Management of
Change**, and until an engineer signs, every query touching that limit carries this banner with both
numbers.

Nothing is deleted either. Validity is **closed**, not removed — so an investigation can still ask
what the plant believed in March."

---

### Beat 9 · The auditor's view · **5:41 – 6:07** *(Business Impact · Scalability)*

> *Tab 9 — compliance persona, narrower sidebar. One click through to `/compliance/audit-pack`.*

"The same graph answers the auditor. **OISD, PESO, the Factories Act**, mapped against what the plant
actually holds. Forty-seven findings, and one click assembles the **evidence pack** with a human
sign-off line. Precision **1.000** — zero false positives across fifty-two clause-asset pairs. In
compliance, precision is the safety-relevant direction."

---

### Beat 10 · The wrench, and the knowledge cliff · **6:07 – 6:40** *(UX)*

> *Tab 10 — the 390 px field window.*

"And it reaches the person holding the wrench. Same system, on a phone. A technician records a voice
note at the pump; it transcribes and lands in **quarantine** — never straight into the graph — until
a human promotes it. No signal, it queues on the device.

And that retiring engineer: Kairos generates **micro-interviews from the gaps in the graph itself**,
so the questions are the ones only they can answer."

---

### Beat 11 · Under the hood, briefly · **6:40 – 7:13** *(Technical Excellence)*

> *Tab 1 → scroll to the architecture diagram.*

"Thirteen layers, all built. A graph store for time, a vector store for meaning, an exact index for
tag numbers — hybrid retrieval across all three, re-ranked by authority.

**Every edge carries six properties**: when it became true, when it stopped, who said it, which
document, how confident, and whether a human signed it off. That is the difference between an answer
you can check and one that is merely plausible."

---

### Beat 12 · Evidence · **7:13 – 7:59** *(Technical Excellence)*

> *Tab 1 → **Evals** section: the bar chart, then the coloured card beneath it.*

"We graded it, and published the numbers we do not like next to the ones we do.

Thirty-seven domain-expert questions, fifteen categories, graded" — *point at the card* — "**by fixed
rules. Never by another model marking its own homework.**

**Retrieval 37 of 37. Provenance 37 of 37** — every answer carried its sources. **Answer quality 33
of 37**, and **all four misses are the gate refusing rather than guessing.** We score those as
incorrect anyway.

And in the FAQ we list *what these numbers do not cover* — starting with the fact that an hour of
soak is not a shift."

---

### Beat 13 · Close · **7:59 – 8:44** *(Scalability · Business Impact)*

> *Landing hero, or hold on the architecture diagram.*

"Scaling this is a deployment arc, not a switch. **Phase one is search only** — people learn to trust
retrieval first. **Phase two turns on synthesis**, with sources. **Phase three turns on the proactive
push**, and only after push volume stays inside the **EEMUA-191** alarm-fatigue limit for thirty
days. Six briefs per operator per hour — an ignored brief is worse than no brief.

Nothing here is petrochemical-specific. The regulations and the drawings change per sector. The
platform does not.

Every plant already knows the answer. **Kairos is how it reaches the person holding the wrench
before they touch the equipment — and how it says so when it does not know.**

Thank you."

---

## 3. Pace card — tape this to the laptop

| Beat | On screen | Ends at | Words |
|---|---|---|---|
| 1 Problem | Tab 1 hero → stats | **0:44** | 101 |
| 2 Insight | Tab 1 stats | **1:12** | 70 |
| 3 Ingest + P&ID | Tab 2 → Tab 3 | **2:01** | 87 |
| 4 Brief | Tab 4 | **2:42** | 94 |
| 5 Answer | Tab 5 | **3:26** | 100 |
| 6 **Refusal** | Tab 6 | **4:26** | 135 |
| 7 RCA | Tab 7 | **4:53** | 55 |
| 8 Blast radius | Tab 8 | **5:41** | 110 |
| 9 Compliance | Tab 9 | **6:07** | 49 |
| 10 Field | Tab 10 | **6:40** | 70 |
| 11 Architecture | Tab 1 | **7:13** | 71 |
| 12 Evidence | Tab 1 | **7:59** | 99 |
| 13 Close | Tab 1 | **8:44** | 113 |

**Two checkpoints, and only two:**

- **Tab 6 (the refusal) must be on screen by 3:30.** If it is not, you are talking too slowly — speed
  up, do not cut yet.
- **Tab 8 (blast radius) must be done by 5:45.** If it is not, drop Beat 9's precision sentence and
  Beat 12's FAQ sentence on the fly. Everything after Beat 6 is compressible. Everything before it is
  not.

---

## 4. Delivery notes

- **Three sentences are the whole pitch.** Say them slower than everything else:
  *"The most dangerous knowledge gaps are the ones nobody knows to search for."* ·
  *"It could just multiply. It refuses."* ·
  *"Knowing when to stay quiet is the harder half."*
- **Never narrate the UI.** Not "as you can see here". Say the fact; let the screen prove it.
- **Never read a number off a slide that is also on screen.** Point instead.
- **Hands off the trackpad while a sentence is running.** Switch tabs in the gap between beats, not
  mid-clause — a tab switch under a sentence reads as nervousness.
- **The refusal beat gets a two-second silence** *before* "It refuses" — after "It could just
  multiply." That silence is doing work.
- If something breaks, say it plainly once — *"live stack is down, same story on the page"* — switch
  to Tab 1, keep going. **Never debug on stage.**

---

## 5. Claim-accuracy guardrails — what NOT to say

Everything in §2 is checkable against the repo. These are the neighbouring claims that are **not**
true, and are easy to slip into under pressure:

| Do not say | Say instead |
|---|---|
| "Connected to a live plant / real refinery data" | "Authored golden corpus — 32 files, 24 documents in the vault, no historian, no EAM — stated on our landing page" |
| "Hindi / Hinglish document support" | "Handwritten and degraded-scan documents" — multilingual is deferred, not shipped |
| "Memory is flat under load" | "No leak signal over a 60-minute window" — that is the harness verdict |
| "Hybrid retrieval beats semantic search" | "Hybrid matches the best single arm and adds authority ordering and redundancy" (n=37, CIs overlap) |
| "89% accuracy" alone | "33 of 37 — and all four misses are safe refusals we graded as wrong" |
| "The model gate blocks bad models automatically" | "It scores and reports; enforcement ships off by design" |
| "Multi-site" | Single-site MVP; the cross-site screen shows an honest empty state |
| "Predictive maintenance / we predict failures" | "It surfaces the failure history and matching telemetry signature before the work starts" |

---

## 6. Q&A bank

| Question | Answer |
|---|---|
| **"How is this different from ChatGPT over our documents?"** | A chatbot returns text. We return text **plus provenance**, ranked by authority, and we refuse on safety questions with thin evidence. Retrieval and citation are graded deterministically, not by another model. |
| **"Is the data real?"** | Authored and synthetic **by design** — a 32-file corpus modelling a petrochemical complex (24 documents in the vault), with a canon file as the answer key. No historian, no EAM. It is on the landing page, not hidden. That is the MVP boundary. |
| **"Why is answer quality only 89%?"** | All four misses are safe refusals graded as incorrect. Retrieval and provenance are both 37/37. We chose the harsher grading. |
| **"Synthesis takes 30 seconds — too slow?"** | For a brief that arrives before you leave the workshop, no. p50 is 32 s at a 60 s cap on Llama 3.1 70B. A lower cap gives a prettier number that measures the *fallback* model, not the production one. |
| **"What stops someone poisoning the knowledge base?"** | Low-confidence extractions cannot reach the graph without human promotion; safety parameters need a signed MoC; the vault is immutable so originals survive; every promotion is audit-logged. |
| **"How do you know your own retrieval works?"** | Our retrieval baseline harness measured semantic-only at **0 of 37** one day — that is how we found that a Qdrant filter on an unindexed field was silently failing and hybrid search had degraded to Elasticsearch-only across the whole system. **No unit test caught it. The benchmark did.** |
| **"Does it scale?"** | 2,275 requests, 0% errors, knee at 50 concurrent users; a 60-minute soak on cloud stores with no leak signal and 0.11% errors across 37,842 requests. What it does *not* prove is ten thousand assets — we say that on the page. |
| **"What if the LLM provider goes down?"** | Synthesis cascades NIM → OpenRouter → Gemini → local. OpenRouter serves the *same* Llama 3.1 70B, so a fallthrough does not change which model answered — and the benchmark marks a run invalid if a fallback answered. |
| **"Does it work offline?"** | Field capture does — voice notes and deviation flags queue on the device and sync when signal returns. |
| **"How long to deploy?"** | Value on day one from search alone. Entity mapping by day 60, graph plus assisted synthesis by day 90, proactive briefs at month six once the push-rate gate passes. |
| **"What if the vision model can't read our drawings?"** | It says so. A P&ID it cannot parse falls back to a disclosed placeholder that the UI labels as such — it never invents a valve tag. And even a successful parse stays **candidate** until an engineer verifies it element by element; unverified topology is not allowed to answer a question. |
| **"Who can change what?"** | Five seeded roles enforced at the API, not just the UI. An engineer resolves conflicts but is **refused** quarantine promotion; only reliability and admin may promote. A permit brief needs **two distinct signatures** and the countersigner cannot be the recipient. |

---

## 7. Problem-statement coverage map

Use this to check yourself, and to answer *"did you build all of it?"*

### "What you may build" — all five, all on screen

| PS bullet | Beat | What the judge sees |
|---|---|---|
| Universal document ingestion & knowledge-graph agent | **3** | Live upload of a degraded scan → vault → OCR → entities → graph in ~8 s; P&ID parsed to topology |
| Expert knowledge copilot | **5**, **10** | Cited answer with authority ranking; same product on a 390 px phone window |
| Maintenance intelligence & RCA agent | **4**, **7** | Proactive brief from a work-order event; RCA timeline + weighted hypotheses |
| Quality & regulatory compliance intelligence | **9** | OISD/PESO/Factories Act gap dashboard + one-click audit evidence pack |
| Lessons learned & failure intelligence | **4**, **8** | A repeat-failure pattern across three sister pumps surfaced unasked; blast radius of a stale spec |

### "Evaluation focus" — every item has a number or a screen

| Focus area | Where |
|---|---|
| Entity extraction accuracy across document types | F1 **0.805** on 40 labels, `VALID`, zero fallbacks — Beat 12 / Q&A |
| Query answer quality on domain-expert questions | **33/37**, 15 categories, deterministic grading — Beat 12 |
| Knowledge-graph linkage completeness | **10/10 golden assets linked**, 45 edges — quote in Q&A; Beat 4 and Beat 8 show the linkage doing work |
| Time-to-answer vs traditional search | Beat 5: one cited document vs a week across three systems. *If pushed for the number*: our own harness says BM25 already finds the fact at rank 1.35 on a 20-document corpus, so the modelled human-time saving is only **9.5%** — corpus size sets that floor, and we publish it rather than inflate it |
| Compliance gap detection accuracy | **P 1.000 · R 0.838 · F1 0.912**, zero false positives — Beat 9 |
| Cross-functional knowledge discovery | Beat 4 — a maintenance work order pulls in an OEM bulletin, a repair record and a field note from four separate systems, unasked |
| Validated with real industrial document samples | **Say the boundary plainly**: synthetic-by-design corpus, real public regulatory clause text (OISD-STD-105/128/134, PESO Rules 2016, Factories Act S.31/36/87) |

### Deliverables — one is not in the repo yet

| Deliverable | State |
|---|---|
| Working prototype | ✅ live — this demo |
| Architecture diagram | ✅ landing page `#system` + `docs/ARCHITECTURE.md` + `docs/DIAGRAMS.md` |
| Presentation deck | ⚠️ **`demo/ppt.pdf` does not exist.** `README.md` links to `./demo/ppt.pdf`, `./demo/docs.pdf` and `./demo/demo-video.mp4`, and the whole `demo/` directory is missing — three broken links on the front page of the repo. Either add the folder or drop the links **before** judging |
| Demo video | ⚠️ Same. The landing page's **Watch demo** button points at a working **Google Drive** link, not at `demo/demo-video.mp4`. Make the README match |

---

## 8. Optional modules — only if 10 minutes is confirmed

Insert **after Beat 11**. Pick **one** — the full script plus both modules is 10:04, which is over the
wall. Do not use these to fill time you were not given.

### Module A · Governance is real, not a slide · +45 s

> *Governance → quarantine, logged in as engineer.*

"One thing worth proving rather than claiming. This is the quarantine gate, as an **engineer**.
Promote — **refused**. Same action as a **reliability engineer** — allowed, and the fact appears in
the graph. That is enforced at the API, not hidden in the UI. A role that can open a page but cannot
call its API is a broken page, not a closed boundary."

### Module B · Time travel · +35 s

> *`/graph`, EQ-101, set `as_of`.*

"And because every fact is a time-bounded edge, you can ask the graph what it knew on a date. Today
EQ-101 carries seven facts. As of 2020 — **nothing**, because none of it was true yet. That is what
an incident investigation actually needs, and it is why we close validity instead of overwriting."

---

## 9. Cut ladder — if you are running long

Cut **in this order**. Each line is written so the script still reads clean without it. Savings are
measured, not estimated.

| # | Cut | Saves | Cost |
|---|---|---|---|
| 1 | **Beat 7 (RCA) entirely.** Instead, one sentence over Tab 4: *"and the same evidence assembles a root-cause pack — timeline, weighted hypotheses, sources."* | **–22 s** | Medium. You lose a PS bullet on screen; it survives in Q&A |
| 2 | **Beat 1:** the retirement-stat sentence | **–8 s** | Low — Beat 10 re-raises the knowledge cliff |
| 3 | **Beat 9:** the precision-1.000 sentence. Keep the audit-pack click | **–11 s** | Low — the number returns in Q&A |
| 4 | **Beat 12:** the FAQ sentence | **–8 s** | Low |
| 5 | **Beat 3:** the "same gate for PDFs, spreadsheets…" list | **–6 s** | Medium — that list *is* "heterogeneous formats" |
| 6 | **Beat 11:** the datastore sentence. Keep the six edge properties | **–11 s** | Medium |
| 7 | **Beat 10:** the micro-interview sentence. Keep the phone and quarantine | **–11 s** | High — drops the knowledge-cliff payoff |
| 8 | **Beat 8:** the "nothing is deleted" paragraph | **–12 s** | High — drops time-travel, one of your three best ideas |

**Cuts 1–4 = 7:53.** That is the version to rehearse if the bell is hard at 8:00.
**All eight = 7:15**, and by then you are cutting muscle.

**Never cut, at any length:** Beat 2 (the insight) · Beat 6 (the refusal) · the final two sentences of
Beat 13. Those three *are* the differentiator; everything else is supporting evidence for them.

---

## 10. If the stack fails

Tab 1 alone tells the whole story: problem, the one-pump scenario end to end, the architecture
diagram, every benchmark number, and the honest-limits block. Say it once — *"the live stack is
down, here is the same story on the page"* — and present the landing page top to bottom against the
same beat order. **Do not debug on stage.** A calm fallback reads as engineering maturity; a
presenter poking at Docker reads as a broken product.
