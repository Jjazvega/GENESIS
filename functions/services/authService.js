export const getBearerToken = (request) => {
  const header = request.get?.('authorization') || request.headers?.authorization || '';
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
};
