import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { isParticipant } from '@/lib/duel/service'
import type { DuelMode } from '@/lib/duel/rules'

interface Ctx {
  params: Promise<{ id: string }>
}

export interface DuelDetail {
  id: string
  mode: DuelMode
  rounds: number
  status: string
  direction: string
  currentRound: number
  yourTurn: boolean
  yourWins: number
  theirWins: number
  youWon: boolean | null
  opponent: { id: string; name: string | null; image: string | null }
  /** One entry per round played by either side, oldest first. */
  scoreboard: Array<{ round: number; yours: number | null; theirs: number | null }>
}

export async function GET(_req: Request, { params }: Ctx) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { id } = await params

  const duel = await db.duel.findUnique({
    where: { id },
    include: {
      challenger: { select: { id: true, name: true, image: true } },
      opponent: { select: { id: true, name: true, image: true } },
      duelRounds: { orderBy: { round: 'asc' } },
    },
  })
  if (!duel || !isParticipant(duel, userId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const youAreChallenger = duel.challengerId === userId
  const played = [...new Set(duel.duelRounds.map(r => r.round))].sort((a, b) => a - b)

  const detail: DuelDetail = {
    id: duel.id,
    mode: duel.mode as DuelMode,
    rounds: duel.rounds,
    status: duel.status,
    direction: duel.direction,
    currentRound: duel.currentRound,
    yourTurn: duel.turnUserId === userId,
    yourWins: youAreChallenger ? duel.challengerWins : duel.opponentWins,
    theirWins: youAreChallenger ? duel.opponentWins : duel.challengerWins,
    youWon: duel.status !== 'FINISHED' ? null : duel.winnerId === null ? null : duel.winnerId === userId,
    opponent: youAreChallenger ? duel.opponent : duel.challenger,
    scoreboard: played.map(round => ({
      round,
      yours: duel.duelRounds.find(r => r.round === round && r.userId === userId)?.score ?? null,
      theirs: duel.duelRounds.find(r => r.round === round && r.userId !== userId)?.score ?? null,
    })),
  }

  return NextResponse.json(detail)
}

/** Decline a challenge, or give up a duel in progress. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const duel = await db.duel.findUnique({ where: { id } })
  if (!duel || !isParticipant(duel, session.user.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (duel.status !== 'ACTIVE') return NextResponse.json({ ok: true })

  await db.duel.update({
    where: { id },
    data: { status: 'DECLINED', turnUserId: null, finishedAt: new Date() },
  })
  return NextResponse.json({ ok: true })
}
