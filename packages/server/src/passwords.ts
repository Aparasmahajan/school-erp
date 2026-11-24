import bcrypt from 'bcryptjs';

const ROUNDS = 10;

export const hashPassword = (password: string) => bcrypt.hash(password, ROUNDS);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

/**
 * Compared against when the email is unknown, so a login attempt takes the same time
 * whether or not the account exists.
 */
export const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-just-for-timing', ROUNDS);
