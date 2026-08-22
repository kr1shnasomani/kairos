# KAIROS — 7–8 Minute Presentation Script

Offline delivery. One presenter, one screen, live app.
Target: **7:30 spoken**, leaving 30 s of slack in an 8-minute slot.

Judging weights this script is built against: Innovation 25 · Business Impact 25 · Technical Excellence 20 · Scalability 15 · UX 15.

---

## 0. Pre-flight — do this before you walk up

**The single biggest risk in this demo is synthesis latency.** Measured p50 is
32.3 s and p95 is 65.0 s (`benchmark/RESULTS.md`). A live Copilot query can eat
15% of your slot watching a spinner. Do not risk it.

| # | Action | Why |
|---|---|---|
| 1 | `make dev` — confirm all 10 containers up | Cold start mid-demo is fatal |
| 2 | Open **4 browser tabs**, pre-loaded and logged in (see tab plan below) | You switch tabs, you never wait for a load |
| 3 | **Pre-run the Copilot answer in Tab 2 before you present.** Ask Q14, let it finish, leave the answer on screen | Turns a 32 s wait into a 0 s tab switch |
| 4 | **Pre-run the refusal in Tab 3.** Ask the hydrotest question, leave the refusal card on screen | Same reason |
| 5 | Zoom browser to 110–125% | Back row has to read the source chips |
| 6 | Disable notifications, close Slack/mail | — |
| 7 | Have the landing page open in Tab 1 as your fallback slide deck | If the stack dies, the landing page alone tells the whole story |

**Tab plan**

| Tab | URL | State when you start |
|---|---|---|
| 1 | `localhost:3000` (landing) | Scrolled to top |
| 2 | `/copilot` | Q14 asked, answer + sources visible |
| 3 | `/copilot` (2nd session) | Hydrotest question asked, refusal card visible |
| 4 | `/governance/moc/<id>` | MoC detail for the 16.2 bar change, blast radius visible |

Log in with the **Try demo** button on `/login` (seeded admin — full sidebar).

**Do not touch during the demo:** `/rca` generate (~90 s), `/governance/model-gate` Run (~2.5 min async), `/management/cross-site` (deliberate empty state).

---

## 1. Cold open — the problem  ·  0:00 – 0:50

> *Screen: landing page hero.*

"Every large plant in this country already owns the answer to almost every
question it has. It's just spread across seven to twelve systems that don't talk
to each other — drawings in one, work orders in another, procedures in a third,
inspection records in a fourth.

So people spend **thirty-five percent of their working day** looking for
information that already exists. That's the McKinsey number for asset-heavy
industries.

But the cost isn't the wasted time. Here's the cost."

> *Scroll to the problem section — the four stats.*

"**Eighteen to twenty-two percent of unplanned downtime** in Indian heavy
industry traces back to maintenance decisions made without the equipment's full
history in front of the person deciding. And **a quarter of India's experienced
industrial engineers retire within the decade.** What they never wrote down
leaves with them.

This isn't a filing problem. It's a safety problem."

---

## 2. The insight — why search doesn't fix it  ·  0:50 – 1:35

> *Screen: still the problem section, then scroll to "How it works".*

"Everyone who has attacked this built a better search box. Document management,
enterprise search, RAG chatbots — all of them assume the same thing: you have a
question, you go and look.

That assumption is why they don't work. **The most dangerous knowledge gaps are
the ones nobody knows to search for.** A technician who has never heard that
this pump failed this way before doesn't think to go looking. That isn't a
retrieval failure. It's an awareness failure, and no search engine fixes it.

So Kairos doesn't wait to be asked. It watches the plant's real events — a work
order opening, a permit being issued, a shift changing — and pushes what you
need to know *before* you act. Let me show you one."

---

## 3. Live demo — one story, start to finish  ·  1:35 – 5:15

The whole demo is **one narrative**: the seal bulletin that never reached the
storeroom. It's a real chain in our golden dataset.

### 3a. The brief  ·  1:35 – 2:20

> *Tab 4 → navigate to `/briefs`, open the EQ-101 brief.*

