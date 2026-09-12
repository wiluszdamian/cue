import { z } from 'zod';

export const UserSchema = z.strictObject({
  id: z.string(),
  email: z.string(),
});
