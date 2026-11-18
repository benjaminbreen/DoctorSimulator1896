import chapters from '../content/jamesLecture.json' with { type: 'json' };

export { chapters };
export const duration = 3600;

// Each line cue is an offset in the single recorded hour. The slate and
// lecturer read the same media clock, including during seeks and buffering.
export const lessons = [
  {
    marks: [5, 10, 19], question: 'What do the three letters stand for?',
    keywords: /finger|letter|pleasure|object|reflex|infant|baby|muscle|involuntary|o\W*m\W*p/i,
    answer: 'The child sees an object, moves, and gets a pleasure. On the first occasion the pleasure surprises him. Once he can remember the rattle, its sound can be present to him before he reaches. That reversal is the beginning of an intended act.',
    example: 'Consider a rattle hidden behind a cloth. The child reaches under it for a sound he cannot yet hear. As long as the hand merely struck by accident, there was nothing to reach under the cloth for.',
    bridge: 'Back to the hand on the desk. Keep in mind which came first, the movement or the knowledge of its effect.',
  },
  {
    marks: [1, 4, 50], question: 'Can I will something without moving?',
    keywords: /fiat|effort|inhibit|inhibition|attention|consent|palsy|paraly|without moving|ideo.motor|strongest|competing/i,
    answer: 'Certainly. Resolve now to post a letter tomorrow. The consent may be complete this instant, although your hand stays where it is. If a contrary idea keeps the appointment from your mind tomorrow, the effort may consist in giving your first intention a hearing again.',
    example: 'A man in a warm bed can spend half an hour protesting that he must get up. Then his mind strays to his first appointment, and he finds himself on his feet. What vanished was the rival picture of the cold floor.',
    bridge: 'Take up the distinction between entertaining a movement and consenting to it. A second idea can keep the first in check.',
  },
  {
    marks: [1, 4, 28], question: 'How would Mill understand my choice?',
    keywords: /mill\b|want|constraint|soft determin|motive|shop|strongest motive/i,
    answer: 'Mill can quite well grant that the desire is yours and that nobody held your arm. The point still at issue is whether, with the circumstances unchanged, another desire could have prevailed. Calling the winning desire the strongest does not settle that.',
    example: 'Picture a customer who walks into the shop of his own accord. No one disputes that he wanted the article. The dispute concerns whether the same morning could really have issued in his passing that shop by.',
    bridge: 'We were asking what a man means when he says he could have willed otherwise. His doing what he wanted is common ground.',
  },
  {
    marks: [9, 11, 16], question: 'What can the porter infer from fifty on each side?',
    keywords: /statistic|buckle|fifty|hundred|porter|numbers|ratio|returns|population|predict/i,
    answer: 'His two totals can stay at fifty when two gentlemen exchange doors. That leaves one quite free to inquire what caused each man to turn. The totals alone have given us no answer about either man.',
    example: 'Give two of the hundred gentlemen a name. Let Henry go right tomorrow where today he went left, and John do the reverse. Our porter could erase their names and copy yesterday’s two totals exactly.',
    bridge: 'Back to our porter. Keep the tally in his hand distinct from the history of the individuals he counted.',
  },
  {
    marks: [0, 2, 24], question: 'Does chance just mean that we are ignorant?',
    keywords: /chance|avenue|oxford|road|ignorance|uncertain|alternative|cambridge|chance-thing/i,
    answer: 'Ignorance is a fact about the observer. My stronger supposition is that the road itself was an open possibility before I chose. Looking back from either road afterwards, you would find it fits the Cambridge landscape equally well.',
    example: 'I could fail to know which road a constable had already closed. That would be ignorance. What I mean to test is the more interesting case in which neither road had been closed when I set off.',
    bridge: 'Let us put our feet back on the Cambridge road, at the instant before the turn has been taken.',
  },
  {
    marks: [0, 3, 39], question: 'How can the end be known if the moves are free?',
    keywords: /god|chess|expert|providence|prescience|kant|noumen|martineau|intermediate|foreknow|schopenhauer/i,
    answer: 'An expert at chess can be ready with an answer to every move the novice might make. His assurance about the issue is quite a different thing from prescribing which move the novice must make. It is that distinction the winding paths are meant to show.',
    example: 'Suppose the novice moves his knight. The expert has one reply ready. Had the novice moved his pawn, there was another reply ready. A plan for either contingency leaves open which reply will be wanted.',
    bridge: 'Return to the two circles on the slate. Knowing an end and prescribing every intermediate step are different claims.',
  },
  {
    marks: [0, 2, 30], question: 'What if regret is valuable because it teaches me?',
    keywords: /regret|remorse|evil|friend|appointment|repair|dragon|suffering|moral education/i,
    answer: 'You may learn a great deal from having failed your friend. But he wanted your company yesterday. I see no reason to make his loss disappear from our account merely because you have received an education from it.',
    example: 'Go and sit with the friend today, by all means. But if he had no one with him during his bad night yesterday, today’s visit does not take that lonely night out of his history.',
    bridge: 'We were considering the missed visit. Keep the claim of the friend who waited in view as we go on.',
  },
  {
    marks: [2, 24, 45], question: 'Do you think every little action is free?',
    keywords: /rare|habit|dove|liberty|every.*act|free.?will|pluralis|determin/i,
    answer: 'Habit does a prodigious amount for us. I need very few genuine alternatives for my argument. If in one difficult instance the effort of holding an idea might really have been withheld, something was decided there that the earlier world had left open.',
    example: 'A signature flows from long practice. The hard thing may have been keeping the unwelcome contents of the letter before the mind long enough to sign at all. Look for effort there.',
    bridge: 'We have come back to the point of the whole inquiry. One genuine possibility would be enough to make a difference.',
  },
];

export function lectureAt(seconds) {
  const time = Math.max(0, Math.min(duration, Number(seconds) || 0));
  const chapter = chapters.findLastIndex(part => part.starts[0] <= time);
  const part = chapters[Math.max(0, chapter)];
  const line = Math.max(0, part.starts.findLastIndex(start => start <= time));
  return { time, chapter: Math.max(0, chapter), line, text: part.lines[line] };
}

export function localReply(question, chapter, recent = []) {
  const prior = recent.at(-1);
  const current = lessons[chapter];
  const exact = lessons.find(lesson => lesson.question === question);
  const topic = exact || (current.keywords.test(question) ? current : lessons.find(lesson => lesson.keywords.test(question)));
  if (topic) return prior?.answer === topic.answer ? topic.example : topic.answer;
  if (/why|example|mean|again|explain|how so|what about that/i.test(question)) {
    const previousTopic = prior && lessons.find(lesson => lesson.answer === prior.answer || lesson.example === prior.answer);
    return previousTopic?.example ?? current.answer;
  }
  return 'Which part of the argument troubles you? One question we might put is this. ' + current.question;
}

// Mounted by the room HUD. The scene samples continuously between DOM updates.
export const lectureStage = { media: null, aside: null, answering: false, returning: false };
