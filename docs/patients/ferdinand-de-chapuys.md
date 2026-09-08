# Ferdinand de Chapuys

Status: playable research draft, 2026-08-21.

Ferdinand de Chapuys is one of the authored patients eligible for the
three-person opening day. His consultation asks the player to distinguish
alcohol-related amnesia from unconsciousness, seizure, fugue, and a flattering
diagnosis of nervous exhaustion.

## Fictional case

Ferdinand is a 35-year-old Savoyard wine producer and merchant, born near
Chambéry after the annexation of Savoie by France. His family owns vineyards
and a trading house and has sent him to establish its first American office.
He is unmarried, wealthy, fluent in English, and was educated at Christ Church,
Oxford. His family, firm, clerk, Oxford history, dialogue, measurements, and
outcomes are invented.

At Oxford he sought entry to the Bullingdon set. Heavy drinking and partial
memory gaps were treated as ordinary evidence of a successful night. He learned
to joke about them before anyone else could ask what happened. The gaps then
covered part of an evening, not several days.

In New York, professional tastings and buyers' dinners give him ready access to
alcohol. Twice in six weeks he has continued drinking after the business ended
and disappeared for roughly three days. He was not unconscious throughout. His
clerk saw him converse, take cabs, pay accounts, and conduct business, including
signing an unfavorable order he had previously refused. Ferdinand remembers
the first drinks and then nothing continuous until Thursday morning.

Before a bout he experiences mounting restlessness and an intrusive
preoccupation with drinking. Between bouts he can abstain for four or five weeks
without morning drinking or physical withdrawal. The fixed modern ground truth
is alcohol use disorder with a periodic binge pattern and alcohol-induced
blackouts. A several-day disappearance comprises repeated intoxication, sleep,
and renewed drinking, not one continuous blackout or coma.

Since arriving, Ferdinand has sought galvanic treatment for his “nerves.” The
regular attention and mild current briefly improve his sleep and restlessness.
They do not prevent the drinking bouts. He has concealed the drinking and
missing time from that practitioner.

## Consultation design

The focused route takes twenty-seven minutes:

1. Reconstruct the last episode from the missed breakfast and buyer's luncheon
   to the Thursday awakening.
2. Ask what the clerk and business records show. This establishes awake,
   purposeful behavior during the amnesia and the genuine signed order.
3. Ask about the pressure before a bout and drinking between bouts. Ferdinand
   then challenges the physician: if drink is the cause, why can he abstain for
   a month?
4. Give a provisional evidence-led answer, a moral rebuke, or the reassuring
   but unsupported explanation of exhausted nerves.
5. Ask about galvanism and the practical stakes for the family office.
6. Perform a sober neurologic and memory examination and a short general
   examination.

Oxford history, seizure questions, and the second examination can be exchanged
within the time limit. The player does not need to exhaust every card.

The strongest period diagnosis is “periodical inebriety (dipsomania).”
“Alcoholic cerebral automatism” accurately describes the amnestic episodes but
does not by itself explain their recurrence. Neurasthenia is socially easier
for Ferdinand to accept and medically incomplete. Epileptic automatism and
dissociative fugue become weak once the drink chronology and collateral account
are known.

## Voice

Ferdinand speaks fluent English with an Oxford cadence, not a written French
accent. He uses medium-length, reflective sentences and becomes halting only
when he reaches culpability: “No—that is not quite it,” “I—no,” or a short
ellipsis. Italics mark deliberate vocal stress on one or two words. They are
part of his performance rather than decorative prose.

He is precise about wine and business because those subjects let him retain
control. He is evasive about the point where professional tasting becomes
private drinking. He should not sound like a comic Englishman, deliver an
epigram, or turn every reply into a finished speech.

## Sources and uncertainty

The sources support the period categories, treatment setting, and social
background, not Ferdinand's invented biography.

- Norman Kerr, *Inebriety: Its Etiology, Pathology, Treatment and
  Jurisprudence*, 3rd ed. (1894),
  [digitized text](https://upload.wikimedia.org/wikipedia/commons/f/fe/Inebriety_-_its_etiology%2C_pathology%2C_treatment_and_jurisprudence_%28IA_b21914163%29.pdf):
  periodical and habitual inebriety, sober intervals, recurrent bouts, and
  alcoholic automatism.
- Daniel Hack Tuke, ed., *A Dictionary of Psychological Medicine* (1892),
  [Google Books](https://books.google.com/books?id=uYLclT40VIUC): the period
  category of dipsomania and its disputed relation to ordinary drunkenness.
- Margaret A. Cleaves, “Franklinization as a Therapeutic Measure in
  Neurasthenia,” *JAMA* 27 (1896),
  [article PDF](https://jamanetwork.com/journals/JAMA/articlepdf/453756/jama_xxvii_20_001h.pdf):
  contemporary New York electrotherapy and debate around neurasthenia.
- John Corbin, *An American at Oxford* (1902),
  [full text](https://www.gutenberg.org/files/38180/38180-h/38180-h.htm): a
  near-contemporary description of the Bullingdon as a wealthy Christ Church
  wine and dining club. It postdates Ferdinand's student years and is used for
  institutional atmosphere, not a claim about his particular cohort.
- Comité Interprofessionnel des Vins de Savoie, “Histoire,”
  [regional history](https://www.vin-de-savoie.fr/vin-de-savoie/histoire/):
  Savoyard viticulture, the 1860 annexation, nineteenth-century rail transport,
  and the severe vineyard diseases of 1876–1893.
- National Institute on Alcohol Abuse and Alcoholism, “Interrupted Memories:
  Alcohol-Induced Blackouts,”
  [modern clinical summary](https://www.niaaa.nih.gov/publications/brochures-and-fact-sheets/interrupted-memories-alcohol-induced-blackouts):
  blackout without unconsciousness, impaired memory formation, and the risks
  of rapid drinking on an empty stomach.

The electrical source concerns franklinization rather than proving the exact
apparatus in Ferdinand's invented office. The case therefore records the mild
galvanic procedure as fictional and treats its benefit as short-lived and
nonspecific. The Bullingdon material supports a wealthy wine-club setting; it
does not establish that every member drank heavily or experienced amnesia.

## Outcome design

- Total abstinence plus a written protection plan for his clerk gives the best
  chance of preventing further blackouts while preserving the office.
- Confiding in the clerk and restricting keys, cash, and unaccompanied buyer
  dinners substantially reduces risk but is less reliable without abstinence.
- Voluntary supervised residence protects health but costs time, privacy, and
  business continuity.
- Continued galvanism can still improve sleep briefly. Presenting it as the
  treatment for the disappearances leaves the causal pattern unchanged.
- Moral exhortation increases shame and concealment.
- Hypnotic reconstruction risks confabulation because blackout memories were
  not normally encoded.
- Bromide or prescribed brandy adds direct physical risk.

The implementation is in
[`game/src/consultation/authoredPatients/ferdinandDeChapuys.js`](../../game/src/consultation/authoredPatients/ferdinandDeChapuys.js).

The fastest comparison is:

```sh
npm --prefix game run playtest:chapuys -- --compare
```
