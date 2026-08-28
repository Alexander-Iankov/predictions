import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import type { Breakdown } from '@/lib/scoring';

/**
 * Имената на колоните в базата са snake_case — drizzle го прави автоматично
 * заради `casing: 'snake_case'` в drizzle.config.ts и в src/db/index.ts.
 */

export const userRole = pgEnum('user_role', ['user', 'admin']);
export const userStatus = pgEnum('user_status', ['pending', 'active', 'blocked']);
export const matchStatus = pgEnum('match_status', ['scheduled', 'finished', 'postponed']);
export const resultSource = pgEnum('result_source', ['scrape', 'manual']);

/**
 * Ръчно решение на админа за прозореца на един мач.
 * 'auto' значи „по правилото" — отворен до 1 час преди началото.
 */
export const predictionWindow = pgEnum('prediction_window', ['auto', 'open', 'locked']);
export const scrapeTrigger = pgEnum('scrape_trigger', ['cron', 'admin']);
export const scrapeStatus = pgEnum('scrape_status', ['running', 'success', 'error']);

const now = () => timestamp({ withTimezone: true }).notNull().defaultNow();

export const users = pgTable(
  'users',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** винаги пази малки букви — нормализира се при запис */
    email: text().notNull(),
    passwordHash: text().notNull(),
    firstName: text().notNull(),
    lastName: text().notNull(),
    role: userRole().notNull().default('user'),
    status: userStatus().notNull().default('pending'),
    createdAt: now(),
    lastLoginAt: timestamp({ withTimezone: true }),
  },
  (table) => [unique('users_email_key').on(table.email)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** самият токен не се пази — само sha256 от него */
    tokenHash: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: now(),
  },
  (table) => [
    unique('sessions_token_hash_key').on(table.tokenHash),
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_expires_at_idx').on(table.expiresAt),
  ],
);

/** Еднократни линкове за смяна на парола, издавани от админа. */
export const passwordResets = pgTable(
  'password_resets',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    usedAt: timestamp({ withTimezone: true }),
    createdAt: now(),
  },
  (table) => [unique('password_resets_token_hash_key').on(table.tokenHash)],
);

export const teams = pgTable(
  'teams',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    /** името, както е в източника */
    name: text().notNull(),
    sourceUrl: text(),
    /**
     * Номерът на клуба в bgclubs.eu. Емблемата се сваля веднъж по него от
     * media.bgclubs.eu и се сервира от public/logos/<crestId>.png.
     */
    crestId: integer(),
    createdAt: now(),
  },
  (table) => [unique('teams_name_key').on(table.name)],
);

/** Ако източникът преименува отбор, псевдонимът го връзва към същия ред. */
export const teamAliases = pgTable('team_aliases', {
  alias: text().primaryKey(),
  teamId: integer()
    .notNull()
    .references(() => teams.id, { onDelete: 'cascade' }),
});

export const rounds = pgTable(
  'rounds',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    number: integer().notNull(),
    /** "I кръг", както го пише източникът */
    label: text().notNull(),
    /**
     * Замразен кръг: обновяването от източника не пипа мачовете в него.
     * Ползва се, когато резултатите са уточнени ръчно и източникът не бива да
     * ги връща назад.
     */
    lockedForUpdates: boolean().notNull().default(false),
  },
  (table) => [unique('rounds_number_key').on(table.number)],
);

export const matches = pgTable(
  'matches',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    roundId: integer()
      .notNull()
      .references(() => rounds.id),
    homeTeamId: integer()
      .notNull()
      .references(() => teams.id),
    awayTeamId: integer()
      .notNull()
      .references(() => teams.id),
    /**
     * UTC. Когато източникът е обявил само дата, тук стои 09:00 българско
     * време — най-ранният час, който се играе — а timeKnown е false.
     * Заключването се смята оттук, така че по-рано от реалното начало.
     */
    kickoffAt: timestamp({ withTimezone: true }).notNull(),
    timeKnown: boolean().notNull().default(false),
    status: matchStatus().notNull().default('scheduled'),
    /**
     * Ръчно отваряне или заключване на прозореца от админа, независимо от часа.
     * Стойността се пази само тук — самото правило живее в src/lib/lock.ts и
     * src/lib/lock-sql.ts, за да не се разминат UI-ът и заявките.
     */
    predictionWindow: predictionWindow().notNull().default('auto'),
    htHome: smallint(),
    htAway: smallint(),
    ftHome: smallint(),
    ftAway: smallint(),
    /** 'manual' има предимство пред 'scrape' — ръчното въведено не се презаписва */
    htSource: resultSource(),
    ftSource: resultSource(),
    /** текстът с резултата от източника — за диагностика при спорен мач */
    rawResult: text(),
    scoredAt: timestamp({ withTimezone: true }),
    createdAt: now(),
    updatedAt: now(),
  },
  (table) => [
    unique('matches_round_home_away_key').on(table.roundId, table.homeTeamId, table.awayTeamId),
    index('matches_kickoff_at_idx').on(table.kickoffAt),
    index('matches_round_id_idx').on(table.roundId),
    check('matches_no_self_play', sql`${table.homeTeamId} <> ${table.awayTeamId}`),
    // Резултатът е или напълно въведен, или изобщо не е — половин резултат
    // би значело, че точкуването не знае какво да прави.
    check(
      'matches_result_pairs',
      sql`(${table.ftHome} is null) = (${table.ftAway} is null)
          and (${table.htHome} is null) = (${table.htAway} is null)`,
    ),
    // Полувремето не може да е повече от крайния резултат.
    check(
      'matches_ht_le_ft',
      sql`${table.htHome} is null or ${table.ftHome} is null
          or (${table.htHome} <= ${table.ftHome} and ${table.htAway} <= ${table.ftAway})`,
    ),
  ],
);

