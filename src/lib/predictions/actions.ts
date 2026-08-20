'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUserForAction } from '@/lib/auth/guards';
import { savePredictionIfOpen } from '@/lib/predictions/save';
import { PROBLEM_MESSAGE, validatePrediction, MAX_GOALS } from '@/lib/scoring';

export type SaveState = {
  error?: string;
  savedAt?: number;
};

const goals = z.coerce
  .number({ message: 'Въведи брой голове.' })
  .int('Головете трябва да са цяло число.')
  .min(0, 'Головете не могат да са отрицателни.')
  .max(MAX_GOALS, `Головете не могат да са повече от ${MAX_GOALS}.`);

const schema = z.object({
  matchId: z.coerce.number().int().positive(),
  htHome: goals,
  htAway: goals,
  ftHome: goals,
  ftAway: goals,
});

/** Запазва или променя прогноза: проверява кой си, после дали е валидно. */
export async function savePredictionAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const user = await requireUserForAction();

  const parsed = schema.safeParse({
    matchId: formData.get('matchId'),
    htHome: formData.get('htHome'),
    htAway: formData.get('htAway'),
    ftHome: formData.get('ftHome'),
    ftAway: formData.get('ftAway'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Прогнозата не е валидна.' };
  }

  const { matchId, htHome, htAway, ftHome, ftAway } = parsed.data;

  const prediction = {
    ht: { home: htHome, away: htAway },
    ft: { home: ftHome, away: ftAway },
  };

  const problems = validatePrediction(prediction);
  if (problems[0]) {
    return { error: PROBLEM_MESSAGE[problems[0]] };
  }

  const saved = await savePredictionIfOpen(user.id, matchId, prediction);

  if (!saved) {
    return {
      error: 'Прозорецът за прогнози на този мач е затворен (затваря 1 час преди началото).',
    };
  }

  revalidatePath('/matches');
  revalidatePath('/me');

  return { savedAt: Date.now() };
}
