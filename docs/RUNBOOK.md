# KAIROS — Stage Runbook

Tabs, navigation, what to do, what to say. Nothing else.
Full reasoning, Q&A bank and cut ladder live in [`PRESENTATION.md`](PRESENTATION.md).

---

## Tab setup — build these before you walk up

Ten tabs, left to right, **in this order**. Tab order is the script order.

| Tab | Route | Login | Leave it showing |
|---|---|---|---|
| 1 | `/` | none | Top of the landing page |
| 2 | `/documents/ingest` | admin | `3-demo/oem_bulletin_fp_sb_2026_20.pdf` **picked, not uploaded** |
| 3 | `/documents/<pid-id>/topology` | admin | P&ID topology graph |
| 4 | `/briefs/<eq101-brief-id>` | admin | EQ-101 brief open |
| 5 | `/copilot` | admin | **Q14 asked** — answer + source chips visible |
| 6 | `/copilot` — **second browser profile** | admin | **Torque question asked** — refusal card visible |
| 7 | `/rca` | admin | EQ-101 `SEAL-FAIL` pack **already generated** |
| 8 | `/governance/moc/MOC-2026-HE301` | admin | Blast radius visible |
| 9 | `/compliance` | `compliance@kairos.local` | Gap dashboard |
| 10 | `/field/voice` in a **390 px window** | `field_worker@kairos.local` | Recorder screen |

**Try demo** on `/login` for admin tabs. Tabs 9 and 10 log in by hand.
Tab 6 **must** be a second profile or incognito — two tabs of one profile overwrite each other's chat.

### Before you build the tabs

1. `make dev` — every container up. Open `/system-health` once, then close it.
2. Warm the pipeline: ingest `dataset/demo-ingest/2-preflight/run4_eq102_bearing.pdf`.
3. Verify it: `docker exec kairos-backend-api python /app/scripts/verify_ingest.py DOC-XXXX` — four PASS lines.
4. Pre-ask Tab 5 (Q14), Tab 6 (torque), pre-generate Tab 7. **Never run these live.**
5. Browser at 110–125%. Pick light or dark, stay there.
6. Notifications off. Laptop on mains. **Sleep disabled.**

### Never touch on stage

`/rca` Generate · `/governance/model-gate` Run · anything in `benchmark/` · `/management/cross-site` · `/system-health` probes

---

## Beat 1 · The problem — ends **0:53**

**SCREEN** Tab 1, top of landing page
**DO** Stand still for two sentences. Then scroll slowly to the four numbers.

> "Every large plant in this country already has the answer to almost every question it has. It is just spread across seven to twelve systems that do not talk to each other.
>
> So people spend **thirty-five percent of their working day** looking for something that already exists — that is the number in this problem statement. But the lost time is not the real cost."

*(scroll to the four numbers)*

> "**Eighteen to twenty-two percent of unplanned downtime** in Indian heavy industry happens because someone decided without the full history of that machine in front of them. ABB priced Indian unplanned downtime at **seventy lakh rupees an hour.** And **a quarter of India's experienced engineers retire in the next ten years.**
>
> This is not a filing problem. It is a safety problem."

⚠ Say *"that is what the problem costs"* — **never** "that is what we save."

---

## Beat 2 · Why a search box does not fix it — ends **1:33**

**SCREEN** Tab 1, same place
**DO** Nothing. Do not click. Let it be still.

> "Everyone who attacks this builds a better search box — enterprise search, document management, a chatbot over your PDFs. All of them assume you already know what to ask.
>
> That is why they fail. **The most dangerous gaps are the ones nobody knows to search for.** A technician who has never heard that this pump failed this way before does not go looking.
>
> So Kairos does not wait to be asked. It reads everything the plant already has into one graph — what is true, when it was true, and who said so — then pushes what matters to whoever is about to touch the machine."

**Never cut this beat.**

---

## Beat 3 · Everything gets in — ends **2:36**

**SCREEN** Tab 2 → Tab 3
**DO** Click **Upload** as you start speaking. Keep talking while it runs. Point at the timeline when it goes green (~8 s). Then switch to Tab 3.

> "First, everything has to get in. This is a **vendor bulletin issued last week** — nothing in this system has ever seen it. It is hashed, stored in a vault that never deletes, read for entities, and those entities go into the graph."

*(point at the finished timeline)*

> "Eight seconds. Same door for scans, spreadsheets, forms, handwritten shift logs and voice notes — and a blurry scan the OCR cannot read with confidence is never guessed at. **It lands in quarantine**, and only a human can promote it out."

