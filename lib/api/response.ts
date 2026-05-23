export type ApiSuccessResponse<T> = {
  data: T;
};

export function jsonData<T>(data: T, init?: ResponseInit): Response {
  return Response.json(
    {
      data,
    } satisfies ApiSuccessResponse<T>,
    init,
  );
}
