// Run the production TypeScript rules in temporary JS copies; never change game data.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import ts from 'typescript'

const root = path.resolve(import.meta.dirname, '..')
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nitian-paper-06-'))
for (const [source, name] of [['src/game/rng.ts', 'rng'], ['src/clash/cards.ts', 'cards'], ['src/clash/engine.ts', 'engine']]) {
  const text = fs.readFileSync(path.join(root, source), 'utf8').replaceAll("'../game/rng'", "'./rng.mjs'").replaceAll("'./cards'", "'./cards.mjs'")
  fs.writeFileSync(path.join(temp, `${name}.mjs`), ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText)
}
const engine = await import(pathToFileURL(path.join(temp, 'engine.mjs')).href)
const routes = {
  I: [['spring', 5, 9, 'E'], ['shift', 6, 6, 'SW'], ['spear', 7, null, 'S'], ['blade', 15, null, 'NW']],
  II: [['spear', 7, null, 'S'], ['spring', 2, 6, 'SW'], ['spear', 5, null, 'W'], ['blade', 15, null, 'NW']],
  III: [['shift', 5, 9, 'E'], ['spring', 14, 10, 'W'], ['blade', 0, null, 'SE'], ['spear', 7, null, 'W']],
  III_worse: [['shift', 5, 9, 'E'], ['spring', 14, 10, 'W'], ['blade', 0, null, 'SE'], ['spear', 2, null, 'S']],
  I_reply: [['spring', 5, 9, 'E'], ['spear', 0, null, 'S'], ['blade', 15, null, 'NW'], ['spear', 1, null, 'W']],
}
const expected = { I: [2, 0], II: [2, 0], III: [1, 1], III_worse: [1, 2], I_reply: [1, 1] }
for (const [name, steps] of Object.entries(routes)) {
  let state = engine.createGame({ seed: 'paper-06', scenario: 'study' })
  for (const [kind, to, origin, direction] of steps) {
    const card = state.hands[state.turn].find(item => item.kind === kind)
    const piece = origin === null ? undefined : state.pieces.find(item => item.pos === origin)
    const action = { type: 'play', cardId: card.id, to, direction, ...(piece ? { pieceId: piece.id } : {}) }
    const before = JSON.stringify(state), preview = engine.previewAction(state, action)
    assert.equal(JSON.stringify(state), before)
    const next = engine.applyAction(state, action)
    assert.notEqual(next, state, `${name}: illegal action`)
    assert.deepEqual(preview.state, next)
    state = next
  }
  assert.deepEqual([state.scores.xiu, state.scores.tian], expected[name])
  assert.equal(state.status, 'finished')
  for (const side of ['xiu', 'tian']) assert.deepEqual([state.hands[side].length, state.decks[side].length, state.discards[side].length], [3, 7, 2])
  console.log(`${name}: ${state.scores.xiu}:${state.scores.tian}; winner=${state.winner}; hand/deck/discard=3/7/2 each`)
}
console.log('PAPER_ENGINE_CHECK: 5 routes passed; preview unchanged and equal; cards 3/7/2 each')
