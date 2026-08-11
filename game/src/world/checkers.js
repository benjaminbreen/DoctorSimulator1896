// Straight checkers (American rules), framework-free and deterministic:
// men move diagonally forward, captures are mandatory, jumps chain until
// they run dry, crowning ends the move, kings move both ways. The opponent
// is a fixed-depth alpha-beta search with deterministic tie-breaks — the
// simulation decides every move; nothing here is rendered or random.
//
// Board: 8x8, row 0 at the far side. Pieces sit on dark squares
// ((row + col) % 2 === 1). 1/2 = player man/king moving toward row 0;
// -1/-2 = opponent man/king moving toward row 7.

export function newGame() {
  const board = [];
  for (let r = 0; r < 8; r += 1) {
    board.push(new Array(8).fill(0));
    for (let c = 0; c < 8; c += 1) {
      if ((r + c) % 2 !== 1) continue;
      if (r < 3) board[r][c] = -1;
      if (r > 4) board[r][c] = 1;
    }
  }
  return { board, turn: 1, winner: null };
}

function inside(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function directions(piece) {
  if (Math.abs(piece) === 2) return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  return piece > 0 ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
}

function crowns(piece, row) {
  return (piece === 1 && row === 0) || (piece === -1 && row === 7);
}

// All jump sequences for one piece, each a complete move. Crowning mid-jump
// ends the sequence by rule.
function jumpsFrom(board, r, c, piece, path, captures, out) {
  let extended = false;
  for (const [dr, dc] of directions(piece)) {
    const mr = r + dr;
    const mc = c + dc;
    const tr = r + 2 * dr;
    const tc = c + 2 * dc;
    if (!inside(tr, tc) || board[tr][tc] !== 0) continue;
    const mid = board[mr][mc];
    if (mid === 0 || Math.sign(mid) === Math.sign(piece)) continue;
    if (captures.some(([cr, cc]) => cr === mr && cc === mc)) continue;
    extended = true;
    const nextCaptures = [...captures, [mr, mc]];
    const nextPath = [...path, [tr, tc]];
    if (crowns(piece, tr)) {
      out.push({ path: nextPath, captures: nextCaptures });
      continue;
    }
    const scratch = board[r][c];
    board[r][c] = 0;
    const taken = board[mr][mc];
    board[mr][mc] = 0;
    board[tr][tc] = piece;
    jumpsFrom(board, tr, tc, piece, nextPath, nextCaptures, out);
    board[r][c] = scratch;
    board[mr][mc] = taken;
    board[tr][tc] = 0;
  }
  if (!extended && captures.length > 0) out.push({ path, captures });
}

// Legal moves for the side to play: jump sequences if any exist, otherwise
// the plain diagonal steps.
export function legalMoves(state) {
  const { board, turn } = state;
  const jumps = [];
  const steps = [];
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const piece = board[r][c];
      if (piece === 0 || Math.sign(piece) !== turn) continue;
      jumpsFrom(board, r, c, piece, [[r, c]], [], jumps);
      if (jumps.length > 0) continue;
      for (const [dr, dc] of directions(piece)) {
        const tr = r + dr;
        const tc = c + dc;
        if (inside(tr, tc) && board[tr][tc] === 0) {
          steps.push({ path: [[r, c], [tr, tc]], captures: [] });
        }
      }
    }
  }
  return jumps.length > 0 ? jumps : steps;
}

export function applyMove(state, move) {
  const board = state.board.map((row) => row.slice());
  const [fromR, fromC] = move.path[0];
  const [toR, toC] = move.path[move.path.length - 1];
  let piece = board[fromR][fromC];
  board[fromR][fromC] = 0;
  for (const [r, c] of move.captures) board[r][c] = 0;
  if (crowns(piece, toR)) piece = Math.sign(piece) * 2;
  board[toR][toC] = piece;
  const next = { board, turn: -state.turn, winner: null };
  if (legalMoves(next).length === 0) next.winner = state.turn;
  return next;
}

// Evaluation from the player's (+1) point of view: material, advancement,
// a nudge for holding the middle.
function evaluate(board) {
  let score = 0;
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const piece = board[r][c];
      if (piece === 0) continue;
      const sign = Math.sign(piece);
      score += sign * (Math.abs(piece) === 2 ? 160 : 100);
      score += sign * (sign > 0 ? 7 - r : r) * 2;
      if (c > 1 && c < 6 && r > 1 && r < 6) score += sign * 3;
    }
  }
  return score;
}

function alphaBeta(state, depth, alpha, beta) {
  if (state.winner !== null) return state.winner * 10000;
  if (depth === 0) return evaluate(state.board);
  const moves = legalMoves(state);
  if (state.turn > 0) {
    let best = -Infinity;
    for (const move of moves) {
      best = Math.max(best, alphaBeta(applyMove(state, move), depth - 1, alpha, beta));
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  }
  let best = Infinity;
  for (const move of moves) {
    best = Math.min(best, alphaBeta(applyMove(state, move), depth - 1, alpha, beta));
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

// The opponent's move, deterministic: first-found among equals in stable
// generation order.
export function bestMove(state, depth = 5) {
  const moves = legalMoves(state);
  if (moves.length === 0) return null;
  let chosen = moves[0];
  let bestScore = state.turn > 0 ? -Infinity : Infinity;
  for (const move of moves) {
    const score = alphaBeta(applyMove(state, move), depth - 1, -Infinity, Infinity);
    if (state.turn > 0 ? score > bestScore : score < bestScore) {
      bestScore = score;
      chosen = move;
    }
  }
  return chosen;
}
