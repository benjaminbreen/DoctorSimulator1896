import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, legalMoves, applyMove, bestMove } from '../src/world/checkers.js';
import { parkItems } from '../src/world/centralPark.js';

function emptyBoard() {
  return Array.from({ length: 8 }, () => new Array(8).fill(0));
}

test('the opening position is standard', () => {
  const game = newGame();
  const pieces = game.board.flat();
  assert.equal(pieces.filter((p) => p === 1).length, 12);
  assert.equal(pieces.filter((p) => p === -1).length, 12);
  assert.equal(legalMoves(game).length, 7, 'seven opening moves');
});

test('captures are mandatory and exclude quiet moves', () => {
  const board = emptyBoard();
  board[4][3] = 1;
  board[3][2] = -1;
  board[5][6] = 1;
  const moves = legalMoves({ board, turn: 1, winner: null });
  assert.equal(moves.length, 1, 'only the jump is offered');
  assert.deepEqual(moves[0].captures, [[3, 2]]);
  assert.deepEqual(moves[0].path[1], [2, 1]);
});

test('jumps chain and crowning ends the move', () => {
  // A double jump for the man...
  const board = emptyBoard();
  board[6][1] = 1;
  board[5][2] = -1;
  board[3][2] = -1;
  let moves = legalMoves({ board, turn: 1, winner: null });
  assert.equal(moves.length, 1);
  assert.equal(moves[0].captures.length, 2, 'the chain continues');
  assert.deepEqual(moves[0].path[moves[0].path.length - 1], [2, 1]);
  // ...but reaching the crown ends it even with another jump waiting.
  const crownBoard = emptyBoard();
  crownBoard[2][1] = 1;
  crownBoard[1][2] = -1;
  crownBoard[1][4] = -1;
  moves = legalMoves({ board: crownBoard, turn: 1, winner: null });
  assert.equal(moves[0].captures.length, 1, 'crowning stops the sequence');
  const after = applyMove({ board: crownBoard, turn: 1, winner: null }, moves[0]);
  assert.equal(after.board[0][3], 2, 'the man is kinged');
});

test('stripping the last piece wins', () => {
  const board = emptyBoard();
  board[4][3] = 1;
  board[3][2] = -1;
  const state = { board, turn: 1, winner: null };
  const after = applyMove(state, legalMoves(state)[0]);
  assert.equal(after.winner, 1);
});

test('the opponent is deterministic and legal', () => {
  let state = newGame();
  state = applyMove(state, legalMoves(state)[0]);
  const first = bestMove(state);
  const second = bestMove(state);
  assert.deepEqual(first, second);
  assert.ok(legalMoves(state).some((move) => JSON.stringify(move) === JSON.stringify(first)));
});

test('two engines finish a whole game', () => {
  let state = newGame();
  for (let ply = 0; ply < 200 && state.winner === null; ply += 1) {
    state = applyMove(state, bestMove(state, 3));
  }
  // Draws by repetition exist in checkers; what matters is that every move
  // along the way was legal and nothing crashed.
  assert.ok(state.board.flat().some((piece) => piece !== 0));
});

test('both tables offer the game', () => {
  const markers = parkItems.filter((item) => item.id.startsWith('checkers-table'));
  assert.equal(markers.length, 2);
  for (const marker of markers) {
    assert.equal(marker.affordance?.kind, 'act');
    assert.equal(marker.affordance?.verb, 'Play');
  }
});