"This is pump EQ-101 at a petrochemical complex — critical asset, installed
2010. A work order was just raised on a seal failure. Nobody searched for
anything; Kairos saw the work order and assembled this.

It's telling the technician three things they almost certainly don't know: this
pump has failed this way **four times in eight years**. The vendor **changed the
seal specification eighteen months ago** — here's the new part number. And six
months back, a technician left a voice note about unusual vibration that was
never formally investigated.

Notice that last one is **labelled unverified**. It's useful, so we surface it.
It isn't confirmed, so we never let it pass as fact."

### 3b. The answer, with its evidence  ·  2:20 – 3:10

> *Switch to Tab 2 — answer already on screen.*

"Now the question a reliability engineer actually asks after an incident."

> *Read the question aloud from the screen:*
> **"In the May 2025 EQ-101 seal repair, was the updated part number used?"**

"And the answer is **no**. The old part — FSL-2240A — was fitted, because the
vendor bulletin had not reached maintenance stores. That's the whole failure in
one sentence, and it's the kind of thing that normally takes a week of digging
through three systems to establish.

Two things matter more than the answer. **Every claim carries its sources** —
these chips are live links to the original documents in the vault. And it's
ranked by **authority**: a regulation outranks a vendor manual, which outranks a
local note. We never average conflicting sources. We rank them and show the
conflict."

### 3c. The refusal — the part nobody else builds  ·  3:10 – 4:00

> *Switch to Tab 3 — refusal card already on screen.*

"This is the one I actually want you to remember.

I asked it a safety-critical question: **the hydrotest pressure for a heat
exchanger series.** A procedure in the corpus says hydrotest equals 110% of
operating pressure. The system could multiply. It has the numbers.

**It refuses.** Because no source in the corpus states that value for this
series — computing it silently would be a confident guess dressed as a citation.
So it hands you the source documents and points you at the human authority
instead.

We tested this properly: **fifteen adversarial questions** designed to make it
guess — wrong premises, prompt injection, questions whose evidence sits only in
unverified notes. **Zero unsafe answers.** Twelve refusals.

A system that always answers is easy to build and impossible to trust in a
plant. Knowing when to stay quiet is the harder half."

### 3d. Blast radius — knowledge that goes stale  ·  4:00 – 5:15

> *Switch to Tab 4 — MoC detail with blast radius.*

"Last one. A vendor bulletin arrives and drops the maximum pressure on a heat
exchanger class **from 18.5 bar to 16.2**.

The dangerous part isn't the new number. It's everything downstream still
quoting the old one. Kairos traces it automatically: **four site operating
procedures and two inspection records** are now contaminated. All six get
flagged.

And it does *not* update the graph on its own. A safety parameter change routes
into a formal Management of Change — Kairos drafts the change request, and until
an engineer signs it, **every query touching that pressure limit shows this
warning banner** with both values and the pending MoC number.

Nothing is ever deleted, either. The old fact gets its validity closed, not
removed — so six months from now, an investigation can still ask what the plant
believed back in March."

---

## 4. Under the hood — briefly  ·  5:15 – 6:00

> *Tab 1 → landing page, scroll to the architecture diagram.*

"Thirteen layers, one path through. A document enters at the top and leaves as
an answer someone can act on.

Two exits along the way are deliberately **one-way**. Anything the extraction is
less than seventy percent confident about goes to **quarantine** — searchable,
labelled unverified, and it cannot reach the trusted graph until a human
promotes it. There is no auto-promote. In our seeded roles, **only reliability
engineers hold that permission — engineers deliberately don't.**

The second one-way exit is the safety gate you just watched refuse.

Underneath: Neo4j for the temporal graph, Qdrant for semantic search,
Elasticsearch for exact tag lookup, hybrid retrieval across all three. Every
edge in the graph carries six properties — when it became true, when it stopped,
who said it, which document, how confident, and whether a human signed it off.
That's what makes an answer checkable rather than plausible."

---

## 5. Evidence  ·  6:00 – 6:50

> *Scroll to the evals section.*

"We graded it, and we published the numbers we don't like alongside the ones we
do.

