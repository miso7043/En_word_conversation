import { foreignKey, integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

export const lessons = pgTable('lessons', {
  id: text().primaryKey(),
  title: text().notNull(),
  date: timestamp({ withTimezone: true, mode: 'date' }),
  description: text().array().notNull(),
  tags: text().array().notNull().default([]),
  level: text(),
  revision: text().notNull().default(''),
});

export const conversations = pgTable('conversations', {
  lessonId: text('lesson_id').notNull().references(() => lessons.id, { onDelete: 'cascade' }),
  ordinal: integer().notNull(),
  title: text(),
  description: text().array().notNull(),
}, table => [primaryKey({ columns: [table.lessonId, table.ordinal] })]);

export const lines = pgTable('lines', {
  lessonId: text('lesson_id').notNull(),
  conversationOrdinal: integer('conversation_ordinal').notNull(),
  ordinal: integer().notNull(),
  speaker: text().notNull(),
  text: text().notNull(),
  meaning: text(),
  keyPhrase: text('key_phrase').array().notNull().default([]),
}, table => [
  primaryKey({ columns: [table.lessonId, table.conversationOrdinal, table.ordinal] }),
  foreignKey({
    columns: [table.lessonId, table.conversationOrdinal],
    foreignColumns: [conversations.lessonId, conversations.ordinal],
  }).onDelete('cascade'),
]);

export const progress = pgTable('progress', {
  userId: text('user_id').notNull(),
  lessonId: text('lesson_id').notNull().references(() => lessons.id, { onDelete: 'cascade' }),
  position: integer().notNull(),
}, table => [primaryKey({ columns: [table.userId, table.lessonId] })]);
