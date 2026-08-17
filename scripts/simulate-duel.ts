// Plays a whole duel through lib/duel/service against the real database, with
// two throwaway accounts, and checks the state machine at every step: who holds
// the turn, when a round resolves, when the match ends and who won.
//
// Everything it creates is deleted at the end, including on failure.
import 'dotenv/config'
import { db } from '../lib/db'
import { submitRound, listDuels, pendingDuelCount } from '../lib/duel/service'
import { winsNeeded, ROUND_SIZE, ROUND_NEW_WORDS } from '../lib/duel/rules'
import { buildExercises } from '../lib/study/build'
import { getCourseWithLevel } from '../lib/current-course'
import { courseDirections, defaultDirection } from '../lib/courses'

let failures = 0

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) {
    failures++
    console.log(`❌ ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`)
  } else {
    console.log(`✅ ${label}`)
  }
}

const STAMP = `duel-sim-${process.pid}`

async function main() {
  // Deliberately mismatched courses: Alice learns Swedish, Bob learns Dutch.
  // They share no content pair, which is exactly the case the duel has to
  // support — each answers in their own course.
  const [alice, bob] = await Promise.all([
    db.user.create({
      data: {
        email: `${STAMP}-a@example.invalid`, name: 'Sim Alice',
        nativeLanguage: 'fr', learningLanguage: 'sv', levels: { sv: 'A2' },
      },
    }),
    db.user.create({
      data: {
        email: `${STAMP}-b@example.invalid`, name: 'Sim Bob',
        nativeLanguage: 'fr', learningLanguage: 'nl', levels: { nl: 'B1' },
      },
    }),
  ])

  const duel = await db.duel.create({
    data: {
      pair: 'sv-fr',
      direction: 'FR_SV',
      mode: 'CLASSIC',
      rounds: 3,
      challengerId: alice.id,
      opponentId: bob.id,
      turnUserId: alice.id,
    },
  })

  const reload = () => db.duel.findUniqueOrThrow({ where: { id: duel.id } })
  // Rounds are played as sessions in the app; the state machine only needs an id
  const session = async (userId: string) => (await db.studySession.create({ data: { userId } })).id

  const play = async (userId: string, score: number) => {
    const current = await reload()
    return submitRound({
      duel: current,
      userId,
      round: current.currentRound,
      score,
      correct: 0,
      approx: 0,
      wrong: 0,
      sessionId: await session(userId),
    })
  }

  check('challenger opens', (await reload()).turnUserId, alice.id)
  check('nothing pending for the opponent yet', await pendingDuelCount(bob.id), 0)

  // Round 1 — Alice plays first, the turn must pass to Bob with nothing resolved
  const r1a = await play(alice.id, 80)
  check('round 1 not resolved on the first half', r1a.resolved, false)
  check('opponent score stays hidden', r1a.theirScore, null)
  check('turn passes to the opponent', (await reload()).turnUserId, bob.id)
  check('the duel now shows up as pending for them', await pendingDuelCount(bob.id), 1)
  check('and not for the player who just moved', await pendingDuelCount(alice.id), 0)

  const r1b = await play(bob.id, 60)
  check('round 1 resolves on the second half', r1b.resolved, true)
  check('the higher score takes it', r1b.roundWinnerId, alice.id)
  let state = await reload()
  check('round win recorded for the challenger', state.challengerWins, 1)
  check('the next round opens on the challenger', state.turnUserId, alice.id)
  check('round counter advanced', state.currentRound, 2)

  // Round 2 — a tie gives nobody the point but still advances the duel
  await play(alice.id, 70)
  const r2 = await play(bob.id, 70)
  check('a tied round has no winner', r2.roundWinnerId, null)
  state = await reload()
  check('a tie adds no win to either side', [state.challengerWins, state.opponentWins], [1, 0])
  check('the duel goes on', state.status, 'ACTIVE')
  check('on round 3', state.currentRound, 3)

  // Round 3 — Alice reaches the majority, which ends a best-of-3
  await play(alice.id, 90)
  const r3 = await play(bob.id, 50)
  check('the duel ends', r3.duelFinished, true)
  check('the winner is the majority holder', r3.duelWinnerId, alice.id)
  state = await reload()
  check('status is final', state.status, 'FINISHED')
  check('no turn is left', state.turnUserId, null)
  check('wins add up', [state.challengerWins, state.opponentWins], [2, 0])
  check('majority of a best-of-3', state.challengerWins >= winsNeeded(3), true)
  check('finish date is stamped', state.finishedAt !== null, true)
  check('nothing pending for anyone', await pendingDuelCount(alice.id), 0)

  const listed = await listDuels(bob.id)
  check('the loser sees it as lost', listed[0].youWon, false)
  check('and reads the score from their own side', [listed[0].yourWins, listed[0].theirWins], [0, 2])
  check('the list shows what the opponent studies', listed[0].opponentLearning, 'sv')

  // Cross-course exercise drawing: each player is served their own language,
  // whatever direction the challenger agreed to.
  for (const [who, learner, expectedPair] of [['Alice', alice, 'sv-fr'], ['Bob', bob, 'nl-fr']] as const) {
    const { course, level } = await getCourseWithLevel(learner.id)
    const direction =
      courseDirections(course).find(d => d === duel.direction) ?? defaultDirection(course)
    const exercises = await buildExercises({
      userId: learner.id, course, level, direction,
      size: ROUND_SIZE, newWords: ROUND_NEW_WORDS, allowFlashcard: false,
    })
    check(`${who} gets a full round`, exercises.length, ROUND_SIZE)
    check(`${who} is served their own pair`, [...new Set(exercises.map(e => e.word.pair))], [expectedPair])
    check(`${who} gets no flashcard`, exercises.some(e => e.exerciseType === 'FLASHCARD'), false)
    check(
      `${who} answers in a direction of their own course`,
      courseDirections(course).includes(direction),
      true,
    )
  }

  return [alice.id, bob.id]
}

let created: string[] = []
main()
  .then(ids => { created = ids })
  .catch(err => { failures++; console.error('❌ crashed:', err) })
  .finally(async () => {
    // Duels, rounds and sessions all cascade from the users
    if (created.length > 0) await db.user.deleteMany({ where: { id: { in: created } } })
    else await db.user.deleteMany({ where: { email: { startsWith: STAMP } } })
    console.log(failures === 0 ? '\n✅ duel state machine OK' : `\n❌ ${failures} failure(s)`)
    process.exit(failures === 0 ? 0 : 1)
  })
