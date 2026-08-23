# KAIROS — Presentation Script (FINAL)

One presenter · one screen · the live app · no slides.

This file is the whole thing: what to click, what to say, what **not** to say, and which of the app's
44 screens you show and which you leave shut. Read [§1](#1-timing--pick-your-version) and
[§3](#3-the-10-screens-you-will-show) first, rehearse [§4](#4-the-script) with a stopwatch, print
[§5](#5-pace-card--tape-this-to-the-laptop).

Judged on: **Innovation 25 · Business Impact 25 · Technical Excellence 20 · Scalability 15 · UX 15.**
Every beat says which of those it is buying.

---

## 1. Timing — pick your version

Measured, not guessed: **1,219 spoken words + ~63 s of clicking and loading.**

Four passages in [§4](#4-the-script) are tagged **⟨CUT FOR 8:00⟩**. They are the four cheapest things
to lose, in the order to lose them. Skipping all four saves **61 seconds**.

| Your slot | What to present | Lands at |
|---|---|---|
| **Hard 8:00 bell** | Full script **minus the four ⟨CUT FOR 8:00⟩ passages**. Strike them out on your printout before you go up | **8:09** |
| **8:00 + grace** (most likely) | Everything as written | **9:10** |
| **Confirmed 10:00** | Everything, plus **one** module from [§11](#11-optional-modules) | **9:55** |

Those times assume 150 words a minute. At 140 you land at 9:45 for the full version, so if you are a
slow talker, present the 8:00 version even when you have grace.

**Do not** add both optional modules. **Do not** improvise an extra screen. There is no room.

**Rehearse the 8:00 version first.** If it is comfortable, add the four passages back. Doing it the
other way round means cutting under pressure, which is when people cut the wrong thing.

---

## 2. Pre-flight — before you walk up

**The one real risk is synthesis speed.** A Copilot answer takes about 32 seconds (p50), and can take
66 (p95). One live question eats 12% of your slot watching a spinner. So **every model-backed screen
is asked and answered before you present**, and left sitting on its tab. You switch tabs. You never
wait.

| # | Do this | Why |
|---|---|---|
| 1 | `make dev`. Check every container is up. Open `/system-health` once, then close it | A cold start on stage is fatal |
| 2 | Build the 10 tabs in [§3](#3-the-10-screens-you-will-show), in that order, already logged in | Tab order **is** the script order |
| 3 | Ask Copilot **Q14** in Tab 5. Leave the answer and its sources on screen | Turns 32 s into a 0 s tab switch |
| 4 | Ask the **hydrotest** question in Tab 6. Leave the refusal card on screen | Same reason |
| 5 | Generate the RCA pack in Tab 7 (`EQ-101`, `SEAL-FAIL`, 15-Jul-2026) | Takes ~90 s live. Never run it live |
| 6 | Do **one throwaway ingest** to warm Temporal and the model. Then reload Tab 2 and pick the file again — but **do not** upload it | Beat 3 is your only live moment. Warm it first |
| 7 | Zoom the browser to 110–125%. Pick light or dark and stay there | The back row must be able to read the source chips |
| 8 | Notifications off. Slack and mail closed. Laptop on mains. Sleep disabled | — |
| 9 | Know that **Tab 1 is your backup deck** — the landing page carries the problem, the story, the architecture diagram and every number | If the stack dies, you keep going |

### One decision to make before demo day

The headline answer-quality number, **33 out of 37**, is from the sweep on 16 August. Since then the
bugs behind all four failures were fixed, and on 23 August each of those four questions was checked
live and **now answers correctly** (`benchmark/RESULTS.md` §2). The old number is therefore stale —
and stale in your favour.

You have two choices, and both are fine:

- **Re-run `run_benchmark.py`** before the demo and quote the fresh number. Costs 37 synthesis calls
  of provider quota. Do it at least a day early, not on the morning.
- **Quote 33/37 and say it is stale.** Beat 12 is already written this way, and it reads as
  discipline rather than weakness.

**Never** quote a number you have not re-run. That is the whole reason your evidence is worth
anything.

### Do not touch these on stage

| Screen | Why not |
|---|---|
| `/rca` **Generate** button | ~90 s of dead air. Tab 7 is pre-generated |
| `/governance/model-gate` **Run** button | ~2.5-minute background job, ~15 model calls |
| Any file in `benchmark/` | `run_safety_eval.py` burns provider quota and then reports `INVALID` |
| `/management/cross-site` | Deliberate empty state. Correct, but not a demo screen |
| `/system-health` model probes | They spend quota. Off by default for a reason |

---

## 3. The 10 screens you will show

Ten tabs, in this order. Three of them use a different login on purpose — when a judge sees a shorter
sidebar, they are seeing role-based access control without you claiming anything.

| Tab | Route | Logged in as | State before you start | Used in |
|---|---|---|---|---|
| **1** | `/` | not logged in | Scrolled to the top | Beats 1, 2, 11, 12, 13 |
| **2** | `/documents/ingest` | admin | Degraded scan **picked, not uploaded** | Beat 3 |
| **3** | `/documents/<pid-id>/topology` | admin | P&ID topology graph on screen | Beat 3 |
| **4** | `/briefs/<eq101-brief-id>` | admin | EQ-101 brief open | Beat 4 |
| **5** | `/copilot` | admin | **Q14 asked**, answer + source chips visible | Beat 5 |
| **6** | `/copilot` (second browser profile) | admin | **Hydrotest question asked**, refusal card visible | Beat 6 |
| **7** | `/rca` | admin | EQ-101 `SEAL-FAIL` pack **already generated** | Beat 7 |
| **8** | `/governance/moc/<id>` | admin | MoC for the 16.2 bar change, blast radius visible | Beat 8 |
| **9** | `/compliance` | `compliance@kairos.local` | Gap dashboard. `/compliance/audit-pack` one click away | Beat 9 |
| **10** | `/field/voice` in a **390 px wide window** | `field_worker@kairos.local` | Recorder screen | Beat 10 |

Use **Try demo** on `/login` for the admin tabs. Log Tab 9 and Tab 10 in by hand with their own
accounts.

> Tab 6 needs a second browser profile (or an incognito window) so it holds its own Copilot session.
> Two tabs of the same profile will overwrite each other's conversation.

**Which of the other 34 screens you show, and why not:** see [§7](#7-all-44-screens--shown-or-not).

---

## 4. The script

Each beat is written as **SCREEN → DO → SAY**. Say the words as written; they are timed. The clock in
the heading is when that beat **ends**.

---

### Beat 1 · The problem · ends **0:47** *(Business Impact)*

**SCREEN** — Tab 1, `/`, the top of the landing page.
**DO** — Stand still. Do not click anything for the first two sentences. Then scroll down slowly to
the four problem numbers.

**SAY:**

> "Every large plant in this country already has the answer to almost every question it has. It is
> just spread across seven to twelve systems that do not talk to each other.
>
> So people spend **thirty-five percent of their working day** looking for something that already
> exists — that is McKinsey's number. But the lost time is not the real cost."

*(scroll to the four numbers)*

> "**Eighteen to twenty-two percent of unplanned downtime** in Indian heavy industry happens because
> someone decided without the full history of that machine in front of them. ⟨CUT FOR 8:00 — the next
> sentence⟩ And **a quarter of India's experienced engineers retire in the next ten years.**
>
> This is not a filing problem. It is a safety problem."

---

### Beat 2 · Why a search box does not fix it · ends **1:15** *(Innovation)*

**SCREEN** — Tab 1, still on the problem section.
**DO** — Nothing. Just talk. This beat is the idea the whole project rests on, so let it be still.

**SAY:**

> "Everyone who attacks this builds a better search box — enterprise search, document management, a
> chatbot over your PDFs. All of them assume you already know what to ask.
>
> That is why they fail. **The most dangerous gaps are the ones nobody knows to search for.** A
> technician who has never heard that this pump failed this way before does not go looking.
>
> So Kairos does not wait to be asked."

---

### Beat 3 · Everything gets in · ends **2:09** *(Technical Excellence)*

**SCREEN** — Tab 2, `/documents/ingest`, then Tab 3, `/documents/<id>/topology`.
**DO** — Click **Upload** as you start the first sentence. Keep talking while it runs. Point at the
pipeline timeline when it turns green — that takes about 8 seconds. Then switch to Tab 3.

**SAY:**

> "First, everything has to get in. This is a **blurry scan** of a vendor bulletin — what is really in
> a plant's archive, not what is in a demo. It is hashed, stored in a vault that never deletes, read
> by OCR, and its entities go into the graph."

*(point at the finished timeline)*

> "Eight seconds. Same door for PDFs, spreadsheets, forms, handwritten shift logs and voice notes."

*(switch to Tab 3)*

> "And drawings. A vision model reads this P&ID into a map of which valve shuts off what. Now read
> that label: **candidate.** Until an engineer checks it element by element, this map may not answer a
> single question."

---

### Beat 4 · The brief nobody asked for · ends **2:53** *(Innovation · Business Impact)*

**SCREEN** — Tab 4, `/briefs/<eq101-brief-id>`.
**DO** — Point at each of the three items as you say them. Point at the **unverified** label on the
third one and leave your hand there for a second.

**SAY:**

> "This morning a work order opens on pump EQ-101. **Nobody searched.** Kairos saw the work order and
> built this by itself.
>
> Three things the technician almost certainly does not know. This pump has failed the same way
> **three times since 2018** — and both sister pumps have too. The vendor **changed the seal part
> number eighteen months ago**; here is the new one. And six months back a technician wrote a note
> about strange vibration that nobody followed up.
>
> That last one is **marked unverified**. Useful, so we show it. Not confirmed, so it never passes as
> a fact."

---

### Beat 5 · The answer, and where it came from · ends **3:38** *(UX · Technical Excellence)*

**SCREEN** — Tab 5, `/copilot`, answer already on screen.
**DO** — Read the question off the screen so the room knows you did not pick it just now. Then point
at the source chips.

**SAY:**

> "Now the question a reliability engineer really asks after the incident —
>
> **'In the May 2025 EQ-101 seal repair, was the updated part number used?'**
>
> **No.** The old part was fitted, because the bulletin never reached the store. That is the whole
> failure in one sentence — normally a week across three systems.
>
> But two things matter more than the answer. **Every claim carries its sources** — those chips open
> the original document. And evidence is ranked by **authority**: a regulation beats a vendor manual,
> which beats a local note. We never average two sources that disagree. We rank them and show the
> disagreement."

---

### Beat 6 · The refusal · ends **4:38** *(Innovation — this is your peak)*

**SCREEN** — Tab 6, `/copilot`, refusal card already on screen.
**DO** — Slow right down. After "It could just multiply", **stop talking for two seconds** and let
them read the card. This is the beat they will remember you for.

**SAY:**

> "This is the one I want you to remember.
>
> I asked it a safety question — **the hydrotest pressure for a heat exchanger series.** A procedure in
> this corpus says hydrotest is 110% of operating pressure. The system has that rule. It has the
> pressure. **It could just multiply.**"

*(two seconds of silence)*

> "It refuses. Because no document states that value **for this series**, and doing that maths quietly
> would be a guess with a citation stuck on it. So it hands you the sources instead.
>
> We tested this. **Fifteen questions built to make it guess** — wrong facts planted in them, prompt
> injection, evidence that only exists in an unverified note. **Zero unsafe answers.**
>
> A system that always answers is easy to build and impossible to trust in a plant. Knowing when to
> stay quiet is the harder half."

---

### Beat 7 · Root cause · ends **5:06** *(Business Impact)* · **⟨CUT FOR 8:00 — the whole beat⟩**

**SCREEN** — Tab 7, `/rca`, pack already generated.
**DO** — Scroll once through the timeline, then stop on the ranked causes. Do not read them out.
**IF CUTTING FOR 8:00** — skip Tab 7 entirely. Add one sentence to the end of Beat 6, still on Tab 6:
*"The same evidence also builds a root-cause pack — timeline, ranked causes, sources."* Then go
straight to Tab 8.

**SAY:**

> "Same evidence, different job. Three searches at once — the failure timeline from the graph, the
> event record from the plant systems, the vendor and inspection evidence from the documents. It comes
> back as **possible causes ranked by how much evidence sits behind each**, each carrying its
> documents. Two days of a reliability engineer's week, on one screen."

---

### Beat 8 · Knowledge that goes stale · ends **5:54** *(Innovation · Technical Excellence)*

**SCREEN** — Tab 8, `/governance/moc/<id>`, blast radius visible.
**DO** — Point at the six affected documents. Then point at the pending-MoC banner.

**SAY:**

> "Now the harder half. A vendor bulletin drops the maximum pressure on a heat exchanger class **from
> 18.5 bar to 16.2**.
>
> The danger is not the new number. It is everything downstream still quoting the old one. Kairos
> traces it — **four operating procedures and two inspection records** are now wrong. All six flagged.
>
> And it does **not** change the graph by itself. A safety limit goes into a formal **Management of
> Change**, and until an engineer signs, every answer touching that pressure carries this banner.
>
> We never delete either. The old fact is **closed**, not removed — so an investigation can still ask
> what the plant believed in March."

---

### Beat 9 · The auditor's view · ends **6:24** *(Business Impact · Scalability)*

**SCREEN** — Tab 9, `/compliance`, logged in as the compliance officer. Then one click to
`/compliance/audit-pack`.
**DO** — Do not mention the shorter sidebar. Let them notice. Click through to the audit pack on the
word "one click".

**SAY:**

> "The same graph answers the auditor. **OISD, PESO, the Factories Act** — mapped against what the
> plant actually holds. Forty-seven findings, and one click builds the **evidence pack**, with a human
> signature line on it. ⟨CUT FOR 8:00 — the rest of this beat⟩ Precision on our test set is **1.000** —
> zero false alarms across fifty-two clause and asset pairs. In compliance, false alarms are the
> direction that hurts."

---

### Beat 10 · The wrench, and the knowledge cliff · ends **6:59** *(UX)*

**SCREEN** — Tab 10, `/field/voice` in the 390 px window, logged in as the field worker.
**DO** — Bring the narrow window forward so the phone shape is obvious. Do not tap record.

**SAY:**

> "And it reaches the person holding the wrench. Same system, on a phone. A technician records a voice
> note at the pump. It gets transcribed and lands in **quarantine** — never straight into the graph —
> until a human promotes it. No signal, it waits on the device.
>
> And that retiring engineer: Kairos writes **short interviews out of the gaps in the graph itself**,
> so the questions are the ones only that person can answer."

---

### Beat 11 · Under the hood · ends **7:32** *(Technical Excellence)*

**SCREEN** — Tab 1, scrolled to the architecture diagram (`#system`).
**DO** — Point at the diagram once. Do not walk through it. Thirty seconds, then move.

**SAY:**

> "Thirteen layers, all built. A graph store for time, a vector store for meaning, a search index for
> exact tag numbers — searched together, re-ranked by authority.
>
> **Every fact carries six things**: when it became true, when it stopped, who said it, which document,
> how confident, and whether a human signed it off. That is the difference between an answer you can
> check and an answer that just sounds right."

---

### Beat 12 · Evidence · ends **8:19** *(Technical Excellence)*

**SCREEN** — Tab 1, the **Evals** section: the bar chart, then the coloured card under it.
**DO** — Point at the card that says *"Fixed rules, never another model."* Do not read the bars out
one by one.

**SAY:**

> "We published the numbers we do not like next to the ones we do.
>
> Thirty-seven expert questions, fifteen categories, graded" — *(point at the card)* — "**by fixed
> rules. Never by another model marking its own homework.**
>
> **Retrieval, 37 of 37. Sources, 37 of 37** — every answer carried its sources. **Answer quality, 33
> of 37** on our last full run.
>
> ⟨CUT FOR 8:00 — this last paragraph⟩ And here is the honest part. Since that run we fixed the bugs
> behind all four failures, and each one now answers correctly. That number is old, and old in our
> favour. We still quote it, because **we do not quote a score we have not re-run.**"

---

### Beat 13 · Close · ends **9:10** *(Scalability · Business Impact)*

**SCREEN** — Tab 1. Either the hero at the top, or hold on the architecture diagram.
**DO** — Stop clicking. Face the room for the last three sentences.

**SAY:**

> "Rolling this out is staged, not a switch. **Stage one is search only** — no AI answers, no push.
> People learn to trust it finding things first. **Stage two turns on the answers**, with sources.
> **Stage three turns on the proactive briefs**, and only after the push rate has stayed inside the
> **EEMUA-191** alarm limit for thirty days. Six briefs per operator per hour — a brief that gets
> ignored is worse than no brief.
>
> None of this is specific to petrochemicals. The regulations and the drawings change per sector. The
> platform does not.
>
> Every plant already knows the answer. **Kairos is how that answer reaches the person holding the
> wrench before they touch the machine — and how it tells them when it does not know.**
>
> Thank you."

---

## 5. Pace card — tape this to the laptop

Full version. **⚑** marks a ⟨CUT FOR 8:00⟩ passage.

| Beat | Screen | Ends | Words | ⚑ |
|---|---|---|---|---|
| 1 The problem | Tab 1 top → stats | **0:47** | 106 | ⚑ one sentence |
| 2 Search box | Tab 1 stats | **1:15** | 70 | |
| 3 Ingest + P&ID | Tab 2 → Tab 3 | **2:09** | 100 | |
| 4 Brief | Tab 4 | **2:53** | 100 | |
| 5 Answer | Tab 5 | **3:38** | 102 | |
| 6 **Refusal** | Tab 6 | **4:38** | 135 | |
| 7 RCA | Tab 7 | **5:06** | 58 | ⚑ whole beat |
| 8 Blast radius | Tab 8 | **5:54** | 111 | |
| 9 Compliance | Tab 9 | **6:24** | 60 | ⚑ last two sentences |
| 10 Field | Tab 10 | **6:59** | 74 | |
| 11 Architecture | Tab 1 | **7:32** | 70 | |
| 12 Evidence | Tab 1 | **8:19** | 105 | ⚑ last paragraph |
| 13 Close | Tab 1 | **9:10** | 128 | |

**With all four ⚑ cut, the clock runs:** 0:39 · 1:07 · 2:01 · 2:45 · 3:30 · 4:30 · *(skip)* · 5:18 ·
5:37 · 6:12 · 6:45 · 7:23 · **8:09**.

**Two checkpoints. Only two.**

- **Tab 6 — the refusal — must be on screen by 4:40** (by 4:30 on the 8:00 version). If it is not, you
  are speaking too slowly. Speed up. Do not start cutting yet.
- **Tab 8 — blast radius — must be finished by 6:00** (5:20 on the 8:00 version). If it is not, drop
  the ⚑ passages in Beats 9 and 12 on the fly.

Everything **after** Beat 6 can be squeezed. Everything **before** it cannot.

---

## 6. How to sound — tone notes

- **Talk like an engineer explaining a real problem to another engineer.** Not like a pitch. Flat,
  confident, specific. No "amazing", no "revolutionary", no "game changer".
- **Say the fact. Let the screen prove it.** Never say "as you can see here" or "this screen shows".
  The screen shows it. You say what it means.
- **Short sentences. One idea each.** If you run out of breath in a sentence, it is too long — cut it
  in half when you rehearse.
- **Three lines are the whole pitch.** Say these three slower than everything else, and pause after
  each:
  1. *"The most dangerous gaps are the ones nobody knows to search for."*
  2. *"It could just multiply."* … *"It refuses."*
  3. *"Knowing when to stay quiet is the harder half."*
- **Hands off the trackpad while a sentence is running.** Switch tabs in the gap between beats, never
  under a clause. Clicking mid-sentence reads as nerves.
- **Never read a number off the screen that the room can already see.** Point at it instead.
- **If something breaks, say so once and move on.** "The live stack is down — same story on the page."
  Then go to Tab 1 and keep going. **Never debug on stage.** A calm fallback looks like a mature
  engineer. Poking at Docker looks like a broken product.

---

## 7. All 44 screens — shown or not

The app has **44 routes**. You will show **11 of them** across 12 screens (`/copilot` appears twice, as
two separate sessions). The other 33 stay shut, on purpose. The point of this table is that when a
judge asks *"what else is in there?"*, you answer in one sentence instead of clicking around.

**11 shown · 16 held in reserve · 17 deliberately closed = 44.**

### Shown during the run — 11 routes, 12 screens

| Route | Beat | What it proves |
|---|---|---|
| `/` | 1, 2, 11, 12, 13 | Problem, story, architecture, all the numbers. Also the fallback deck |
| `/documents/ingest` | 3 | Any format in, ~8 s, vault + OCR + entities + graph. Your only live moment |
| `/documents/<id>/topology` | 3 | Drawings read by a vision model; topology stays **candidate** until verified |
| `/briefs/<id>` | 4 | Proactive brief with no query; unverified evidence labelled, not hidden |
| `/copilot` (session 1) | 5 | Cited answer, ranked by authority |
| `/copilot` (session 2) | 6 | Safety refusal instead of a plausible guess |
| `/rca` | 7 | Failure timeline plus causes ranked by evidence |
| `/governance/moc/<id>` | 8 | Blast radius, Management of Change, nothing deleted |
| `/compliance` | 9 | Regulatory gap detection against real clause text |
| `/compliance/audit-pack` | 9 | Auto-built audit evidence with a human signature line |
| `/field/voice` | 10 | Mobile field capture, offline queue, straight into quarantine |
| `/login` | pre-flight | Five real personas. Judges see three different sidebars during the run |

### Held in reserve — open only if asked — 16

Have these bookmarked. Do **not** open them unprompted.

| Route | Open it if they ask |
|---|---|
| `/governance/quarantine` | "How do you stop bad data getting in?" — also **Module A** in §11 |
| `/graph` | "Can you really query the past?" — also **Module B** in §11 |
| `/briefs` | "How many briefs does an operator actually get?" (the governor state is on this page) |
| `/assets` · `/assets/<id>` | "What does one machine's record look like?" |
| `/documents` · `/documents/<id>` | "Where do the source documents live?" |
| `/events` | "What triggers a brief?" |
| `/audit` | "Is any of this auditable?" — 630 logged actions |
| `/system-benchmarks` | "Show me the numbers inside the product" |
| `/system-information` | "Explain the 13 layers" |
| `/management` | "What does a plant manager see?" |
| `/management/coverage` | "Which assets have no knowledge attached?" |
| `/governance` · `/governance/conflicts` | "What happens when two documents disagree?" |
| `/governance/moc` | "How many changes are waiting on a signature?" — the queue behind the Beat 8 screen |

### Deliberately closed — 17

| Route | Why not |
|---|---|
| `/governance/model-gate` | The **Run** button is a ~2.5-minute background job and ~15 model calls |
| `/system-health` | Admin-only, and the model probes spend provider quota |
| `/management/cross-site` | An honest "no data — this is a single-site deployment" state. Correct, but it looks like a bug to someone who does not know that |
| `/governance/sla` · `/governance/circuit-breaker` | Real, but they need a paragraph of setup each to make sense. Q&A material |
| `/compliance/nonconformance` | Beat 9 already makes the compliance point |
| `/documents/compare` · `/assets/bootstrap` · `/projects` · `/settings` | Real, but no story beat needs them |
| `/events/<id>` · `/management/plant-state` | Same |
| `/field/deviation` · `/field/elicitation/<id>` · `/field/voice/<id>` | Beat 10 covers field capture. Three field screens is one too many |
| `/offboarding` · `/offboarding/<id>` | The knowledge-cliff answer is already spoken in Beat 10. Opening it costs 30 s you do not have |

**If someone says "you only showed us a slice":** every one of the 44 routes has been driven
end-to-end, five personas each, with the results written down in
`docs/implementation/e2e-sweep.md` — including six write paths where the **negative** case was
checked too, meaning the role that must be blocked actually is.

---

## 8. What not to say

Everything in §4 is checkable in the repo. These are the near-miss claims that are **not** true and
are easy to say by accident when you are nervous.

| Do not say | Say this instead |
|---|---|
| "Connected to a real plant" / "real refinery data" | "An authored corpus — 32 files, 24 documents in the vault. No historian, no EAM. It says so on our landing page" |
| "It supports Hindi and Hinglish" | "Handwritten notes and blurry scans." Multilingual is deferred, not shipped |
| "Memory is flat under load" | "No sign of a leak over a 60-minute run." That is the harness verdict, not a claim about memory |
| "Hybrid search beats vector search" | "Hybrid matches the best single method, and adds authority ranking and a fallback if one store is down" |
| "We're 89% accurate" *(said alone)* | "33 of 37 on our last full run — and that number is stale, see Beat 12" |
| "All four misses were safe refusals" | **Do not say this at all.** It was written down once and checked wrong on 23 August. Three of the four were never even eligible to be refused |
| "The model gate blocks bad models" | "It scores them and reports. Blocking ships turned off, on purpose" |
| "Multi-site" | Single site. This is an MVP boundary, not a bug |
| "Predictive maintenance" / "we predict failures" | "It puts the failure history and the matching sensor pattern in front of you before the job starts" |
| "100% accurate" *(about anything)* | Nothing in this system is 100% except retrieval reach and provenance on that run, and both have a confidence interval |

---

## 9. Q&A bank

| They ask | You say |
|---|---|
| **"How is this different from ChatGPT over our documents?"** | A chatbot gives you text. We give you text plus where it came from, ranked by authority, and we refuse on safety questions when the evidence is thin. And our retrieval and citation scores are graded by fixed rules, not by another model. |
| **"Is the data real?"** | It is authored, on purpose — 32 files modelling a petrochemical complex, with a canon file as the answer key. No historian, no EAM connection. It is written on our landing page, not hidden. That is the boundary of this MVP. |
| **"Why is answer quality only 89%?"** | That is 33 of 37 from the sweep on 16 August. We have since fixed the bugs behind all four failures and checked each one individually — they all answer correctly now. We have not re-run the full sweep, so we still quote the old number. |
| **"32 seconds for an answer — isn't that slow?"** | For a brief that arrives before you leave the workshop, no. It is 32 seconds at the median, with a 60-second cap on Llama 3.1 70B. A shorter cap gives a prettier number that is actually measuring the fallback model, not the one we ship. |
| **"What stops someone poisoning the knowledge base?"** | Four things. Low-confidence extractions cannot reach the graph without a human promoting them. Safety limits need a signed Management of Change. The vault never deletes, so the original always survives. And every promotion is written to the audit log. |
| **"How do you know your own retrieval works?"** | Because our own baseline harness caught it failing. It measured vector search at **0 out of 37** one day — that is how we found a filter on an unindexed field silently erroring, which had quietly degraded the whole system to keyword search only. No unit test caught that. The benchmark did. |
| **"Does it scale?"** | 2,275 requests with 0% errors, and the knee at 50 concurrent users. A 60-minute soak on cloud stores with no leak signal and 0.11% errors across 37,842 requests. What that does **not** prove is a ten-thousand-asset plant, and we say so on the page. |
| **"Have you actually measured everything the problem statement asks for?"** | Yes — there are **thirteen** harnesses in `benchmark/`, one per criterion, including the three that landed last: OCR recall by document type, knowledge-graph linkage completeness, and cross-functional discovery measured as a counterfactual against single-function retrieval. |
| **"What if the AI provider goes down?"** | Answers fall through NIM → OpenRouter → Gemini → local. OpenRouter serves the **same** Llama 3.1 70B, so falling through does not change which model answered. And the benchmark marks a run invalid if a fallback answered it. |
| **"What if the vision model can't read our drawings?"** | It says so. A P&ID it cannot parse falls back to a placeholder that the screen labels as a placeholder — it never invents a valve tag. And even a good parse stays **candidate** until an engineer checks it element by element. |
| **"Does it work offline?"** | Field capture does. Voice notes and deviation flags queue on the device and sync when signal comes back. |
| **"Who can change what?"** | Five roles, enforced at the API and not just hidden in the UI. An engineer can resolve conflicts but is **refused** when they try to promote quarantined knowledge — only reliability and admin can. And a permit brief needs two different signatures, where the second signer cannot be the person the brief was sent to. |
| **"How long would this take to deploy?"** | Value on day one from search alone. Entity mapping by day 60. Graph and assisted answers by day 90. Proactive briefs at month six, once the push-rate gate has passed. |

---

## 10. Problem statement — coverage map

Use this to check yourself, and to answer *"did you actually build all of it?"*

### "What you may build" — all five, all on screen

| The problem statement asks for | Beat | What the judge actually sees |
|---|---|---|
| Universal document ingestion & knowledge graph agent | **3** | A blurry scan uploaded live → vault → OCR → entities → graph in ~8 s, and a P&ID turned into topology |
| Expert knowledge copilot | **5**, **10** | A cited answer ranked by authority; the same product running in a 390 px phone window |
| Maintenance intelligence & RCA agent | **4**, **7** | A brief assembled from a work-order event with nobody asking; an RCA timeline with ranked causes |
| Quality & regulatory compliance intelligence | **9** | OISD / PESO / Factories Act gap dashboard, and a one-click audit evidence pack |
| Lessons learned & failure intelligence | **4**, **8** | A repeat failure pattern across three sister pumps surfaced unasked; the blast radius of a spec that went stale |

### "Evaluation focus" — every item has a number or a screen

| What they will assess | Where it lives |
|---|---|
| Entity extraction accuracy across document types | F1 **0.805** on 40 labels, run marked `VALID`, zero fallbacks. Plus `run_ocr_gate.py`, which scores OCR recall per document type against the clean sibling document |
| Query answer quality on domain-expert questions | **33/37** across 15 categories, graded by fixed rules — Beat 12, with the staleness stated |
| Knowledge graph linkage completeness | **10/10 golden assets linked**, 45 edges. `run_kg_completeness.py` also classifies the unlinked remainder instead of leaving a bare percentage |
| Time to answer vs traditional search | Beat 5 tells the story. **If pushed for the number:** our own harness says BM25 already finds the fact at rank 1.35 on a 20-document corpus, so the modelled human time saving is only **9.5%**. Corpus size sets that floor, and we publish it rather than inflate it |
| Compliance gap detection accuracy | **Precision 1.000 · recall 0.838 · F1 0.912**, zero false alarms — Beat 9 |
| Cross-functional knowledge discovery | Beat 4 shows it: one work order pulls in a vendor bulletin, a repair record and a field note from four separate systems, unasked. `run_cross_functional.py` measures it as a counterfactual — full corpus versus one function's documents, same 37 questions |
| Validated with real industrial documents | **State the boundary plainly.** The corpus is authored. The regulatory clause text inside it is real and public — OISD-STD-105/128/134, PESO Rules 2016, Factories Act sections 31, 36 and 87 |

> **One caution on the last three harnesses.** `run_ocr_gate.py`, `run_kg_completeness.py` and
> `run_cross_functional.py` exist and run, but **no results are published in `benchmark/RESULTS.md`
> yet.** Say *"we have a harness for it"* — never quote a number from them until a run is recorded.
> Everything else in this table has a measured figure behind it.

### Deliverables

| Deliverable | State |
|---|---|
| Working prototype | ✅ live — this demo |
| Architecture diagram | ✅ landing page `#system`, plus `docs/ARCHITECTURE.md` and `docs/DIAGRAMS.md` |
| Presentation deck | ⚠️ `demo/ppt.pdf` does not exist yet — `README.md` links to it |
| Demo video | ⚠️ Same. The landing page's **Watch demo** button points at a working Google Drive link, not at `demo/demo-video.mp4`. Make the README match before judging |

---

## 11. Optional modules

**Only if you have been told you have ten minutes.** Insert after Beat 11. Pick **one** — the full
script plus both modules is 10:30, which is over the wall.

### Module A · Governance is real, not a slide · **+45 s**

**SCREEN** — `/governance/quarantine`, logged in as **engineer**, then as **reliability**.
**DO** — Click promote as the engineer. Let the 403 land on screen. Then switch account and do it
again.

**SAY:**

> "One thing worth proving instead of claiming. This is the quarantine gate, as an **engineer**.
> Promote — **refused**. Same action as a **reliability engineer** — allowed, and the fact appears in
> the graph. That block is at the API, not hidden in the interface. A role that can open a page but
> cannot call its API is a broken page, not a closed door."

### Module B · Time travel · **+35 s**

**SCREEN** — `/graph`, EQ-101, then set the `as of` date to 2020.
**DO** — Show today's graph first. Then change the date and let the nodes disappear.

**SAY:**

> "Because every fact has a start and an end date, you can ask the graph what it knew on any day.
> Today EQ-101 carries seven facts. As of 2020 — **nothing**, because none of it was true yet. That is
> exactly what an incident investigation needs, and it is why we close facts instead of overwriting
> them."

---

## 12. Cut ladder

The first four are already tagged **⟨CUT FOR 8:00⟩** inside [§4](#4-the-script). Take them in order.
Savings are measured, not guessed.

| # | Cut | Saves | What it costs you |
|---|---|---|---|
| **1** ⚑ | **Beat 7 (RCA) entirely.** Add one sentence to the end of Beat 6 instead, still on Tab 6: *"The same evidence also builds a root-cause pack — timeline, ranked causes, sources."* | **−28 s** | Medium. A problem-statement bullet leaves the screen. It survives in Q&A |
| **2** ⚑ | **Beat 12** — the last paragraph about the stale number | **−13 s** | Low, but you lose a good honesty moment |
| **3** ⚑ | **Beat 9** — the precision sentence. Keep the audit-pack click | **−12 s** | Low. The number is in the Q&A bank |
| **4** ⚑ | **Beat 1** — the retirement sentence | **−8 s** | Low. Beat 10 raises the knowledge cliff again |
| 5 | **Beat 11** — the datastore sentence. Keep the six properties | **−10 s** | Medium |
| 6 | **Beat 3** — the "PDFs, spreadsheets, forms…" list | **−6 s** | Medium. That list **is** "heterogeneous formats" |
| 7 | **Beat 10** — the interview sentence. Keep the phone and the quarantine | **−10 s** | High. Drops the knowledge-cliff payoff |
| 8 | **Beat 8** — the "we never delete" paragraph | **−11 s** | High. Drops time travel, one of your three best ideas |

**Cuts 1–4 land you at 8:09.** That is the version to rehearse.
**All eight land at 7:32**, and by then you are cutting muscle, not fat.

**Never cut, at any length:** Beat 2 · Beat 6 · the last three sentences of Beat 13. Those three
**are** the differentiator. Everything else is supporting evidence for them.

---

## 13. If the stack fails

Tab 1 alone tells the whole story: the problem, the one-pump scenario end to end, the architecture
diagram, every benchmark number, and the honest-limits block in the FAQ.

Say it once — *"the live stack is down, here is the same story on the page"* — then present the
landing page top to bottom, in the same beat order. **Do not debug on stage.**
