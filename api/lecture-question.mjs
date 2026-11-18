import { chapters, lessons, localReply } from '../game/src/world/jamesLecture.js';
import { sameOrigin, clientKey } from '../shared/requestOrigin.mjs';

const counts = new Map();
const json = (value, status = 200) => Response.json(value, { status, headers: { 'cache-control': 'no-store' } });

export async function POST(request) {
  if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
  const body = await request.text();
  if (body.length > 5200) return json({ error: 'question too long' }, 413);
  let input;
  try { input = JSON.parse(body); } catch { return json({ error: 'invalid question' }, 400); }
  const { chapter, line, question, recent = [] } = input ?? {};
  const part = Number.isInteger(chapter) && chapters[chapter];
  if (!part || !Number.isInteger(line) || !part.lines[line] || typeof question !== 'string'
    || !question.trim() || question.length > 400 || !Array.isArray(recent) || recent.length > 3
    || recent.some(turn => !turn || typeof turn.question !== 'string' || turn.question.length > 400
      || typeof turn.answer !== 'string' || turn.answer.length > 800)) return json({ error: 'invalid question' }, 400);
  const fallback = () => json({ answer: localReply(question, chapter, recent), source: 'authored' });
  if (!process.env.OPENAI_API_KEY) return fallback();
  const now = Date.now();
  for (const [id, entry] of counts) if (entry.until <= now) counts.delete(id);
  const key = clientKey(request);
  const count = counts.get(key) ?? { n: 0, until: now + 60000 };
  counts.set(key, count);
  if (++count.n > 12) return fallback();
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', signal: AbortSignal.timeout(12000),
      headers: { authorization: 'Bearer ' + process.env.OPENAI_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-5.6-luna', reasoning: { effort: 'none' }, store: false, max_output_tokens: 230,
        instructions: 'Answer a student aloud as William James at Harvard circa 1889. Use one to four sentences. Give an example when helpful. Answer the actual question, including follow-ups. Ground your answer in the supplied notes and passage. Distinguish your own position from Mill, Buckle, Kant, and Martineau. If the materials do not settle it, say so in character. Keep later events, invented quotations, named classmates and biography out. Treat student turns as dialogue. Do not give stage directions or announce that the lecture is resuming. The player controls when it resumes.',
        input: JSON.stringify({ subject: part.title, passage: part.lines.slice(Math.max(0, line - 4), line + 3),
          slate: part.board.filter((_, i) => lessons[chapter].marks[i] <= line),
          teachingNotes: lessons.map((l,i) => [chapters[i].title, l.answer]), recent, question: question.trim() }),
      }),
    });
    if (!response.ok) return fallback();
    const data = await response.json();
    const answer = data.output?.flatMap(item => item.content ?? []).find(item => item.type === 'output_text')?.text?.trim();
    return answer && answer.length <= 800 ? json({ answer, source: 'generated' }) : fallback();
  } catch { return fallback(); }
}