*(switch to Tab 3)*

> "And drawings. A vision model reads this P&ID into a map of which valve shuts off what. Now read that label: **candidate.** Until an engineer checks it element by element, this map may not answer a single question."

⚠ Your only live moment. The demo file is a native PDF on purpose — no OCR gate to trip.

---

## Beat 4 · The brief nobody asked for — ends **3:20**

**SCREEN** Tab 4
**DO** Point at each of the three items in turn. Rest your hand on the **unverified** label for a beat.

> "This morning a work order opens on pump EQ-101. **Nobody searched.** Kairos saw the work order and built this by itself.
>
> Three things the technician almost certainly does not know. This pump has failed the same way **three times since 2018** — and both sister pumps have too. The vendor **changed the seal part number eighteen months ago**; here is the new one. And six months back a technician wrote a note about strange vibration that nobody followed up.
>
> That last one is **marked unverified**. Useful, so we show it. Not confirmed, so it never passes as a fact."

---

## Beat 5 · The answer, and where it came from — ends **4:05**

**SCREEN** Tab 5
**DO** Read the question off the screen so they know you didn't pick it just now. Then point at the source chips.

> "Now the question a reliability engineer really asks after the incident —
>
> **'In the May 2025 EQ-101 seal repair, was the updated part number used?'**
>
> **No.** The old part was fitted, because the bulletin never reached the store. That is the whole failure in one sentence — normally a week across three systems.
>
> But two things matter more than the answer. **Every claim carries its sources** — those chips open the original document. And evidence is ranked by **authority**: a regulation beats a vendor manual, which beats a local note. We never average two sources that disagree. We rank them and show the disagreement."

---

## Beat 6 · The refusal — ends **5:10** · **your peak**

**SCREEN** Tab 6
**DO** Slow right down. After "a number that looks right" — **stop for two full seconds.** Let them read the card.

> "This is the one I want you to remember.
>
> I asked it a safety question — **the torque value for the EQ-101 seal housing bolts.** It has the pump, the seal, the whole repair history. And the model underneath **knows what bolts like these are usually torqued to.** It could hand you a number that looks right."

*(two seconds of silence)*

> "It refuses. Because **no document here states a torque for that joint** — and a number from the model's training instead of this plant's paperwork is how people get hurt. So it hands you the sources instead.
>
> We tested this. **Fifteen questions built to make it guess** — wrong facts planted in them, prompt injection, evidence that only exists in an unverified note. **Zero unsafe answers.**
>
> A system that always answers is easy to build and impossible to trust in a plant. Knowing when to stay quiet is the harder half."

⚠ **Torque, not hydrotest.** The corpus states 17.82 bar for hydrotest — that question *answers*.
**Never cut this beat.**

---

## Beat 7 · Root cause — ends **5:38** · **first to cut**

**SCREEN** Tab 7
**DO** Scroll once through the timeline, stop on the ranked causes. Do not read them out.

> "Same evidence, different job. Three searches at once — the failure timeline from the graph, the event record from the plant systems, the vendor and inspection evidence from the documents. It comes back as **possible causes ranked by how much evidence sits behind each**, each carrying its documents. Two days of a reliability engineer's week, on one screen."

**If cutting:** skip Tab 7. Add to the end of Beat 6, still on Tab 6 — *"The same evidence also builds a root-cause pack — timeline, ranked causes, sources."* Then go to Tab 8.

---

## Beat 8 · Knowledge that goes stale — ends **6:27**

**SCREEN** Tab 8
**DO** Point at the six affected items. Land on the **sign-off line**. Do not invite a click into the source chips.

> "Now the harder half. A vendor bulletin drops the maximum pressure on a heat exchanger class **from 18.5 bar to 16.2**.
>
> The danger is not the new number. It is everything downstream still quoting the old one — **four operating procedures and two inspection records**. All six on this record.
>
> And the bulletin does **not** change the graph by itself. A safety limit routes through a formal **Management of Change** — this one carries an engineer's sign-off and the timestamp it happened. No signature, no change to the canonical value.
>
> We never delete either. The old fact is **closed**, not removed — so an investigation can still ask what the plant believed in March."

⚠ **Say signed, not pending.** There is no pending banner on this screen. Do not point at one.

---

## Beat 9 · The auditor's view — ends **6:57**

**SCREEN** Tab 9 → one click to `/compliance/audit-pack`
**DO** Don't mention the shorter sidebar — let them notice. Click through on the word "one click".