Thirty-seven domain-expert questions across fifteen categories, graded
**deterministically** — not by another model marking its own homework.

**Retrieval: 37 of 37.** **Provenance: 37 of 37** — every single answer carried
its sources. **Answer quality: 33 of 37**, and we quote it with its confidence
interval, 79 to 97, because 33 out of 37 is a sample, not a constant.

And **all four of those misses are the authority gate refusing rather than
guessing.** We grade them as *incorrect*. That understates the system — refusing
was the safe call every time — but we'd rather report the harsher number than
score our own refusals as wins.

**Compliance gap detection: precision 1.000** — zero false positives across 52
clause-asset pairs. In compliance, precision is the safety-relevant direction.

And here" — *point to the "What these numbers are not" block* — "is what we
haven't proven: no soak test, a synthetic corpus, and fifty virtual users is not
evidence for a ten-thousand-asset plant. That block is on our public landing
page. We'd rather you hear the limits from us."

---

## 6. Close  ·  6:50 – 7:30

> *Screen: landing page hero or the architecture diagram.*

"Scaling this is a deployment arc, not a switch. **Phase one is search only** —
no AI answers, no push. People learn to trust retrieval first. **Phase two turns
on synthesis** with sources and a one-tap feedback button. **Phase three turns on
proactive briefs** — but only after push volume has stayed inside the EEMUA-191
alarm-fatigue limit for thirty consecutive days. Six briefs an operator per hour,
because a system that spams people gets ignored, and an ignored brief is worse
than no brief.

Nothing about this is petrochemical-specific. The regulations and the drawing
types change per sector; the platform doesn't.

Every plant in this country already knows the answer. Kairos is how it gets to
the person holding the wrench, before they touch the equipment — and it tells
them when it doesn't know.

Thank you."

---

## 7. Q&A — likely questions

| Question | Answer |
|---|---|
| "How is this different from ChatGPT over our documents?" | A chatbot returns text. We return text plus provenance, ranked by authority, and we refuse on safety questions with thin evidence. Retrieval and citation are graded deterministically, not by another model. |
| "Is the data real?" | The corpus is authored and synthetic by design — 32 documents modelling a petrochemical complex. No historian, no EAM connection. Stated on the landing page, not hidden. That's the MVP boundary. |
| "Why is answer quality only 89%?" | All four misses are safe refusals graded as incorrect. Retrieval and provenance are both 37/37. We chose the harsher grading. |
| "Synthesis takes 30 seconds — isn't that too slow?" | For a proactive brief that arrives before you leave the workshop, yes it's fine. p50 is 32 s at a 60 s cap on Llama 3.1 70B. A lower cap gives a prettier number that measures the fallback model, not the production one. |
| "What stops someone poisoning the knowledge base?" | Low-confidence extractions can't reach the graph without human promotion, safety parameters need a signed MoC, the vault is immutable so originals survive, and every promotion is audit-logged. |
| "Does it work offline?" | Field capture does — voice notes queue on the device and sync when signal returns. |
| "How long to deploy?" | Value on day one from search alone. Entity mapping by day 60, graph and assisted synthesis by day 90, proactive briefs at month six after the push-rate gate passes. |

---

## 8. Timing discipline

| Beat | Ends at | Cut first if you're behind |
|---|---|---|
| Problem | 0:50 | Drop the retirement stat |
| Insight | 1:35 | — **never cut this, it's the differentiator** |
| Brief | 2:20 | Drop the vibration/unverified detail |
| Answer | 3:10 | Drop the authority-ranking sentence |
| Refusal | 4:00 | — **never cut this** |
| Blast radius | 5:15 | Cut this beat entirely if you're >30 s behind |
| Architecture | 6:00 | Drop the datastore list |
| Evidence | 6:50 | Drop compliance precision |
| Close | 7:30 | Drop the sector-agnostic line |

**If the stack fails:** switch to Tab 1 and present the landing page top to
bottom. It carries the problem, the scenario, the architecture diagram and every
benchmark number. Say so plainly — "the live stack is down, here's the same
story on the page" — and keep going. Do not debug on stage.