export const predictions = pgTable(
  'predictions',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    matchId: integer()
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    htHome: smallint().notNull(),
    htAway: smallint().notNull(),
    ftHome: smallint().notNull(),
    ftAway: smallint().notNull(),
    createdAt: now(),
    updatedAt: now(),
  },
  (table) => [
    unique('predictions_user_match_key').on(table.userId, table.matchId),
    index('predictions_match_id_idx').on(table.matchId),
    // Същото правило като в validatePrediction() — базата е последната преграда,
    // ако някога се появи втори път за запис извън server action-а.
    check(
      'predictions_ht_le_ft',
      sql`${table.htHome} between 0 and 30 and ${table.htAway} between 0 and 30
          and ${table.ftHome} between 0 and 30 and ${table.ftAway} between 0 and 30
          and ${table.htHome} <= ${table.ftHome} and ${table.htAway} <= ${table.ftAway}`,
    ),
  ],
);

export const predictionScores = pgTable('prediction_scores', {
  predictionId: integer()
    .primaryKey()
    .references(() => predictions.id, { onDelete: 'cascade' }),
  points: integer().notNull(),
  /** всеки критерий поотделно; null значи "не се точкува" (липсва полувреме) */
  breakdown: jsonb().$type<Breakdown>().notNull(),
  partial: boolean().notNull().default(false),
  computedAt: now(),
});

export const scrapeRuns = pgTable('scrape_runs', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  trigger: scrapeTrigger().notNull(),
  triggeredByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
  status: scrapeStatus().notNull().default('running'),
  startedAt: now(),
  finishedAt: timestamp({ withTimezone: true }),
  matchesSeen: integer().notNull().default(0),
  matchesUpdated: integer().notNull().default(0),
  predictionsScored: integer().notNull().default(0),
  /**
   * Отпечатък на парснатия график (виж scheduleFingerprint). Съвпадне ли с
   * предишния, нищо съществено не се е променило. Хешира се съдържанието, а не
   * страницата — тя носи cache-busting timestamp и се различава всеки път.
   */
  contentSha256: text(),
  error: text(),
});

export const auditLog = pgTable(
  'audit_log',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    actorUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    action: text().notNull(),
    entity: text(),
    before: jsonb(),
    after: jsonb(),
    at: now(),
  },
  (table) => [index('audit_log_at_idx').on(table.at)],
);

export const settings = pgTable('settings', {
  key: text().primaryKey(),
  value: text().notNull(),
  updatedAt: now(),
});

export const usersRelations = relations(users, ({ many }) => ({
  predictions: many(predictions),
  sessions: many(sessions),
}));

export const roundsRelations = relations(rounds, ({ many }) => ({
  matches: many(matches),
}));

export const matchesRelations = relations(matches, ({ one, many }) => ({
  round: one(rounds, { fields: [matches.roundId], references: [rounds.id] }),
  homeTeam: one(teams, { fields: [matches.homeTeamId], references: [teams.id] }),
  awayTeam: one(teams, { fields: [matches.awayTeamId], references: [teams.id] }),
  predictions: many(predictions),
}));

export const predictionsRelations = relations(predictions, ({ one }) => ({
  user: one(users, { fields: [predictions.userId], references: [users.id] }),
  match: one(matches, { fields: [predictions.matchId], references: [matches.id] }),
  score: one(predictionScores, {
    fields: [predictions.id],
    references: [predictionScores.predictionId],
  }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Match = typeof matches.$inferSelect;
export type Prediction = typeof predictions.$inferSelect;
export type PredictionScore = typeof predictionScores.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type Round = typeof rounds.$inferSelect;
export type ScrapeRun = typeof scrapeRuns.$inferSelect;