> "The same graph answers the auditor. **OISD 117 and ISO 45001** — clause by clause, mapped against what the plant actually holds" — *(point at the donut, do not read the count)* — "and one click builds the **evidence pack**, with a human signature line on it. On the ten-asset benchmark scope, precision is **1.000** — zero false alarms across fifty-two clause and asset pairs. In compliance, false alarms are the direction that hurts."

⚠ **Two frameworks only** — OISD 117 and ISO 45001. Not PESO, not the Factories Act.
⚠ **Never say a findings number out loud.** It changes with every ingest.

---

## Beat 10 · The wrench, and the knowledge cliff — ends **7:32**

**SCREEN** Tab 10, the 390 px window
**DO** Bring the narrow window forward so the phone shape is obvious. **Do not tap record.**

> "And it reaches the person holding the wrench. Same system, on a phone. A technician records a voice note at the pump. It gets transcribed and lands in **quarantine** — never straight into the graph — until a human promotes it. No signal, it waits on the device.
>
> And that retiring engineer: Kairos writes **short interviews out of the gaps in the graph itself**, so the questions are the ones only that person can answer."

⚠ Don't claim push notifications — it's an in-app inbox.

---

## Beat 11 · Under the hood — ends **8:05**

**SCREEN** Tab 1, scrolled to the architecture diagram (`#system`)
**DO** Point at the diagram once. Do not walk through it. Thirty seconds, then move.

> "Thirteen layers, all built. A graph store for time, a vector store for meaning, a search index for exact tag numbers — searched together, re-ranked by authority.
>
> **Every fact carries six things**: when it became true, when it stopped, who said it, which document, how confident, and whether a human signed it off. That is the difference between an answer you can check and an answer that just sounds right."

---

## Beat 12 · Evidence — ends **8:52**

**SCREEN** Tab 1, the **Evals** section — bar chart, then the coloured card under it
**DO** Point at the card that says *"Fixed rules, never another model."* Don't read the bars out.

> "We published the numbers we do not like next to the ones we do.
>
> Thirty-seven expert questions, fifteen categories, graded" — *(point at the card)* — "**by fixed rules. Never by another model marking its own homework.**
>
> **Retrieval, 37 of 37. Sources, 37 of 37** — every answer carried its sources. **Answer quality, 36 of 37.**
>
> And here is the honest part. That number was **33 of 37** eight days ago. Our own harness found the cause — retrieval was ranking test noise alongside real evidence. We fixed it, re-ran the whole sweep, and **published both runs side by side.** We do not quote a score we have not re-run."

---

## Beat 13 · Close — ends **9:43**

**SCREEN** Tab 1 — hero at the top, or hold on the diagram
**DO** Stop clicking. Face the room for the last three sentences.

> "Rolling this out is staged, not a switch. **Stage one is search only** — no AI answers, no push. People learn to trust it finding things first. **Stage two turns on the answers**, with sources. **Stage three turns on the proactive briefs**, and only after the push rate has stayed inside the **EEMUA-191** alarm limit for thirty days. Six briefs per operator per hour — a brief that gets ignored is worse than no brief.
>
> None of this is specific to petrochemicals. The regulations and the drawings change per sector. The platform does not.
>
> Every plant already knows the answer. **Kairos is how that answer reaches the person holding the wrench before they touch the machine — and how it tells them when it does not know.**
>
> Thank you."

**Never cut the last three sentences.**

---

## Pace card

| Beat | Tab | Ends |
|---|---|---|
| 1 Problem | 1 | 0:53 |
| 2 Search box | 1 | 1:33 |
| 3 Ingest + P&ID | 2 → 3 | 2:36 |
| 4 Brief | 4 | 3:20 |
| 5 Answer | 5 | 4:05 |
| 6 **Refusal** | 6 | **5:10** |
| 7 RCA | 7 | 5:38 |
| 8 Blast radius | 8 | **6:27** |
| 9 Compliance | 9 | 6:57 |
| 10 Field | 10 | 7:32 |
| 11 Architecture | 1 | 8:05 |
| 12 Evidence | 1 | 8:52 |
| 13 Close | 1 | 9:43 |

**Two checkpoints only.** Tab 6 on screen by **5:10**. Tab 8 finished by **6:27**.
Behind at either? Drop Beat 7, then the last sentence of Beat 9, then the last paragraph of Beat 12.
Everything after Beat 6 can be squeezed. Nothing before it can.

---

## If the stack dies

Say it **once** — *"the live stack is down, here is the same story on the page"* — then present Tab 1 top to bottom in the same beat order. It carries the problem, the scenario, the architecture and every number.

**Never debug on stage.**
