import { findUserByTelegramId, createUser, updateUser } from '../database/queries.js';

export function getOrCreateUser(ctx) {
  const { id, username, first_name } = ctx.from;
  let user = findUserByTelegramId(id);
  if (!user) {
    user = createUser({ telegramId: id, username, firstName: first_name });
  }
  return user;
}

export { findUserByTelegramId, createUser, updateUser };
