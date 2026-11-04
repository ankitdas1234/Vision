import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

/** Modern password hashing (bcrypt). Never store or log plain-text passwords. */
export const passwordService = {
  hash: (plain: string) => bcrypt.hash(plain, SALT_ROUNDS),
  compare: (plain: string, hash: string) => bcrypt.compare(plain, hash),
};
