export async function read(response: Response) {
  const body: unknown = await response.json();
  return UserSchema.parse(body);
}
