export async function read(response: Response) {
  const body: any = await response.json();
  return body as any;
}
