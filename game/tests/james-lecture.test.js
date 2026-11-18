import test from 'node:test';
import assert from 'node:assert/strict';
import { chapters, duration, lectureAt, lessons, localReply } from '../src/world/jamesLecture.js';
import { POST } from '../../api/lecture-question.mjs';

test('one recorded hour has uninterrupted caption coverage and every chalk cue lands in its section', () => {
  const offsets = chapters.flatMap(part => part.starts);
  assert.equal(offsets[0], 0);
  assert.ok(offsets.every((x,i) => Number.isFinite(x) && (!i || x > offsets[i-1])));
  assert.ok(offsets.at(-1) < duration && duration - offsets.at(-1) < 12);
  for (const [i,part] of chapters.entries()) {
    assert.equal(part.lines.length,part.starts.length);
    assert.equal(part.board.length,lessons[i].marks.length);
    for (const mark of lessons[i].marks) {
      const pos = lectureAt(part.starts[mark]);
      assert.deepEqual([pos.chapter,pos.line,pos.text],[i,mark,part.lines[mark]]);
    }
  }
  assert.equal(lectureAt(duration).text, 'That is enough for this morning.');
});

test('an interruption can address a later topic without advancing the lecture', async () => {
  const original = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const make = (fields) => new Request('http://localhost/api/lecture-question', {
      method:'POST',headers:{ origin:'http://localhost',host:'localhost' },
      body:JSON.stringify({chapter:0,line:6,question:'What if Buckle could predict a whole population?',...fields}),
    });
    const response = await POST(make({}));
    assert.deepEqual(await response.json(), {answer:lessons[3].answer,source:'authored'});
    assert.equal((await POST(make({line:9999}))).status,400);
    assert.equal((await POST(make({recent:[{question:1}]}))).status,400);
    assert.equal(localReply('Explain that again',1), lessons[1].answer);
  } finally {
    if (original !== undefined) process.env.OPENAI_API_KEY = original;
  }
});
